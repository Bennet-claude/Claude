// Regie: Pass auf den Spieler (aus echten Daten exakt getimet), Annahme in der Bewegung,
// Anlaufen der Gegner, Pass / Pass in den Raum / Schuss / Dribbling / Sichern und die
// Entscheidung über Abfangen und Ballverlust. Alles deterministisch aus dem Passweg-Modell
// (eval/lanes.js); Schüsse streuen über den Szenen-Zufall (w.rand, fester Seed).
//
// Weitergeführter Spielzug (w.continuous): Nach dem Pass läuft das Spiel weiter. Mitspieler
// mit Ball entscheiden selbst (Pass, Dribbling, Schuss), der Nutzer läuft mit, sprintet in die
// Tiefe oder fordert den Ball. Ende: Tor, Schuss vorbei/gehalten/geblockt, Ballverlust, Aus,
// Abseits, Zeit. Jede eigene Entscheidung wird als Momentaufnahme in w.decisions abgelegt.

import { TIMING, LANE, PLAYER, PITCH } from '../config.js';
import { clamp, distToSegment } from '../core/math.js';
import { mulberry32, hashString } from '../core/rng.js';
import { planPass, planPassTimed, planSpace, planDeflect, arrivalTime, LOFT } from './ball.js';
import { holdScript } from './ai.js';
import { sampleTrack } from './replay.js';
import {
  analyzePath, analyzeDribble, createLaneResult, createDribbleResult, isOffside, runTime,
  createRace, raceForBall, offsideLineX, classify,
} from '../eval/lanes.js';
import { evaluateOptions, evaluateSpace } from '../eval/evaluate.js';
import { resolveShot, createShotResult, GOAL } from './shot.js';

const lane = createLaneResult();
const drib = createDribbleResult();
const race = createRace();

export const SHIELD = { single: 2.8, double: 0.9, contact: 1.45, doubleRange: 2.6, foulSpeed: 4.4 };
export const MAX_DECISION = 5.0;
// Weitergeführter Spielzug
export const MOVE = {
  maxT: 22,          // s ab der ersten Annahme
  aiChain: 4,        // so viele Ballbesitze der KI hintereinander, dann endet der Zug ohne dich
  sprintT: 2.4,      // s Sprint nach einem Wisch ohne Ball
  demandT: 2.5,      // s gilt ein "Fordern"
  kickLead: 0.22,    // s Ausholen der KI bis zum Ballkontakt
  dribbleT: 1.1,     // s Dribbling der KI bis zur nächsten Entscheidung
};
const TERMINAL = new Set([
  'intercepted', 'tackled', 'dribbleLost', 'shieldLost', 'offside', 'fouled', 'hesitated',
  'goal', 'saved', 'wide', 'post', 'blocked', 'out', 'lost', 'timeout', 'stalled',
]);

export function onLoad(w) {
  const sp = w.scene.pass;
  if (sp.T) {
    w.arrivalEstimate = sp.at + sp.T;
  } else {
    const p = w.passer;
    const dx = w.receiveX - w.px[p], dy = w.receiveY - w.py[p];
    w.arrivalEstimate = sp.at + arrivalTime(Math.sqrt(dx * dx + dy * dy));
  }
  w.releaseT = w.scene.release !== undefined ? w.scene.release : Infinity;
  w.choice = null;
  w.foul = false;
  w.flight = null;
  w.carrier = -1;
  w.decisions = [];
  w.decOpen = false;
  w.scanBase = 0;
  w.actBallX = NaN; w.actBallY = NaN;
  w.directShot = null;
  w.shotInfo = null;
  w.aiDecideAt = Infinity; w.aiKick = null; w.aiDribbles = 0;
  w.nextMarkT = 0;
  w.gkDive = null;
  w.move = { t0: -1, events: [], aiChain: 0, demandT: -1, runs: [], shots: 0, userTouches: 0, lastUserTouch: -1 };
  w.rand = mulberry32(hashString(String(w.scene.id || 'szene')) ^ 0x5bd1e995);
}

const offBall = (w) => w.continuous && (w.phase === 'team' || w.phase === 'flight');
const kickDelay = (w) => (w.shielding ? 0.28 : TIMING.kickDelay);

export function onInput(w, a) {
  if (w.phase === 'done') return;
  const u = w.user;
  if (a.type === 'run') {
    if (offBall(w)) startRun(w, a.dx, a.dy);
    return;
  }
  if (a.type === 'demand') {
    if (w.phase === 'team' && w.continuous) {
      w.move.demandT = w.t;
      w.move.events.push({ t: w.t, type: 'demand' });
    }
    return;
  }
  if (w.action) return;
  if (a.type === 'pass') {
    if (a.target === u || w.team[a.target] !== w.team[u]) return;
    if (w.phase === 'pre' || w.phase === 'toUser') { w.directTarget = a.target; w.directShot = null; return; }
    if (w.phase === 'team' && a.target === w.carrier) { onInput(w, { type: 'demand' }); return; }
    if (w.phase === 'decide') startAction(w, { type: 'pass', target: a.target, kickAt: w.t + kickDelay(w), kicked: false, direct: false });
  } else if (a.type === 'space') {
    if (w.phase === 'decide') startAction(w, { type: 'space', x: a.x, y: a.y, kickAt: w.t + kickDelay(w), kicked: false });
  } else if (a.type === 'shot') {
    if (w.phase === 'pre' || w.phase === 'toUser') { w.directShot = { y: a.y, z: a.z }; w.directTarget = -1; return; }
    if (w.phase === 'decide') startAction(w, { type: 'shot', y: a.y, z: a.z, kickAt: w.t + kickDelay(w) + 0.05, kicked: false });
  } else if (a.type === 'dribble' && w.phase === 'decide') {
    startAction(w, { type: 'dribble', dx: a.dx, dy: a.dy });
  } else if (a.type === 'shield' && w.phase === 'decide' && !w.shielding) {
    startShield(w);
  }
}

function startRun(w, dx, dy) {
  const u = w.user;
  w.scripts[u] = { type: 'usprint', dx, dy, until: w.t + MOVE.sprintT };
  w.move.runs.push({ t: w.t, dx, dy, x: w.px[u], y: w.py[u] });
}

