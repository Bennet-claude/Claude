// Regie: plant Pässe, Dribblings, Sichern und entscheidet Abfangen/Ballverlust.
// Alle Entscheidungen fallen deterministisch aus dem Passweg-Modell (eval/lanes.js) –
// keine zufälligen Fehlpässe.

import { TIMING, LANE, PLAYER, PITCH } from '../config.js';
import { clamp } from '../core/math.js';
import { planPass, arrivalTime, LOFT } from './ball.js';
import {
  analyzePath, analyzeDribble, createLaneResult, createDribbleResult, isOffside,
} from '../eval/lanes.js';

const lane = createLaneResult();
const drib = createDribbleResult();

export function onLoad(w) {
  const p = w.passer;
  const dx = w.receiveX - w.px[p], dy = w.receiveY - w.py[p];
  w.arrivalEstimate = w.scene.pass.at + arrivalTime(Math.sqrt(dx * dx + dy * dy));
}

export function onInput(w, a) {
  if (w.phase === 'done' || w.action) return;
  if (a.type === 'pass') {
    if (a.target === w.user || w.team[a.target] !== w.team[w.user]) return;
    if (w.phase === 'pre' || w.phase === 'toUser') { w.directTarget = a.target; return; }
    if (w.phase === 'decide') startAction(w, { type: 'pass', target: a.target, kickAt: w.t + TIMING.kickDelay, kicked: false, direct: false });
  } else if (a.type === 'dribble' && w.phase === 'decide') {
    startAction(w, { type: 'dribble', dx: a.dx, dy: a.dy });
  } else if (a.type === 'shield' && w.phase === 'decide') {
    startAction(w, { type: 'shield' });
  }
}

function startAction(w, a, tNow = w.t) {
  w.action = a;
  w.ev.action = tNow;
  w.phase = 'action';
  w.decisionTime = tNow - w.ev.reception;
  const u = w.user;
  if (a.type === 'pass') {
    w.scripts[u] = { type: 'still' };
  } else if (a.type === 'dribble') {
    analyzeDribble(w, u, a.dx, a.dy, TIMING.dribbleHorizon, drib);
    w.dribbleInfo = {
      tackler: drib.tackler, tTackle: drib.tTackle, horizon: drib.horizon,
      gain: drib.gain, margin: drib.margin, dx: a.dx, dy: a.dy,
    };
    w.scripts[u] = { type: 'dribble', dx: a.dx, dy: a.dy };
    if (drib.tackler >= 0) w.scripts[drib.tackler] = makeIntercept(w, drib.tackler, drib.tx, drib.ty, tNow);
    scheduleReactions(w, tNow, [drib.tackler], w.px[u] + a.dx * drib.gain, w.py[u] + a.dy * drib.gain, true);
  } else if (a.type === 'shield') {
    w.scripts[u] = { type: 'shield' };
    w.shieldT = 0;
    const mate = nearestMate(w, u);
    if (mate >= 0) w.pending.push({ t: tNow + LANE.reaction, i: mate, script: { type: 'support', mate: u } });
  }
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
  // die zwei Gegner, die dem Zielpunkt am nächsten sind, gehen drauf
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
    let script;
    if (w.team[j] === defTeam && chase && (j === c1 || j === c2)) script = { type: 'chase', speed: PLAYER.run };
    else script = { type: 'zonal', speed: 4.2 };
    w.pending.push({ t: tr, i: j, script });
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
  if (w.user !== r && b.path) w.scripts[w.user] = { type: 'still' };
}

function kickToUser(w) {
  const b = w.ball;
  planPass(b.path, b.x, b.y, w.receiveX, w.receiveY, w.t);
  b.holder = -1; b.inFlight = true; b.target = w.user;
  w.ev.passKick = w.t;
  w.arrivalEstimate = w.t + b.path.T;
  w.phase = 'toUser';
}

