// Regie: Pass auf den Spieler (aus echten Daten exakt getimet), Annahme in der Bewegung,
// Anlaufen der Gegner, Pass / Dribbling / Sichern und die Entscheidung über Abfangen und
// Ballverlust. Alles deterministisch aus dem Passweg-Modell (eval/lanes.js).

import { TIMING, LANE, PLAYER, PITCH } from '../config.js';
import { clamp, distToSegment } from '../core/math.js';
import { planPass, planPassTimed, arrivalTime, LOFT } from './ball.js';
import { holdScript } from './ai.js';
import { sampleTrack } from './replay.js';
import {
  analyzePath, analyzeDribble, createLaneResult, createDribbleResult, isOffside, runTime,
} from '../eval/lanes.js';
import { evaluateOptions } from '../eval/evaluate.js';

const lane = createLaneResult();
const drib = createDribbleResult();

export const SHIELD = { single: 2.8, double: 0.9, contact: 1.45, doubleRange: 2.6, foulSpeed: 4.4 };
export const MAX_DECISION = 5.0;

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
}

export function onInput(w, a) {
  if (w.phase === 'done' || w.action) return;
  if (a.type === 'pass') {
    if (a.target === w.user || w.team[a.target] !== w.team[w.user]) return;
    if (w.phase === 'pre' || w.phase === 'toUser') { w.directTarget = a.target; return; }
    if (w.phase === 'decide') {
      const delay = w.shielding ? 0.28 : TIMING.kickDelay;
      startAction(w, { type: 'pass', target: a.target, kickAt: w.t + delay, kicked: false, direct: false });
    }
  } else if (a.type === 'dribble' && w.phase === 'decide') {
    startAction(w, { type: 'dribble', dx: a.dx, dy: a.dy });
  } else if (a.type === 'shield' && w.phase === 'decide' && !w.shielding) {
    startShield(w);
  }
}

function startAction(w, a, tNow = w.t) {
  w.action = a;
  if (w.ev.action < 0 || !w.shielding) w.ev.action = tNow;
  w.phase = 'action';
  w.decisionTime = w.ev.action - w.ev.reception;
  const u = w.user;
  if (a.type === 'pass') {
    w.choice = { type: 'pass', target: a.target };
  } else if (a.type === 'dribble') {
    const dir = Math.atan2(a.dy, a.dx);
    w.choice = { type: 'dribble', dir };
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
    const t = w.scripts[j].type;
    if (t === 'gk' || t === 'run') continue;
    if (w.team[j] === defTeam && chase && (j === c1 || j === c2)) {
      w.pending.push({ t: tr, i: j, script: { type: 'chase', speed: PLAYER.sprint * 0.95 } });
    } else {
      w.pending.push({ t: tr, i: j, hold: true });
    }
  }
}