function startAction(w, a, tNow = w.t) {
  w.action = a;
  if (w.ev.action < 0 || !w.shielding) w.ev.action = tNow;
  w.phase = 'action';
  w.decisionTime = w.ev.action - w.ev.reception;
  const u = w.user;
  if (a.type === 'pass') {
    w.choice = { type: 'pass', target: a.target };
  } else if (a.type === 'space') {
    w.choice = { type: 'space', x: a.x, y: a.y };
  } else if (a.type === 'shot') {
    w.choice = { type: 'shot', y: a.y, z: a.z };
  } else if (a.type === 'dribble') {
    const dir = Math.atan2(a.dy, a.dx);
    w.choice = { type: 'dribble', dir };
    w.actBallX = w.ball.x; w.actBallY = w.ball.y;
    w.evalAtAction = evaluateOptions(w, u, dir);
    analyzeDribble(w, u, a.dx, a.dy, TIMING.dribbleHorizon, drib);
    w.dribbleInfo = {
      tackler: drib.tackler, tTackle: drib.tTackle, horizon: drib.horizon,
      gain: drib.gain, margin: drib.margin, dx: a.dx, dy: a.dy,
    };
    w.scripts[u] = { type: 'dribble', dx: a.dx, dy: a.dy };
    if (drib.tackler >= 0) w.scripts[drib.tackler] = makeIntercept(w, drib.tackler, drib.tx, drib.ty, tNow);
    scheduleReactions(w, tNow, [drib.tackler], w.px[u] + a.dx * drib.gain, w.py[u] + a.dy * drib.gain, true);
  }
  w.shielding = false;
}

// Sichern: Rücken zum Gegner, Körper zwischen Ball und Gegner. Kein Endzustand –
// aus dem Sichern heraus kann gepasst oder angedribbelt werden. Mitspieler bieten sich an.
function startShield(w) {
  const u = w.user;
  w.shielding = true;
  w.shieldStart = w.t;
  w.shieldT = 0;
  if (w.ev.action < 0) w.ev.action = w.t;
  w.shieldEval = evaluateOptions(w, u);
  w.scripts[u] = { type: 'shield' };
  // nächste Gegner und zwei Mitspieler zur Unterstützung
  let opp = -1, od = Infinity;
  for (let j = 0; j < w.n; j++) {
    if (w.team[j] === w.team[u]) continue;
    const d = Math.hypot(w.px[j] - w.px[u], w.py[j] - w.py[u]);
    if (d < od) { od = d; opp = j; }
  }
  const mates = [];
  for (let j = 0; j < w.n; j++) {
    if (j === u || w.team[j] !== w.team[u] || w.gk[j]) continue;
    mates.push([Math.hypot(w.px[j] - w.px[u], w.py[j] - w.py[u]), j]);
  }
  mates.sort((a, b) => a[0] - b[0]);
  // einer kurz im Rücken des Gegners abgewandt (Klatsch-Option), einer diagonal weiter weg
  if (mates[0]) w.pending.push({ t: w.t + LANE.reaction, i: mates[0][1], script: { type: 'support', mate: u, from: opp, ang: 0.75, dist: 7 } });
  if (mates[1]) w.pending.push({ t: w.t + LANE.reaction + 0.2, i: mates[1][1], script: { type: 'support', mate: u, from: opp, ang: -1.1, dist: 12 } });
}

function nearestMate(w, i) {
  let best = -1, bd = Infinity;
  for (let j = 0; j < w.n; j++) {
    if (j === i || w.team[j] !== w.team[i] || w.gk[j]) continue;
    const dx = w.px[j] - w.px[i], dy = w.py[j] - w.py[i];
    const d = dx * dx + dy * dy;
    if (d < bd) { bd = d; best = j; }
  }
  return best;
}

export function makeIntercept(w, j, tx, ty, t0) {
  const reaction = LANE.reaction;
  const rx = w.px[j] + w.vx[j] * reaction, ry = w.py[j] + w.vy[j] * reaction;
  const dx = tx - rx, dy = ty - ry;
  const dist = Math.sqrt(dx * dx + dy * dy) || 1e-6;
  const ux = dx / dist, uy = dy / dist;
  const gkBox = w.gk[j] && Math.abs(tx - (w.team[j] === 1 ? 1 : -1) * PITCH.length / 2) <= PITCH.penaltyDepth;
  const reach = gkBox ? LANE.gkReach : LANE.reach;
  const vmax = w.gk[j] ? PLAYER.gkSprint : PLAYER.sprint;
  const u0 = w.vx[j] * ux + w.vy[j] * uy;
  const tb = u0 < 0 ? -u0 / PLAYER.decel : 0;
  const sB = u0 < 0 ? -(u0 * u0) / (2 * PLAYER.decel) : 0;
  return {
    type: 'intercept', t0, rx, ry, ux, uy, u0: Math.min(u0, 0), tb, sB,
    uStart: u0 < 0 ? 0 : Math.min(u0, vmax), vmax, D: Math.max(0, dist - reach), arrived: false,
  };
}

// Skripte, die eine Reaktion nicht überschreiben soll
const KEEP = new Set(['gk', 'run', 'dive', 'mark', 'attack', 'urun', 'usprint']);
const KEEP_BASE = new Set(['gk', 'run']);

// Nach einer Aktion reagieren alle anderen mit 0,25 s Verzögerung.
function scheduleReactions(w, t0, skip, destX, destY, chase) {
  const tr = t0 + LANE.reaction;
  const defTeam = w.team[w.user] === 0 ? 1 : 0;
  let c1 = -1, c2 = -1, d1 = Infinity, d2 = Infinity;
  for (let j = 0; j < w.n; j++) {
    if (w.team[j] !== defTeam || w.gk[j] || skip.indexOf(j) >= 0) continue;
    const dx = w.px[j] - destX, dy = w.py[j] - destY;
    const d = dx * dx + dy * dy;
    if (d < d1) { d2 = d1; c2 = c1; d1 = d; c1 = j; } else if (d < d2) { d2 = d; c2 = j; }
  }
  for (let j = 0; j < w.n; j++) {
    if (skip.indexOf(j) >= 0 || j === w.user || j === w.ball.target) continue;
    if ((w.continuous ? KEEP : KEEP_BASE).has(w.scripts[j].type)) continue;
    if (w.team[j] === defTeam && chase && (j === c1 || j === c2)) {
      w.pending.push({ t: tr, i: j, script: { type: 'chase', speed: PLAYER.sprint * 0.95 } });
    } else {
      w.pending.push({ t: tr, i: j, hold: true });
    }
  }
}

