// Torschuss: Torwahrscheinlichkeit (xG), Streuung, Blocks und Torwartparade.
// Deterministisch über den Szenen-Zufallsgenerator (w.rand) – gleiche Eingaben, gleiches Ergebnis.
// Reines JavaScript ohne Three.js.

import { PITCH, LANE, PLAYER, BALL } from '../config.js';
import { clamp } from '../core/math.js';
import { planShot, pathPos, SHOT } from './ball.js';
import { timeToIntercept } from '../eval/lanes.js';
import { gkOut } from './ai.js';

export const GOAL = { x: PITCH.length / 2, half: PITCH.goalWidth / 2, h: PITCH.goalHeight };
export const KEEPER = { react: 0.2, stand: 0.85, dive: 5.2, maxReach: 2.75, highDrop: 0.45 };

const tmp = new Float64Array(3);
const sgnOf = (team) => (team === 0 ? 1 : -1);

// Winkel, unter dem das Tor aus (x, y) erscheint
export function goalAngle(x, y, team) {
  const s = sgnOf(team);
  const gx = GOAL.x * s;
  const a1 = Math.atan2(GOAL.half - y, (gx - x) * s);
  const a2 = Math.atan2(-GOAL.half - y, (gx - x) * s);
  return Math.max(0, a1 - a2);
}

// Einfaches xG-Modell (logistisch in Winkel und Distanz), grob an öffentliche Werte angelehnt:
// 11 m zentral ≈ 0,3 · 18 m ≈ 0,1 · 25 m ≈ 0,045. Gegner im Schussfenster senken den Wert.
export function xG(w, x, y, team, shooter = -1) {
  const s = sgnOf(team);
  const gx = GOAL.x * s;
  if ((gx - x) * s <= 0.2) return 0.001;
  const dist = Math.hypot(gx - x, y);
  const ang = goalAngle(x, y, team);
  let p = 1 / (1 + Math.exp(-(-3.3 + 4.6 * ang - 0.043 * dist)));
  let keeper = -1;
  for (let j = 0; j < w.n; j++) {
    if (w.team[j] === team) continue;
    if (w.gk[j]) { keeper = j; continue; }
    // Gegner im Dreieck Ball – Pfosten blockt mit
    const dj = Math.hypot(w.px[j] - x, w.py[j] - y);
    if (dj < 1.3) p *= 0.72;
    const tx = (w.px[j] - x) * s, gd = (gx - x) * s;
    if (tx <= 0.3 || tx >= gd) continue;
    const f = tx / gd;
    const yl = y + (GOAL.half + 0.4 - y) * f, yr = y + (-GOAL.half - 0.4 - y) * f;
    if (w.py[j] < yl + 0.3 && w.py[j] > yr - 0.3) p *= tx < 4 ? 0.55 : 0.75;
  }
  // Torwart nicht in seiner Grundposition (zu weit vorn, falsche Ecke): mehr
  if (keeper >= 0) {
    const dx = x - gx, dy = y, dl = Math.hypot(dx, dy) || 1;
    const out = gkOut(dl);
    const cx = gx + (dx / dl) * out, cy = (dy / dl) * out * 0.8;
    const off = Math.hypot(w.px[keeper] - cx, w.py[keeper] - cy);
    if (off > 2.5) p = 1 - (1 - p) * Math.max(0.55, 1 - (off - 2.5) * 0.06);
  } else p = Math.max(p, 0.6);
  if (shooter >= 0) {
    // Schuss aus vollem Lauf quer zur Laufrichtung ist schwerer
    const sp = Math.hypot(w.vx[shooter], w.vy[shooter]);
    if (sp > 5.5) p *= 0.9;
  }
  return clamp(p, 0.001, 0.95);
}