// Die ein bis zwei Gegner, die am schnellsten beim Spieler sein können, laufen ihn an.
// Im Bogen, so dass der gefährlichste Passweg im Deckungsschatten liegt.
function assignPressers(w) {
  const u = w.user;
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

export function executePass(w, target, tKick) {
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
  // Bewertung genau im Moment des Passes (Passwege ändern sich bis zum Schuss)
  w.evalAtAction = evaluateOptions(w, w.user);
  const offside = isOffside(w, r, bx);
  planPass(b.path, bx, by, Px, Py, tKick);
  const defTeam = w.team[r] === 0 ? 1 : 0;
  analyzePath(w, b.path, defTeam, lane);
  b.holder = -1; b.inFlight = true; b.target = r;
  w.passInfo = {
    target: r, status: lane.status, margin: lane.margin, critical: lane.critical,
    interceptor: lane.interceptor, tInt: lane.tInt, lofted: b.path.mode === LOFT,
    dist: b.path.dist, T: b.path.T, offside, direct: !!(w.action && w.action.direct),
  };
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
  // eigener Spieler geht nach dem Pass mit
  const u = w.user;
  const sp = Math.hypot(w.vx[u], w.vy[u]);
  const dx = Px - w.px[u], dy = Py - w.py[u], dl = Math.hypot(dx, dy) || 1;
  w.scripts[u] = { type: 'ucarry', dx: dx / dl, dy: dy / dl, v0: Math.max(2, sp), vMin: 1.2, t0: tKick };
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
        if (w.phase === 'decide') assignPressers(w);
      } else {
        const cur = w.scripts[p.i].type;
        if (cur !== 'intercept' && cur !== 'carry' && cur !== 'receive') {
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
  if (w.phase === 'action' && a && a.type === 'pass' && !a.kicked && w.t >= a.kickAt) {
    a.kicked = true;
    executePass(w, a.target, w.t);
  }
}

function setOutcome(w, type, tNow) {
  if (w.outcome) return;
  w.outcome = { type, t: tNow };
  w.outcomeT = tNow;
  w.phase = 'done';
}

function loseBall(w, j, type, tNow) {
  const b = w.ball;
  b.holder = j; b.inFlight = false;
  w.scripts[j] = { type: 'carry' };
  w.kickT[j] = 0;
  const u = w.user;
  w.scripts[u] = { type: 'ucarry', dx: Math.cos(w.hd[u]), dy: Math.sin(w.hd[u]), v0: 1, vMin: 0.3, t0: tNow };
  for (let i = 0; i < w.n; i++) {
    if (i === j || i === u) continue;
    if (w.scripts[i].type === 'gk') continue;
    if (w.team[i] === w.team[j]) w.pending.push({ t: tNow + LANE.reaction, i, hold: true });
    else w.pending.push({ t: tNow + LANE.reaction, i, script: { type: 'chase', speed: PLAYER.run } });
  }
  setOutcome(w, type, tNow);
}

function onReception(w, tNow) {
  const u = w.user;
  w.ev.reception = tNow;
  const b = w.ball;
  if (w.directTarget >= 0) {
    // Direktpass: der Ball wird ohne Kontrolle weitergeleitet
    w.evalAtReception = evaluateOptions(w, u);
    startAction(w, { type: 'pass', target: w.directTarget, kickAt: tNow, kicked: true, direct: true }, tNow);
    w.choice = { type: 'pass', target: w.directTarget };
    executePass(w, w.directTarget, tNow);
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

export function postStep(w, dt) {
  const tNow = w.t + dt;
  const b = w.ball;
  if (b.inFlight) {
    const tau = tNow - b.path.tKick;
    if (w.phase === 'toUser') {
      if (tau >= b.path.T) onReception(w, tNow);
    } else if (w.passInfo && b.target === w.passInfo.target) {
      const pi = w.passInfo;
      if (pi.interceptor >= 0 && tau >= pi.tInt) {
        loseBall(w, pi.interceptor, 'intercepted', tNow);
      } else if (tau >= b.path.T) {
        b.holder = pi.target; b.inFlight = false;
        const sp = Math.hypot(w.vx[pi.target], w.vy[pi.target]);
        w.scripts[pi.target] = { type: 'carry', speed: Math.max(3.5, Math.min(6, sp)) };
        setOutcome(w, pi.offside ? 'offside' : 'received', tNow);
      }
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
            setOutcome(w, 'fouled', tNow);
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
          loseBall(w, close, 'shieldLost', tNow);
        }
      }
    } else if (close >= 0) {
      w.contactT += dt;
      if (w.contactT >= TIMING.tackleContact) loseBall(w, close, 'tackled', tNow);
    } else w.contactT = 0;
    if (w.phase === 'decide' && tNow - w.ev.reception > MAX_DECISION) setOutcome(w, 'hesitated', tNow);
  } else if (w.phase === 'action' && w.action) {
    const a = w.action;
    if (a.type === 'dribble') {
      const di = w.dribbleInfo;
      if (di.tackler >= 0 && tNow >= w.ev.action + di.tTackle) loseBall(w, di.tackler, 'dribbleLost', tNow);
      else if (di.tackler < 0 && tNow >= w.ev.action + di.horizon) {
        setOutcome(w, 'dribbleOk', tNow);
        for (let j = 0; j < w.n; j++) {
          if (w.team[j] !== w.team[w.user] && w.scripts[j].type === 'chase') w.scripts[j] = holdScript(w, j, 0.3);
        }
      }
    }
  }
}

export { nearestMate };