// Die ein bis zwei Gegner, die am schnellsten beim Ballführer sein können, laufen ihn an.
// Im Bogen, so dass der gefährlichste Passweg im Deckungsschatten liegt.
function assignPressers(w, victim) {
  const u = victim;
  const ux = w.px[u], uy = w.py[u];
  const list = [];
  for (let j = 0; j < w.n; j++) {
    if (w.team[j] === w.team[u] || w.gk[j]) continue;
    const t = runTime(w.px[j], w.py[j], w.vx[j], w.vy[j], ux, uy, 1.0, PLAYER.sprint, PLAYER.accel, PLAYER.decel);
    list.push([t, j]);
  }
  list.sort((a, b) => a[0] - b[0]);
  const used = [];
  for (let k = 0; k < Math.min(2, list.length); k++) {
    const [t, j] = list[k];
    if (k === 1 && t > 1.8) break; // zweiter Mann nur, wenn er sofort doppeln kann
    // Schatten: Mitspieler, dessen Passweg dem Anläufer am nächsten liegt
    let shadow = -1, sd = Infinity;
    for (let m = 0; m < w.n; m++) {
      if (m === u || w.team[m] !== w.team[u] || w.gk[m] || used.indexOf(m) >= 0) continue;
      const dm = Math.hypot(w.px[m] - ux, w.py[m] - uy);
      if (dm > 32 || dm < 4) continue;
      const d = distToSegment(w.px[j], w.py[j], ux, uy, w.px[m], w.py[m]);
      if (d < sd) { sd = d; shadow = m; }
    }
    if (shadow >= 0) used.push(shadow);
    w.scripts[j] = { type: 'press', victim: u, shadow, at: 0, speed: k === 0 ? 7.4 : 6.6, curveFrom: 7 };
  }
}

// Nach dem eigenen Ballkontakt: Nutzer geht mit, KI-Passgeber läuft kurz weiter
function afterKick(w, passer, tx, ty, tKick) {
  const u = w.user;
  w.carrier = -1;
  if (passer === u) {
    if (w.continuous) {
      if (w.scripts[u].type !== 'usprint') w.scripts[u] = { type: 'urun', t0: tKick };
    } else {
      const sp = Math.hypot(w.vx[u], w.vy[u]);
      const dx = tx - w.px[u], dy = ty - w.py[u], dl = Math.hypot(dx, dy) || 1;
      w.scripts[u] = { type: 'ucarry', dx: dx / dl, dy: dy / dl, v0: Math.max(2, sp), vMin: 1.2, t0: tKick };
    }
  } else {
    w.scripts[passer] = holdScript(w, passer, 1.2);
  }
}

export function executePass(w, target, tKick, passer = w.user) {
  const b = w.ball;
  const bx = b.x, by = b.y;
  const r = target;
  let Px = w.px[r], Py = w.py[r], T = 0;
  const rvx = w.vx[r], rvy = w.vy[r];
  for (let k = 0; k < 4; k++) {
    const d = Math.sqrt((Px - bx) * (Px - bx) + (Py - by) * (Py - by));
    T = arrivalTime(d);
    Px = clamp(w.px[r] + rvx * T, -PITCH.length / 2 + 1, PITCH.length / 2 - 1);
    Py = clamp(w.py[r] + rvy * T, -PITCH.width / 2 + 1, PITCH.width / 2 - 1);
  }
  const byUser = passer === w.user;
  if (byUser) {
    // Bewertung genau im Moment des Passes (Passwege ändern sich bis zum Schuss)
    w.evalAtAction = evaluateOptions(w, passer);
    w.actBallX = bx; w.actBallY = by;
  }
  const offside = isOffside(w, r, bx);
  planPass(b.path, bx, by, Px, Py, tKick);
  const defTeam = w.team[r] === 0 ? 1 : 0;
  analyzePath(w, b.path, defTeam, lane);
  b.holder = -1; b.inFlight = true; b.target = r;
  const info = {
    kind: 'pass', from: passer, target: r, status: lane.status, margin: lane.margin, critical: lane.critical,
    interceptor: lane.interceptor, tInt: lane.tInt, lofted: b.path.mode === LOFT,
    dist: b.path.dist, T: b.path.T, offside, direct: byUser && !!(w.action && w.action.direct),
  };
  w.flight = info;
  if (byUser) w.passInfo = info;
  w.scripts[r] = { type: 'receive', x: Px, y: Py, tArr: tKick + b.path.T };
  const skip = [];
  if (lane.interceptor >= 0) {
    w.scripts[lane.interceptor] = makeIntercept(w, lane.interceptor, lane.ix, lane.iy, tKick);
    skip.push(lane.interceptor);
  } else if (lane.critical >= 0 && lane.margin < LANE.tight + 0.4) {
    // knapper Weg: der Gegner versucht es, kommt aber zu spät
    w.scripts[lane.critical] = makeIntercept(w, lane.critical, lane.bx, lane.by, tKick);
    skip.push(lane.critical);
  }
  scheduleReactions(w, tKick, skip, Px, Py, true);
  afterKick(w, passer, Px, Py, tKick);
  if (r === w.user) { w.phase = 'toUser'; w.arrivalEstimate = tKick + b.path.T; } else w.phase = 'flight';
}