export function preStep(w, dt) {
  // verzögerte Skriptwechsel
  for (let k = w.pending.length - 1; k >= 0; k--) {
    const p = w.pending[k];
    if (w.t >= p.t) {
      const cur = w.scripts[p.i].type;
      if (cur !== 'intercept' && cur !== 'carry' && cur !== 'receive') w.scripts[p.i] = p.script;
      w.pending[k] = w.pending[w.pending.length - 1];
      w.pending.pop();
    }
  }
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
  if (w.scripts[w.user].type !== 'still') w.scripts[w.user] = { type: 'still' };
  // alle anderen reagieren auf den Ballverlust
  for (let i = 0; i < w.n; i++) {
    if (i === j || i === w.user) continue;
    const t = w.scripts[i].type;
    if (t === 'gk') continue;
    w.pending.push({ t: tNow + LANE.reaction, i, script: w.team[i] === w.team[j] ? { type: 'zonal', speed: 5 } : { type: 'chase', speed: PLAYER.run } });
  }
  setOutcome(w, type, tNow);
}

export function postStep(w, dt) {
  const tNow = w.t + dt;
  const b = w.ball;
  if (b.inFlight) {
    const tau = tNow - b.path.tKick;
    if (w.phase === 'toUser') {
      if (tau >= b.path.T) {
        w.ev.reception = tNow;
        if (w.directTarget >= 0) {
          startAction(w, { type: 'pass', target: w.directTarget, kickAt: tNow, kicked: true, direct: true }, tNow);
          executePass(w, w.directTarget, tNow);
        } else {
          b.holder = w.user; b.inFlight = false;
          w.phase = 'decide';
          w.scripts[w.user] = { type: 'still' };
        }
      }
    } else if (w.passInfo && b.target === w.passInfo.target) {
      const pi = w.passInfo;
      if (pi.interceptor >= 0 && tau >= pi.tInt) {
        loseBall(w, pi.interceptor, 'intercepted', tNow);
      } else if (tau >= b.path.T) {
        b.holder = pi.target; b.inFlight = false;
        w.scripts[pi.target] = { type: 'still' };
        setOutcome(w, pi.offside ? 'offside' : 'received', tNow);
      }
    }
  }

  if (w.phase === 'decide') {
    // Wer zu lange wartet, wird attackiert
    let close = -1;
    for (let j = 0; j < w.n; j++) {
      if (w.team[j] === w.team[w.user]) continue;
      const dx = w.px[j] - w.px[w.user], dy = w.py[j] - w.py[w.user];
      if (dx * dx + dy * dy <= 1.15 * 1.15) { close = j; break; }
    }
    if (close >= 0) {
      w.contactT += dt;
      if (w.contactT >= TIMING.tackleContact) loseBall(w, close, 'tackled', tNow);
    } else w.contactT = 0;
  } else if (w.phase === 'action' && w.action) {
    const a = w.action;
    if (a.type === 'dribble') {
      const di = w.dribbleInfo;
      if (di.tackler >= 0 && tNow >= w.ev.action + di.tTackle) loseBall(w, di.tackler, 'dribbleLost', tNow);
      else if (di.tackler < 0 && tNow >= w.ev.action + di.horizon) {
        setOutcome(w, 'dribbleOk', tNow);
        for (let j = 0; j < w.n; j++) {
          if (w.team[j] !== w.team[w.user] && w.scripts[j].type === 'chase') w.scripts[j] = { type: 'zonal', speed: 4.5 };
        }
      }
    } else if (a.type === 'shield') {
      w.shieldT += dt;
      if (w.shieldT >= TIMING.shieldHold) {
        let count = 0, nearest = -1, nd = Infinity;
        for (let j = 0; j < w.n; j++) {
          if (w.team[j] === w.team[w.user]) continue;
          const dx = w.px[j] - w.px[w.user], dy = w.py[j] - w.py[w.user];
          const d = dx * dx + dy * dy;
          if (d <= 2.2 * 2.2) count++;
          if (d < nd) { nd = d; nearest = j; }
        }
        if (count >= 2) loseBall(w, nearest, 'shieldLost', tNow);
        else setOutcome(w, 'shielded', tNow);
      }
    }
  }
}
