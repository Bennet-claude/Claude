// Passweg- und Laufweg-Analyse: "Erreicht ein Gegner den Ball, bevor er vorbei ist?"
// Modell: 0,25 s Reaktion (Gegner läuft mit aktuellem Tempo weiter), danach
// geradliniger Lauf mit Beschleunigung bis Maximaltempo. Liegt ein Gegner
// ohnehin im Weg (Körper), blockt er ohne Reaktion.
// Reines JavaScript ohne Three.js – in Node testbar.

import { LANE, PLAYER, PITCH } from '../config.js';
import { pathPos, pathHeight, LOFT } from '../sim/ball.js';

const tmp = new Float64Array(3);

export function runTime(px, py, vx, vy, tx, ty, reach, vmax, accel, decel) {
  const dx = tx - px, dy = ty - py;
  const dist = Math.sqrt(dx * dx + dy * dy);
  let D = dist - reach;
  if (D <= 0) return 0;
  const ux = dx / dist, uy = dy / dist;
  let u0 = vx * ux + vy * uy;
  let t = 0;
  if (u0 < 0) {
    // erst abbremsen, dabei weiter weg driften
    const tb = -u0 / decel;
    t += tb;
    D += (u0 * u0) / (2 * decel);
    u0 = 0;
  }
  u0 = Math.min(u0, vmax);
  const tAcc = (vmax - u0) / accel;
  const dAcc = (vmax * vmax - u0 * u0) / (2 * accel);
  if (D <= dAcc) {
    t += (-u0 + Math.sqrt(u0 * u0 + 2 * accel * D)) / accel;
  } else {
    t += tAcc + (D - dAcc) / vmax;
  }
  return t;
}

function inOwnBox(team, x, y) {
  // Team 1 verteidigt das Tor bei +x, Team 0 bei -x.
  const gx = team === 1 ? PITCH.length / 2 : -PITCH.length / 2;
  return Math.abs(x - gx) <= PITCH.penaltyDepth && Math.abs(y) <= PITCH.penaltyWidth / 2;
}

// Zeit, die Spieler j braucht, um bei Ballzeit tau am Punkt (bx,by) in Höhe bz einzugreifen.
// Rückgabe: benötigte Zeit (<= tau heißt: er ist rechtzeitig da).
export function timeToIntercept(world, j, bx, by, bz, tau) {
  const reaction = LANE.reaction;
  const px = world.px[j], py = world.py[j], vx = world.vx[j], vy = world.vy[j];
  // passiver Block: Gegner steht/läuft ohnehin in der Bahn
  const td = Math.min(tau, reaction);
  const qx = px + vx * td, qy = py + vy * td;
  const ddx = bx - qx, ddy = by - qy;
  const dPass = Math.sqrt(ddx * ddx + ddy * ddy);
  if (bz < 1.0 && dPass <= LANE.bodyBlock) return 0;

  const isGk = world.gk[j] === 1 && inOwnBox(world.team[j], bx, by);
  let reach = bz > 1.0 ? LANE.headerReach : LANE.reach;
  if (isGk) reach = LANE.gkReach;
  const vmax = world.gk[j] ? PLAYER.gkSprint : PLAYER.sprint;
  const rx = px + vx * reaction, ry = py + vy * reaction;
  return reaction + runTime(rx, ry, vx, vy, bx, by, reach, vmax, PLAYER.accel, PLAYER.decel);
}

export function createLaneResult() {
  return {
    margin: Infinity, status: 'frei', critical: -1, // Gegner mit kleinstem Puffer
    interceptor: -1, tInt: 0, ix: 0, iy: 0,         // erster, der wirklich rankommt
    bestT: 0, bx: 0, by: 0,                          // Punkt des kleinsten Puffers
  };
}

export function classify(margin) {
  if (margin < 0) return 'zu';
  if (margin < LANE.tight) return 'eng';
  return 'frei';
}