// Pass in den Raum: Der Ball geht dorthin, wo getippt wurde. Wer zuerst dran ist, bekommt ihn.
export function executeSpace(w, tx, ty, tKick, passer = w.user) {
  const b = w.ball;
  const bx = b.x, by = b.y;
  const team = w.team[passer];
  tx = clamp(tx, -PITCH.length / 2 - 3, PITCH.length / 2 + 3);
  ty = clamp(ty, -PITCH.width / 2 - 3, PITCH.width / 2 + 3);
  const byUser = passer === w.user;
  if (byUser) {
    const ev = evaluateOptions(w, passer);
    ev.options.push(evaluateSpace(w, passer, tx, ty));
    w.evalAtAction = ev;
    w.actBallX = bx; w.actBallY = by;
  }
  planSpace(b.path, bx, by, tx, ty, tKick);
  raceForBall(w, b.path, passer, team, race);
  const win = race.winner;
  const mine = win >= 0 && w.team[win] === team;
  b.holder = -1; b.inFlight = true; b.target = mine ? win : -1;
  const f = {
    kind: 'space', from: passer, target: mine ? win : -1, winner: win, t: race.t, x: race.x, y: race.y,
    out: win < 0, margin: race.margin, status: win < 0 ? 'aus' : classify(race.margin),
    offside: mine && win !== passer && isOffside(w, win, bx), tx, ty,
    lofted: b.path.mode === LOFT, dist: b.path.dist, T: race.t, critical: race.opp, interceptor: mine ? -1 : win,
  };
  w.flight = f;
  if (byUser) w.passInfo = f;
  const skip = [];
  if (win >= 0) {
    skip.push(win);
    if (mine) w.scripts[win] = { type: 'receive', x: race.x, y: race.y, tArr: tKick + race.t };
    else w.scripts[win] = makeIntercept(w, win, race.x, race.y, tKick);
  }
  if (race.opp >= 0 && race.opp !== win && race.tOpp - race.tMate < 0.5) {
    w.scripts[race.opp] = makeIntercept(w, race.opp, race.ox, race.oy, tKick);
    skip.push(race.opp);
  }
  scheduleReactions(w, tKick, skip, win >= 0 ? race.x : tx, win >= 0 ? race.y : ty, true);
  afterKick(w, passer, tx, ty, tKick);
  if (win === w.user) { w.phase = 'toUser'; w.arrivalEstimate = tKick + race.t; } else w.phase = 'flight';
}

export function executeShot(w, shooter, aimY, aimZ, tKick) {
  const b = w.ball;
  const byUser = shooter === w.user;
  if (byUser) {
    w.evalAtAction = evaluateOptions(w, shooter);
    w.actBallX = b.x; w.actBallY = b.y;
  }
  const res = resolveShot(w, shooter, aimY, aimZ, b.path, tKick, w.rand, createShotResult());
  b.holder = -1; b.inFlight = true; b.target = -1;
  w.flight = { kind: 'shot', from: shooter, shot: res, tEvent: res.tEvent };
  if (byUser) w.shotInfo = res;
  w.move.shots++;
  w.move.events.push({ t: tKick, type: 'shot', from: shooter, xg: res.xg, result: res.result, dist: res.dist, onTarget: res.onTarget });
  const k = res.keeper;
  if (k >= 0) {
    // Torwart: Hechtsprung zur Stelle, an der er den Ball erwartet
    const reachY = w.py[k] + clamp(res.ey - w.py[k], -2.4, 2.4);
    const reachX = w.px[k] + clamp(res.ex - w.px[k], -1.2, 1.2);
    if (res.diveDir !== 0) {
      w.gkDive = { i: k, t0: tKick + res.diveAt, dir: res.diveDir, high: res.ez > 1.3 };
      w.scripts[k] = { type: 'dive', x: reachX, y: reachY, t0: tKick + res.diveAt };
    } else {
      w.scripts[k] = { type: 'dive', x: reachX, y: reachY, t0: tKick + 0.15, step: true };
    }
  }
  scheduleReactions(w, tKick, k >= 0 ? [k] : [], res.ex, res.ey, false);
  afterKick(w, shooter, res.ex, res.ey, tKick);
  w.phase = 'flight';
}

// Mindesttempo eines sauber gespielten Passes je nach Distanz (m/s Anfangsgeschwindigkeit)
export function minPassSpeed(d) {
  return clamp(8.5 + 0.32 * d, 10.5, 17);
}

function kickToUser(w) {
  const b = w.ball;
  const sp = w.scene.pass;
  b.replay = false;
  let rx = w.receiveX, ry = w.receiveY, T = sp.T;
  const uk = w.scene.players[w.user].script;
  if (T && w.replay && uk && uk.type === 'replay') {
    // Echte Daten markieren die Annahme manchmal spät → Pass wäre zu langsam.
    // Dann schneller spielen und den Spieler früher auf seinem echten Laufweg treffen.
    const d = Math.hypot(rx - b.x, ry - b.y);
    const need = (d + 0.5 * 1.5 * T * T) / T;
    if (need < minPassSpeed(d) && !sp.lofted) {
      let t2 = T;
      for (let it = 0; it < 4; it++) {
        sampleTrack(w.replay, uk.k, w.t + t2, w.tmp4);
        const dd = Math.hypot(w.tmp4[0] - b.x, w.tmp4[1] - b.y);
        const v0 = minPassSpeed(dd);
        const disc = v0 * v0 - 3 * dd;
        t2 = disc > 0 ? (v0 - Math.sqrt(disc)) / 1.5 : T;
        rx = w.tmp4[0]; ry = w.tmp4[1];
      }
      T = Math.min(T, t2);
      sampleTrack(w.replay, uk.k, w.t + T, w.tmp4);
      rx = w.tmp4[0]; ry = w.tmp4[1];
    }
  }
  // Ball kommt vor dem Fuß an: 0,4 m vom Empfänger in Richtung Passgeber
  const dx = b.x - rx, dy = b.y - ry, l = Math.hypot(dx, dy) || 1;
  const tx = rx + (dx / l) * 0.4, ty = ry + (dy / l) * 0.4;
  if (T) planPassTimed(b.path, b.x, b.y, tx, ty, T, !!sp.lofted, w.t);
  else planPass(b.path, b.x, b.y, tx, ty, w.t);
  b.holder = -1; b.inFlight = true; b.target = w.user;
  w.flight = { kind: 'toUser', from: w.passer, target: w.user };
  w.ev.passKick = w.t;
  w.arrivalEstimate = w.t + b.path.T;
  w.phase = 'toUser';
}

