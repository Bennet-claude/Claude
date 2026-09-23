// Kinematischer Ball: Flugbahnen sind geschlossene Formeln der Zeit seit dem Schuss.
// Dadurch rechnen Simulation und Passweg-Analyse mit exakt derselben Bahn.

import { BALL } from '../config.js';
import { clamp } from '../core/math.js';

export const FLAT = 1;
export const LOFT = 2;
export const SHOT = 3;

export function createPath() {
  return {
    mode: 0, ox: 0, oy: 0, dx: 1, dy: 0,
    v0: 0, dist: 0, T: 0, tKick: 0,
    h: 0, vh: 0, vz0: 0, tStop: 0,
    decel: BALL.rollDecel, roll: 0.45, z0: 0, end: Infinity,
  };
}

export function copyPath(dst, src) {
  for (const k in src) dst[k] = src[k];
  return dst;
}

export function passSpeed(dist) {
  return clamp(9 + 0.35 * dist, BALL.minPass, BALL.maxPass);
}

// Zeit bis ein flacher Ball mit v0 die Strecke d zurücklegt (Infinity, wenn er vorher liegen bleibt).
export function flatTime(v0, d) {
  const a = BALL.rollDecel;
  const disc = v0 * v0 - 2 * a * d;
  if (disc < 0) return Infinity;
  return (v0 - Math.sqrt(disc)) / a;
}

// Plant einen Pass von (ox,oy) nach (tx,ty). Über loftThreshold automatisch halbhoch.
export function planPass(path, ox, oy, tx, ty, tKick) {
  const ddx = tx - ox, ddy = ty - oy;
  const dist = Math.max(0.5, Math.sqrt(ddx * ddx + ddy * ddy));
  path.ox = ox; path.oy = oy;
  path.dx = ddx / dist; path.dy = ddy / dist;
  path.dist = dist; path.tKick = tKick;
  path.decel = BALL.rollDecel; path.roll = 0.45; path.z0 = 0; path.end = Infinity;
  if (dist > BALL.loftThreshold) {
    const h = clamp(3.0 + 0.05 * (dist - BALL.loftThreshold), 3.0, 5.0);
    const T = 2 * Math.sqrt((2 * h) / BALL.gravity);
    path.mode = LOFT;
    path.h = h; path.T = T; path.vh = dist / T; path.vz0 = (BALL.gravity * T) / 2;
    path.v0 = path.vh;
    // nach der Landung rollt er mit reduziertem Tempo weiter
    const vRoll = path.vh * 0.45;
    path.tStop = T + vRoll / BALL.rollDecel;
  } else {
    const v0 = passSpeed(dist);
    path.mode = FLAT;
    path.v0 = v0; path.T = flatTime(v0, dist); path.h = 0;
    path.tStop = v0 / BALL.rollDecel;
  }
  return path.T;
}

// Pass mit vorgegebener Flugzeit T (aus echten Daten): Tempo so, dass der Ball genau
// dann beim Empfänger ist. Flach: s(T) = v0·T − ½·a·T² = d. Halbhoch: Scheitel aus T.
export function planPassTimed(path, ox, oy, tx, ty, T, lofted, tKick) {
  const ddx = tx - ox, ddy = ty - oy;
  const dist = Math.max(0.5, Math.sqrt(ddx * ddx + ddy * ddy));
  path.ox = ox; path.oy = oy;
  path.dx = ddx / dist; path.dy = ddy / dist;
  path.dist = dist; path.tKick = tKick;
  path.decel = BALL.rollDecel; path.roll = 0.45; path.z0 = 0; path.end = Infinity;
  const a = BALL.rollDecel;
  let v0 = (dist + 0.5 * a * T * T) / T;
  if (lofted || v0 > 24) {
    const h = clamp((BALL.gravity * T * T) / 8, 1.2, 8);
    path.mode = LOFT;
    path.h = h; path.T = T; path.vh = dist / T; path.vz0 = (BALL.gravity * T) / 2;
    path.v0 = path.vh;
    path.tStop = T + (path.vh * 0.45) / a;
    return T;
  }
  v0 = Math.max(v0, a * T + 1);
  path.mode = FLAT;
  path.v0 = v0; path.T = flatTime(v0, dist); path.h = 0;
  path.tStop = v0 / a;
  return path.T;
}

// Zeit bis zur Ankunft bei Distanz d für einen hypothetischen Pass (ohne Pfad-Objekt).
export function arrivalTime(dist) {
  if (dist > BALL.loftThreshold) {
    const h = clamp(3.0 + 0.05 * (dist - BALL.loftThreshold), 3.0, 5.0);
    return 2 * Math.sqrt((2 * h) / BALL.gravity);
  }
  return flatTime(passSpeed(dist), dist);
}