// Analysiert eine geplante Ballbahn gegen alle Spieler des Teams defTeam.
export function analyzePath(world, path, defTeam, res) {
  res.margin = Infinity; res.critical = -1; res.interceptor = -1;
  res.tInt = Infinity; res.ix = 0; res.iy = 0; res.bestT = 0; res.bx = 0; res.by = 0;
  const T = path.T;
  const n = world.n;
  const steps = Math.max(2, Math.ceil(T / LANE.sampleDt));
  for (let k = 1; k <= steps; k++) {
    const tau = k === steps ? T : k * LANE.sampleDt;
    pathPos(path, tau, tmp);
    const bz = tmp[2];
    if (bz > LANE.maxInterceptHeight) continue;
    for (let j = 0; j < n; j++) {
      if (world.team[j] !== defTeam) continue;
      const need = timeToIntercept(world, j, tmp[0], tmp[1], bz, tau);
      const m = need - tau;
      if (m < res.margin) {
        res.margin = m; res.critical = j; res.bestT = tau; res.bx = tmp[0]; res.by = tmp[1];
      }
      if (m <= 0 && tau < res.tInt) {
        res.tInt = tau; res.interceptor = j; res.ix = tmp[0]; res.iy = tmp[1];
      }
    }
  }
  res.status = classify(res.margin);
  return res;
}

// Dribbling: Zeitprofil des Balls am Fuß des Spielers, der in (dirX,dirY) andribbelt.
export function dribbleDistance(u0, tau) {
  const vmax = PLAYER.dribble, a = PLAYER.accel;
  const tAcc = Math.max(0, (vmax - u0) / a);
  if (tau <= tAcc) return u0 * tau + 0.5 * a * tau * tau;
  return u0 * tAcc + 0.5 * a * tAcc * tAcc + vmax * (tau - tAcc);
}

export function createDribbleResult() {
  return { tackler: -1, tTackle: Infinity, tx: 0, ty: 0, margin: Infinity, critical: -1, horizon: 0, gain: 0 };
}

export function analyzeDribble(world, i, dirX, dirY, horizon, res) {
  res.tackler = -1; res.tTackle = Infinity; res.margin = Infinity; res.critical = -1;
  const px = world.px[i], py = world.py[i];
  const u0 = Math.max(0, world.vx[i] * dirX + world.vy[i] * dirY);
  const defTeam = world.team[i] === 0 ? 1 : 0;
  const hx = PITCH.length / 2 - 0.5, hy = PITCH.width / 2 - 0.5;
  let lastT = horizon;
  for (let tau = 0.1; tau <= horizon + 1e-9; tau += LANE.sampleDt) {
    const s = dribbleDistance(u0, tau) + 0.6; // Ball liegt vor dem Fuß
    const bx = px + dirX * s, by = py + dirY * s;
    if (Math.abs(bx) > hx || Math.abs(by) > hy) { lastT = tau; break; }
    for (let j = 0; j < world.n; j++) {
      if (world.team[j] !== defTeam) continue;
      const need = timeToIntercept(world, j, bx, by, 0.11, tau);
      const m = need - tau;
      if (m < res.margin) { res.margin = m; res.critical = j; }
      if (m <= 0 && tau < res.tTackle) {
        res.tTackle = tau; res.tackler = j; res.tx = bx; res.ty = by;
      }
    }
    if (res.tackler >= 0) break;
  }
  res.horizon = Math.min(lastT, res.tackler >= 0 ? res.tTackle : horizon);
  res.gain = dribbleDistance(u0, res.horizon);
  return res;
}

// Abseits zum Zeitpunkt des Passes (für Team 0, Angriff Richtung +x).
export function offsideLineX(world, attTeam) {
  let first = -Infinity, second = -Infinity;
  const sign = attTeam === 0 ? 1 : -1;
  for (let j = 0; j < world.n; j++) {
    if (world.team[j] === attTeam) continue;
    const x = world.px[j] * sign;
    if (x > first) { second = first; first = x; } else if (x > second) second = x;
  }
  return second * sign;
}

export function isOffside(world, receiver, ballX) {
  const team = world.team[receiver];
  const sign = team === 0 ? 1 : -1;
  const rx = world.px[receiver] * sign;
  const line = Math.max(offsideLineX(world, team) * sign, ballX * sign);
  return rx > 0 && rx > line + 0.05;
}

export { pathHeight, LOFT };