function releaseReplay(w) {
  w.released = true;
  for (let i = 0; i < w.n; i++) {
    if (i === w.user) continue;
    if (w.scripts[i].type === 'replay') w.scripts[i] = holdScript(w, i, 0.7);
  }
}

export function preStep(w, dt) {
  for (let k = w.pending.length - 1; k >= 0; k--) {
    const p = w.pending[k];
    if (w.t >= p.t) {
      if (p.kind === 'pressers') {
        if (w.phase === 'decide') assignPressers(w, w.user);
        else if (w.phase === 'team' && p.victim === w.carrier) assignPressers(w, w.carrier);
      } else {
        const cur = w.scripts[p.i].type;
        if (cur !== 'intercept' && cur !== 'carry' && cur !== 'receive' && cur !== 'dribble' && cur !== 'dive') {
          w.scripts[p.i] = p.hold ? holdScript(w, p.i, 0.5) : p.script;
        }
      }
      w.pending[k] = w.pending[w.pending.length - 1];
      w.pending.pop();
    }
  }
  if (w.replay && !w.released && w.t >= w.releaseT) releaseReplay(w);
  if (w.phase === 'pre') {
    if (w.t >= w.scene.pass.at - 0.22 && w.kickT[w.passer] < 0 && !w.passerAnim) {
      w.kickT[w.passer] = 0; w.passerAnim = true;
    }
    if (w.t >= w.scene.pass.at) kickToUser(w);
  }
  const a = w.action;
  if (w.phase === 'action' && a && !a.kicked && a.kickAt !== undefined && w.t >= a.kickAt) {
    a.kicked = true;
    if (a.type === 'pass') executePass(w, a.target, w.t, w.user);
    else if (a.type === 'space') executeSpace(w, a.x, a.y, w.t, w.user);
    else if (a.type === 'shot') executeShot(w, w.user, a.y, a.z, w.t);
  }
  if (w.phase === 'team') {
    if (w.aiKick && w.t >= w.aiKick.t) {
      const k = w.aiKick;
      w.aiKick = null;
      if (k.type === 'pass' && isOffside(w, k.target, w.ball.x)) {
        // Mitspieler ist inzwischen ins Abseits gelaufen: Pass abbrechen, neu entscheiden
        w.scripts[w.carrier] = { type: 'carry', speed: 3 };
        w.aiDecideAt = w.t + 0.2;
        w.move.events.push({ t: w.t, type: 'held', target: k.target });
      } else if (k.type === 'pass') executePass(w, k.target, w.t, w.carrier);
      else executeShot(w, w.carrier, k.y, k.z, w.t);
    } else if (!w.aiKick && w.t >= w.aiDecideAt) aiDecide(w);
  }
  if (w.continuous && w.move.t0 >= 0 && w.phase !== 'done' && w.t >= w.nextMarkT) {
    trackRunners(w);
    w.nextMarkT = w.t + 0.5;
  }
}

function setOutcome(w, type, tNow) {
  if (w.outcome) return;
  w.outcome = { type, t: tNow };
  w.outcomeT = tNow;
  w.phase = 'done';
  w.aiKick = null;
  w.move.result = type;
}

// Momentaufnahme der eigenen Entscheidung (für die Note, auch lange nach dem Moment)
function closeDecision(w, type, tNow) {
  const u = w.user;
  const d = {
    k: w.decisions.length, num: w.num, team: w.team, user: u, scene: w.scene,
    ball: { x: Number.isNaN(w.actBallX) ? w.ball.x : w.actBallX, y: Number.isNaN(w.actBallY) ? w.ball.y : w.actBallY },
    seen: Float32Array.from(w.seen), scans: w.scans - w.scanBase,
    ev: { reception: w.ev.reception, action: w.ev.action },
    evalAtReception: w.evalAtReception, evalAtAction: w.evalAtAction, choice: w.choice,
    outcome: { type, t: tNow }, passInfo: w.passInfo, dribbleInfo: w.dribbleInfo, shotInfo: w.shotInfo,
    direct: !!(w.action && w.action.direct), x: w.px[u], y: w.py[u], t: tNow,
  };
  w.decisions.push(d);
  w.decOpen = false;
  w.scanBase = w.scans;
}

// Ergebnis der laufenden Aktion. Ohne Weiterführung (oder bei Endzuständen) ist die Szene aus.
function resolve(w, type, tNow) {
  if (w.decOpen) closeDecision(w, type, tNow);
  if (!w.continuous || TERMINAL.has(type)) { setOutcome(w, type, tNow); return; }
  if (type === 'received') teamPossession(w, w.ball.holder, tNow);
  else if (type === 'dribbleOk') continueWithBall(w, tNow);
}

function lost(w, j, type, tNow) {
  const b = w.ball;
  b.holder = j; b.inFlight = false; b.target = -1;
  w.flight = null;
  w.scripts[j] = { type: 'carry' };
  w.kickT[j] = 0;
  const u = w.user;
  if (w.scripts[u].type !== 'usprint' && w.scripts[u].type !== 'urun') {
    w.scripts[u] = { type: 'ucarry', dx: Math.cos(w.hd[u]), dy: Math.sin(w.hd[u]), v0: 1, vMin: 0.3, t0: tNow };
  }
  for (let i = 0; i < w.n; i++) {
    if (i === j || i === u) continue;
    if (w.scripts[i].type === 'gk') continue;
    if (w.team[i] === w.team[j]) w.pending.push({ t: tNow + LANE.reaction, i, hold: true });
    else w.pending.push({ t: tNow + LANE.reaction, i, script: { type: 'chase', speed: PLAYER.run } });
  }
  resolve(w, type, tNow);
}

// Ball kommt beim Mitspieler (oder beim Nutzer) an
function arrive(w, f, r, tNow) {
  const b = w.ball;
  if (f.offside) {
    b.holder = r; b.inFlight = false; w.flight = null;
    w.scripts[r] = holdScript(w, r, 0.2);
    resolve(w, 'offside', tNow);
    return;
  }
  if (r === w.user) { onUserReception(w, tNow); return; }
  b.holder = r; b.inFlight = false; w.flight = null;
  const sp = Math.hypot(w.vx[r], w.vy[r]);
  w.scripts[r] = { type: 'carry', speed: Math.max(3.5, Math.min(6, sp)) };
  if (f.from === w.user || w.decOpen) resolve(w, 'received', tNow);
  else teamPossession(w, r, tNow);
}