function gauss(rand) {
  const u = Math.max(1e-9, rand()), v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function createShotResult() {
  return {
    result: '', aimY: 0, aimZ: 0, y: 0, z: 0, speed: 0, T: 0, xg: 0, onTarget: false,
    tEvent: 0, ex: 0, ey: 0, ez: 0, blocker: -1, keeper: -1, caught: false, diveDir: 0, diveAt: 0, dist: 0,
  };
}

// Plant den Schuss auf path und entscheidet sein Schicksal (Block, Parade, Tor, vorbei).
export function resolveShot(w, shooter, aimY, aimZ, path, tKick, rand, res) {
  const team = w.team[shooter];
  const s = sgnOf(team);
  const gx = GOAL.x * s;
  const bx = w.ball.x, by = w.ball.y;
  const dist = Math.hypot(gx - bx, aimY - by);
  res.dist = dist;
  res.xg = xG(w, bx, by, team, shooter);
  res.aimY = aimY; res.aimZ = aimZ;
  // Streuung: wächst mit Distanz, Tempo des Schützen und Gegnerdruck
  let near = Infinity;
  for (let j = 0; j < w.n; j++) if (w.team[j] !== team) near = Math.min(near, Math.hypot(w.px[j] - bx, w.py[j] - by));
  const sp = Math.hypot(w.vx[shooter], w.vy[shooter]);
  const sy = 0.3 + 0.05 * dist + (near < 1.8 ? 0.4 : 0) + (sp > 5.5 ? 0.25 : 0);
  const sz = 0.15 + 0.02 * dist + (near < 1.8 ? 0.15 : 0);
  res.y = aimY + gauss(rand) * sy;
  res.z = clamp(aimZ + gauss(rand) * sz, BALL.radius, 4);
  res.speed = clamp(29 - 0.08 * Math.abs(dist - 18) - (aimZ < 0.6 ? 2 : 0), 21, 30);
  res.onTarget = Math.abs(res.y) < GOAL.half - BALL.radius && res.z < GOAL.h - BALL.radius;
  const post = !res.onTarget && (Math.abs(Math.abs(res.y) - GOAL.half) < BALL.radius + 0.06 && res.z < GOAL.h + 0.1
    || (Math.abs(res.z - GOAL.h) < BALL.radius + 0.06 && Math.abs(res.y) < GOAL.half + 0.1));
  const T = planShot(path, bx, by, gx, res.y, res.z, res.speed, tKick, res.onTarget ? 1.6 : 9);
  res.T = T;
  res.blocker = -1; res.keeper = -1; res.caught = false; res.diveDir = 0; res.diveAt = 0;

  // 1) Block: Feldspieler, die rechtzeitig in die Schussbahn kommen (nur tiefe Bälle)
  for (let k = 1; k * LANE.sampleDt < T - 0.05; k++) {
    const tau = k * LANE.sampleDt;
    pathPos(path, tau, tmp);
    if (tmp[2] > 1.7) continue;
    for (let j = 0; j < w.n; j++) {
      if (w.team[j] === team || w.gk[j]) continue;
      const need = timeToIntercept(w, j, tmp[0], tmp[1], tmp[2], tau, 0.18) - 0.12; // Bein/Körper reinwerfen
      if (need <= tau && rand() < 0.75) {
        res.result = 'blocked'; res.blocker = j; res.tEvent = tau;
        res.ex = tmp[0]; res.ey = tmp[1]; res.ez = tmp[2];
        return res;
      }
    }
  }

  // 2) Torwart: Reaktion, dann Hechtsprung; Reichweite wächst mit der Zeit bis zur Stelle
  let keeper = -1;
  for (let j = 0; j < w.n; j++) if (w.team[j] !== team && w.gk[j]) keeper = j;
  res.keeper = keeper;
  if (res.onTarget && keeper >= 0) {
    const kx = w.px[keeper], ky = w.py[keeper];
    // Zeitpunkt, an dem der Ball die Linie des Torwarts kreuzt (sonst die Torlinie)
    const along = (kx - bx) * path.dx + (ky - by) * path.dy;
    const tau = clamp(along / res.speed, 0.05, T);
    pathPos(path, tau, tmp);
    const lat = Math.hypot(tmp[0] - kx, tmp[1] - ky);
    const high = tmp[2] > 1.9 ? KEEPER.highDrop : 0;
    const reach = Math.min(KEEPER.maxReach, KEEPER.stand + KEEPER.dive * Math.max(0, tau - KEEPER.react)) - high;
    // Grenzbereich: mal hält er, mal nicht
    const edge = (reach - lat) / 0.35;
    const pSave = clamp(0.5 + edge * 0.5, 0, 0.97);
    if (rand() < pSave) {
      res.result = 'saved';
      res.tEvent = tau; res.ex = tmp[0]; res.ey = tmp[1]; res.ez = tmp[2];
      res.caught = lat < 0.7 && tmp[2] < 1.7 && res.speed < 28 && rand() < 0.7;
      // Richtung aus Sicht der Simulation (+1: Ball liegt links vom Torwart in y)
      res.diveDir = lat > 0.6 ? Math.sign(tmp[1] - ky) : 0;
      res.diveAt = KEEPER.react;
      return res;
    }
    res.diveDir = lat > 0.6 ? Math.sign(tmp[1] - ky) : 0;
    res.diveAt = KEEPER.react;
  }
  res.tEvent = T;
  res.ex = gx; res.ey = res.y; res.ez = res.z;
  res.result = res.onTarget ? 'goal' : post ? 'post' : 'wide';
  return res;
}

export { SHOT };