// Pass in den Raum: Der Ball soll dort ankommen, wo hingetippt wurde, und kurz danach
// liegen bleiben – mit Gefühl gespielt (stärker gebremst als ein scharfer Pass).
// Weiter als 32 m: halbhoch, landet am Punkt und rollt nur noch kurz aus.
export const SPACE = { decel: 2.0, loftFrom: 32, roll: 0.22 };
export function planSpace(path, ox, oy, tx, ty, tKick) {
  const ddx = tx - ox, ddy = ty - oy;
  const dist = Math.max(0.5, Math.sqrt(ddx * ddx + ddy * ddy));
  path.ox = ox; path.oy = oy;
  path.dx = ddx / dist; path.dy = ddy / dist;
  path.dist = dist; path.tKick = tKick; path.z0 = 0; path.end = Infinity;
  if (dist > SPACE.loftFrom) {
    const h = clamp(2.6 + 0.06 * (dist - SPACE.loftFrom), 2.6, 6);
    const T = 2 * Math.sqrt((2 * h) / BALL.gravity);
    path.mode = LOFT; path.decel = SPACE.decel; path.roll = SPACE.roll;
    path.h = h; path.T = T; path.vh = dist / T; path.vz0 = (BALL.gravity * T) / 2; path.v0 = path.vh;
    path.tStop = T + (path.vh * path.roll) / path.decel;
    return path.T;
  }
  const a = SPACE.decel;
  // etwas weicher als ein Pass in den Fuß, aber mit Zug: ≈ 1,2–1,6 s für 15–25 m
  const v0 = clamp(0.85 * passSpeed(dist), 8, 17);
  const vEnd = Math.sqrt(Math.max(0.25, v0 * v0 - 2 * a * dist));
  path.mode = FLAT; path.decel = a; path.roll = 0.45; path.h = 0;
  path.v0 = v0; path.T = (v0 - vEnd) / a; path.tStop = v0 / a;
  return path.T;
}

// Torschuss: gerade Bahn mit konstantem Tempo, Höhe als Parabel. (gx, gy, gz) ist der Punkt
// auf der Torlinie; danach fliegt der Ball weiter bis end (Netz oder hinter das Tor).
export function planShot(path, ox, oy, gx, gy, gz, speed, tKick, beyond) {
  const ddx = gx - ox, ddy = gy - oy;
  const dist = Math.max(0.5, Math.sqrt(ddx * ddx + ddy * ddy));
  path.ox = ox; path.oy = oy;
  path.dx = ddx / dist; path.dy = ddy / dist;
  path.dist = dist; path.tKick = tKick;
  path.mode = SHOT; path.v0 = speed; path.vh = speed; path.decel = 0; path.z0 = 0; path.roll = 0;
  const T = dist / speed;
  path.T = T;
  path.vz0 = (gz - BALL.radius + 0.5 * BALL.gravity * T * T) / T;
  path.end = dist + (beyond ?? 1.6);
  path.tStop = path.end / speed;
  path.h = 0;
  return T;
}

// Abpraller (Parade, Block): kurzer Bogen aus Höhe z0 zum Punkt (tx, ty)
export function planDeflect(path, ox, oy, oz, tx, ty, T, tKick) {
  const ddx = tx - ox, ddy = ty - oy;
  const dist = Math.max(0.3, Math.sqrt(ddx * ddx + ddy * ddy));
  path.ox = ox; path.oy = oy;
  path.dx = ddx / dist; path.dy = ddy / dist;
  path.dist = dist; path.tKick = tKick;
  path.mode = LOFT; path.decel = 2.5; path.roll = 0.35; path.end = Infinity;
  path.z0 = Math.max(0, oz - BALL.radius);
  path.T = T; path.vh = dist / T; path.v0 = path.vh;
  path.vz0 = (BALL.gravity * T) / 2;
  path.h = 0;
  path.tStop = T + (path.vh * path.roll) / path.decel;
  return T;
}

// Zurückgelegte Strecke entlang der Richtung zur Zeit tau nach dem Schuss.
export function pathDistance(path, tau) {
  if (tau <= 0) return 0;
  const a = path.decel;
  if (path.mode === SHOT) return Math.min(path.v0 * tau, path.end);
  if (path.mode === LOFT) {
    if (tau <= path.T) return path.vh * tau;
    const v1 = path.vh * path.roll;
    const r = Math.min(tau - path.T, v1 / a);
    return path.dist + v1 * r - 0.5 * a * r * r;
  }
  const t = Math.min(tau, path.tStop);
  return path.v0 * t - 0.5 * a * t * t;
}

export function pathHeight(path, tau) {
  if (path.mode === SHOT) {
    if (tau <= 0) return BALL.radius;
    const tt = Math.min(tau, path.tStop);
    const z = BALL.radius + path.vz0 * tt - 0.5 * BALL.gravity * tt * tt;
    return Math.max(BALL.radius, z);
  }
  if (path.mode !== LOFT || tau <= 0 || tau >= path.T) return BALL.radius;
  const lin = path.z0 ? path.z0 * (1 - tau / path.T) : 0; // Abpraller aus der Höhe
  return Math.max(BALL.radius, BALL.radius + lin + path.vz0 * tau - 0.5 * BALL.gravity * tau * tau);
}

export function pathSpeed(path, tau) {
  const a = path.decel;
  if (path.mode === SHOT) return tau < path.tStop ? path.v0 : 0;
  if (path.mode === LOFT) {
    if (tau <= path.T) return path.vh;
    return Math.max(0, path.vh * path.roll - a * (tau - path.T));
  }
  return Math.max(0, path.v0 - a * tau);
}

// Schreibt Position in out[0..2]. out ist ein vorab angelegtes Array.
export function pathPos(path, tau, out) {
  const s = pathDistance(path, tau);
  out[0] = path.ox + path.dx * s;
  out[1] = path.oy + path.dy * s;
  out[2] = pathHeight(path, tau);
  return out;
}