// Mitspieler hat den Ball: kurze Kontrolle, dann entscheidet die KI
function teamPossession(w, r, tNow) {
  const b = w.ball;
  b.holder = r; b.inFlight = false; b.target = -1;
  w.flight = null;
  w.phase = 'team';
  w.carrier = r;
  w.contactT = 0;
  w.move.aiChain++;
  if (w.move.t0 < 0) w.move.t0 = tNow;
  if (w.move.aiChain > MOVE.aiChain) { setOutcome(w, 'stalled', tNow); return; }
  let near = Infinity;
  for (let j = 0; j < w.n; j++) if (w.team[j] !== w.team[r]) near = Math.min(near, Math.hypot(w.px[j] - w.px[r], w.py[j] - w.py[r]));
  w.aiDecideAt = tNow + (near < 2.5 ? 0.12 : near < 5 ? 0.4 : 0.65);
  w.aiQuick = near < 2.5;
  w.aiKick = null;
  w.aiDribbles = 0;
  w.pending.push({ t: tNow + LANE.reaction, kind: 'pressers', victim: r });
  supportRuns(w, r);
  const us = w.scripts[w.user].type;
  if (us !== 'usprint' && us !== 'receive') w.scripts[w.user] = { type: 'urun', t0: tNow };
}

// Mitspieler ohne Ball: vordere laufen in die Tiefe (knapp onside), die anderen rücken nach
function supportRuns(w, c) {
  const team = w.team[c];
  const s = team === 0 ? 1 : -1;
  let runners = 0;
  const order = [];
  for (let j = 0; j < w.n; j++) {
    if (j === c || j === w.user || w.team[j] !== team || w.gk[j]) continue;
    order.push([(w.px[j] - w.px[c]) * s, j]);
  }
  order.sort((a, b) => b[0] - a[0]);
  for (const [ahead, j] of order) {
    if (ahead > 3 && runners < 2) {
      w.scripts[j] = { type: 'attack', lane: w.py[j] * 0.85, depth: 6 + runners * 6 };
      runners++;
    } else if (w.scripts[j].type !== 'receive') {
      const h = holdScript(w, j, 0.8);
      h.kx = 0.55;
      w.scripts[j] = h;
    }
  }
}

// Verteidiger nehmen Läufer in die Tiefe auf
function trackRunners(w) {
  const att = w.team[w.user];
  const s = att === 0 ? 1 : -1;
  const line = offsideLineX(w, att) * s;
  for (let m = 0; m < w.n; m++) {
    if (w.team[m] !== att || w.gk[m] || m === w.ball.holder) continue;
    const x = w.px[m] * s;
    const vx = w.vx[m] * s;
    if (!(x > line - 0.5 && vx > 3.5) && !(x > line + 1)) continue;
    let marked = false;
    for (let j = 0; j < w.n; j++) if (w.scripts[j].type === 'mark' && w.scripts[j].target === m) { marked = true; break; }
    if (marked) continue;
    let best = -1, bd = 16;
    for (let j = 0; j < w.n; j++) {
      if (w.team[j] === att || w.gk[j]) continue;
      const t = w.scripts[j].type;
      if (t === 'press' || t === 'intercept' || t === 'chase' || t === 'mark' || t === 'carry') continue;
      const d = Math.hypot(w.px[j] - w.px[m], w.py[j] - w.py[m]);
      if (d < bd) { bd = d; best = j; }
    }
    if (best >= 0) w.pending.push({ t: w.t + 0.35, i: best, script: { type: 'mark', target: m, dist: 2.0, speed: PLAYER.sprint * 0.92, until: w.t + 3.5 } });
  }
}

// KI mit Ball: Optionen bewerten wie beim Nutzer. Der Nutzer wird angespielt, wenn er sich
// sinnvoll anbietet (oder den Ball fordert und der Weg nicht zu ist).
function aiDecide(w) {
  const c = w.carrier, u = w.user;
  const ev = evaluateOptions(w, c);
  // Die KI spielt solide: sichere Pässe, Dribbling nur in freien Raum, Schuss wenn er sich lohnt
  let best = null, bestPass = null, bestDrib = null;
  for (const o of ev.options) {
    if (o.type === 'shield') continue;
    if (o.type === 'pass' && (o.status === 'abseits' || o.pS < 0.8)) continue;
    if (o.type === 'dribble' && (o.tackler >= 0 || o.meters < 3)) continue;
    if (!best || o.value > best.value) best = o;
    if (o.type === 'pass' && (!bestPass || o.value > bestPass.value)) bestPass = o;
    if (o.type === 'dribble' && (!bestDrib || o.value > bestDrib.value)) bestDrib = o;
  }
  if (!best) best = ev.best.type === 'shield' ? (ev.options.find((o) => o.type === 'pass') || ev.best) : ev.best;
  const userOpt = ev.options.find((o) => o.type === 'pass' && o.target === u) || null;
  const demanded = w.move.demandT >= 0 && w.t - w.move.demandT < MOVE.demandT;
  let pick = best;
  // Der Spielzug soll über den Nutzer laufen, wenn er sich sinnvoll anbietet
  if (userOpt && userOpt.pS >= 0.7 && userOpt.status !== 'abseits' && (userOpt.tPress > 0.25 || demanded)) {
    // je länger der Nutzer nicht am Ball war, desto eher wird er gesucht
    const tol = (demanded ? 0.06 : 0.02) + (w.move.aiChain >= 2 ? 0.03 : 0);
    if (userOpt.value >= best.value - tol) pick = userOpt;
  }
  if (pick.type === 'dribble' && w.aiDribbles >= 2 && bestPass) pick = bestPass;
  w.move.events.push({
    t: w.t, type: 'ai', from: c, pick: pick.type, to: pick.type === 'pass' ? pick.target : -1,
    user: userOpt ? { status: userOpt.status, value: userOpt.value, gain: userOpt.gain, pS: userOpt.pS, tPress: userOpt.tPress } : null,
    best: best.value, bestType: best.type, demanded,
  });
  if (pick.type === 'pass') {
    w.kickT[c] = 0;
    w.aiKick = { type: 'pass', target: pick.target, t: w.t + (w.aiQuick ? 0.12 : MOVE.kickLead) };
    w.scripts[c] = { type: 'still' };
  } else if (pick.type === 'shot') {
    let k = -1;
    for (let j = 0; j < w.n; j++) if (w.team[j] !== w.team[c] && w.gk[j]) k = j;
    const side = k >= 0 && w.py[k] > w.ball.y * 0.2 ? -1 : 1;
    w.kickT[c] = 0;
    w.aiKick = { type: 'shot', y: side * (2.3 + 0.8 * w.rand()), z: 0.3 + 0.9 * w.rand(), t: w.t + MOVE.kickLead + 0.03 };
    w.scripts[c] = { type: 'still' };
  } else {
    w.aiDribbles++;
    w.scripts[c] = { type: 'dribble', dx: pick.dx, dy: pick.dy };
    w.aiDecideAt = w.t + MOVE.dribbleT;
  }
}

// Nutzer bekommt den Ball (erste Annahme oder später im Spielzug)
function onUserReception(w, tNow) {
  const u = w.user;
  const b = w.ball;
  if (w.decOpen) closeDecision(w, 'received', tNow); // eigener Pass in den Raum selbst erlaufen
  w.flight = null;
  w.ev.reception = tNow; w.ev.action = -1;
  w.action = null; w.choice = null; w.evalAtAction = null;
  w.passInfo = null; w.dribbleInfo = null; w.shotInfo = null;
  w.actBallX = NaN; w.actBallY = NaN;
  w.shielding = false; w.contactT = w.decisions.length > 0 ? -0.15 : 0; w.shieldT = 0;
  w.decOpen = true;
  w.carrier = u;
  w.move.aiChain = 0; w.move.userTouches++; w.move.lastUserTouch = tNow;
  if (w.move.t0 < 0) w.move.t0 = tNow;
  if (w.directShot) {
    // Direktabnahme
    const ds = w.directShot;
    w.directShot = null;
    w.evalAtReception = evaluateOptions(w, u);
    startAction(w, { type: 'shot', y: ds.y, z: ds.z, kicked: true, direct: true }, tNow);
    executeShot(w, u, ds.y, ds.z, tNow);
    return;
  }
  if (w.directTarget >= 0) {
    // Direktpass: der Ball wird ohne Kontrolle weitergeleitet
    const t = w.directTarget;
    w.directTarget = -1;
    w.evalAtReception = evaluateOptions(w, u);
    startAction(w, { type: 'pass', target: t, kickAt: tNow, kicked: true, direct: true }, tNow);
    w.choice = { type: 'pass', target: t };
    executePass(w, t, tNow, u);
    return;
  }
  b.holder = u; b.inFlight = false;
  w.phase = 'decide';
  // Ballmitnahme in der Bewegung: Tempo und Richtung vom Moment der Annahme
  const vx = w.vx[u], vy = w.vy[u], sp = Math.hypot(vx, vy);
  const dx = sp > 0.3 ? vx / sp : Math.cos(w.hd[u]), dy = sp > 0.3 ? vy / sp : Math.sin(w.hd[u]);
  w.scripts[u] = { type: 'ucarry', dx, dy, v0: sp, vMin: Math.min(1.4, sp), t0: tNow };
  w.placeBallAtFeet(u, 0.45);
  w.evalAtReception = evaluateOptions(w, u);
  w.pending.push({ t: tNow + LANE.reaction * 0.8, kind: 'pressers' });
}

// Nach gelungenem Dribbling: Ball bleibt beim Nutzer, nächste Entscheidung
function continueWithBall(w, tNow) {
  const u = w.user;
  w.ev.reception = tNow; w.ev.action = -1;
  w.action = null; w.choice = null; w.evalAtAction = null;
  w.passInfo = null; w.dribbleInfo = null; w.shotInfo = null;
  w.actBallX = NaN; w.actBallY = NaN;
  w.contactT = -0.35; // Ball nach dem Dribbling unter Kontrolle: kurzer Vorsprung vor dem Zweikampf
  w.decOpen = true;
  w.phase = 'decide';
  const vx = w.vx[u], vy = w.vy[u], sp = Math.hypot(vx, vy);
  const dx = sp > 0.3 ? vx / sp : Math.cos(w.hd[u]), dy = sp > 0.3 ? vy / sp : Math.sin(w.hd[u]);
  w.scripts[u] = { type: 'ucarry', dx, dy, v0: sp, vMin: Math.min(1.4, sp), t0: tNow };
  w.evalAtReception = evaluateOptions(w, u);
  w.pending.push({ t: tNow + LANE.reaction, kind: 'pressers' });
}

// Schuss erreicht Block, Torwart oder Linie
function shotEvent(w, f, tNow) {
  const r = f.shot;
  const b = w.ball;
  const s = w.team[f.from] === 0 ? 1 : -1;
  w.flight = { kind: 'after' };
  if (r.result === 'saved') {
    if (r.caught) {
      b.inFlight = false; b.holder = r.keeper;
      w.scripts[r.keeper] = { type: 'still' };
    } else {
      const side = Math.sign(r.ey) || 1;
      planDeflect(b.path, r.ex, r.ey, r.ez, r.ex - s * (3 + 3 * w.rand()), r.ey + side * (3 + 5 * w.rand()), 0.7, tNow);
    }
  } else if (r.result === 'blocked') {
    const a = Math.atan2(-b.path.dy, -b.path.dx) + (w.rand() - 0.5) * 2.2;
    planDeflect(b.path, r.ex, r.ey, r.ez, r.ex + Math.cos(a) * (5 + 6 * w.rand()), r.ey + Math.sin(a) * (5 + 6 * w.rand()), 0.8, tNow);
  } else if (r.result === 'post') {
    const py = Math.sign(r.y) * GOAL.half;
    planDeflect(b.path, GOAL.x * s, py, r.z, GOAL.x * s - s * (6 + 6 * w.rand()), py * (0.4 + 0.8 * w.rand()), 0.8, tNow);
  }
  resolve(w, r.result, tNow);
}

export function postStep(w, dt) {
  const tNow = w.t + dt;
  const b = w.ball;
  if (b.inFlight && w.flight) {
    const f = w.flight;
    const tau = tNow - b.path.tKick;
    if (f.kind === 'toUser') {
      if (tau >= b.path.T) onUserReception(w, tNow);
    } else if (f.kind === 'pass') {
      if (f.interceptor >= 0 && tau >= f.tInt) { w.move.lostBy = 'pass'; lost(w, f.interceptor, f.from === w.user ? 'intercepted' : 'lost', tNow); }
      else if (tau >= b.path.T) arrive(w, f, f.target, tNow);
    } else if (f.kind === 'space') {
      if (f.winner < 0) {
        if (tau >= f.t) { w.flight = { kind: 'after' }; resolve(w, 'out', tNow); }
      } else if (tau >= f.t) {
        if (w.team[f.winner] === w.team[f.from]) arrive(w, f, f.winner, tNow);
        else lost(w, f.winner, f.from === w.user ? 'intercepted' : 'lost', tNow);
      }
    } else if (f.kind === 'shot') {
      if (tau >= f.tEvent) shotEvent(w, f, tNow);
    }
  }

  if (w.phase === 'decide') {
    const u = w.user;
    let close = -1, contacts = 0, near2 = 0, cd = Infinity;
    for (let j = 0; j < w.n; j++) {
      if (w.team[j] === w.team[u]) continue;
      const d = Math.hypot(w.px[j] - w.px[u], w.py[j] - w.py[u]);
      if (d <= (w.shielding ? SHIELD.contact : 1.15)) { contacts++; if (d < cd) { cd = d; close = j; } }
      if (d <= SHIELD.doubleRange) near2++;
    }
    if (w.shielding) {
      const double = near2 >= 2;
      if (contacts > 0) {
        // Anläufer kommt mit Tempo von hinten in den abschirmenden Spieler: Foul
        if (w.shieldT === 0 && !double) {
          const sp = Math.hypot(w.vx[close], w.vy[close]);
          const fromBehind = Math.cos(Math.atan2(w.py[close] - w.py[u], w.px[close] - w.px[u]) - w.hd[u]) < -0.5;
          if (sp > SHIELD.foulSpeed && fromBehind) {
            w.foul = true;
            w.choice = { type: 'shield' };
            w.evalAtAction = w.shieldEval;
            w.scripts[close] = holdScript(w, close, 0.2);
            resolve(w, 'fouled', tNow);
            return;
          }
        }
        w.shieldT += dt;
        const limit = double ? SHIELD.double : SHIELD.single;
        w.shieldLimit = limit;
        if (w.shieldT >= limit) {
          w.choice = { type: 'shield' };
          w.evalAtAction = w.shieldEval;
          if (w.ev.action < 0) w.ev.action = w.shieldStart;
          lost(w, close, 'shieldLost', tNow);
        }
      }
    } else if (close >= 0) {
      w.contactT += dt;
      if (w.contactT >= TIMING.tackleContact) lost(w, close, 'tackled', tNow);
    } else w.contactT = 0;
    if (w.phase === 'decide' && tNow - w.ev.reception > MAX_DECISION) resolve(w, 'hesitated', tNow);
  } else if (w.phase === 'action' && w.action) {
    const a = w.action;
    if (a.type === 'dribble') {
      const di = w.dribbleInfo;
      if (di.tackler >= 0 && tNow >= w.ev.action + di.tTackle) lost(w, di.tackler, 'dribbleLost', tNow);
      else if (di.tackler < 0 && tNow >= w.ev.action + di.horizon) {
        for (let j = 0; j < w.n; j++) {
          if (w.team[j] !== w.team[w.user] && w.scripts[j].type === 'chase') w.scripts[j] = holdScript(w, j, 0.3);
        }
        resolve(w, 'dribbleOk', tNow);
      }
    }
  } else if (w.phase === 'team') {
    // Zweikampf gegen den ballführenden Mitspieler (nicht mehr, wenn der Pass schon unterwegs ist)
    const c = w.carrier;
    let close = -1;
    for (let j = 0; j < w.n && !w.aiKick; j++) {
      if (w.team[j] === w.team[c]) continue;
      if (Math.hypot(w.px[j] - w.px[c], w.py[j] - w.py[c]) <= 1.15) { close = j; break; }
    }
    if (close >= 0) {
      w.contactT += dt;
      if (w.contactT >= TIMING.tackleContact + 0.1) { w.move.lostBy = 'zweikampf'; lost(w, close, 'lost', tNow); }
    } else w.contactT = 0;
    // im Dribbling unter Druck: sofort neu entscheiden (abspielen)
    if (w.phase === 'team' && !w.aiKick && w.scripts[c].type === 'dribble' && w.aiDecideAt - tNow > 0.05) {
      for (let j = 0; j < w.n; j++) {
        if (w.team[j] === w.team[c]) continue;
        if (Math.hypot(w.px[j] - w.px[c], w.py[j] - w.py[c]) < 2.6) { w.aiDecideAt = tNow; w.aiDribbles = 2; break; }
      }
    }
  }
  // mit dem Ball über die Linie gelaufen
  if (w.phase !== 'done' && b.holder >= 0 && (w.phase === 'decide' || w.phase === 'action' || w.phase === 'team')) {
    if (Math.abs(b.x) > PITCH.length / 2 + 0.2 || Math.abs(b.y) > PITCH.width / 2 + 0.2) {
      b.holder = -1; b.inFlight = false;
      w.flight = { kind: 'after' };
      resolve(w, 'out', tNow);
    }
  }
  if (w.continuous && w.move.t0 >= 0 && w.phase !== 'done' && tNow - w.move.t0 > MOVE.maxT
    && !(w.flight && w.flight.kind === 'shot')) setOutcome(w, 'timeout', tNow);
}

export { nearestMate };
