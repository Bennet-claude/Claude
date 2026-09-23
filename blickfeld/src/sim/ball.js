// Kinematischer Ball: Flugbahnen sind geschlossene Formeln der Zeit seit dem Schuss.
// Dadurch rechnen Simulation und Passweg-Analyse mit exakt derselben Bahn.

import { BALL } from '../config.js';
import { clamp } from '../core/math.js';

export const FLAT = 1;
export const LOFT = 2;

export function createPath() {
  return {
    mode: 0, ox: 0, oy: 0, dx: 1, dy: 0,
    v0: 0, dist: 0, T: 0, tKick: 0,
    h: 0, vh: 0, vz0: 0, tStop: 0,
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

// Zeit bis zur Ankunft bei Distanz d für einen hypothetischen Pass (ohne Pfad-Objekt).
export function arrivalTime(dist) {
  if (dist > BALL.loftThreshold) {
    const h = clamp(3.0 + 0.05 * (dist - BALL.loftThreshold), 3.0, 5.0);
    return 2 * Math.sqrt((2 * h) / BALL.gravity);
  }
  return flatTime(passSpeed(dist), dist);
}

// Zurückgelegte Strecke entlang der Richtung zur Zeit tau nach dem Schuss.
export function pathDistance(path, tau) {
  if (tau <= 0) return 0;
  const a = BALL.rollDecel;
  if (path.mode === LOFT) {
    if (tau <= path.T) return path.vh * tau;
    const v1 = path.vh * 0.45;
    const r = Math.min(tau - path.T, v1 / a);
    return path.dist + v1 * r - 0.5 * a * r * r;
  }
  const t = Math.min(tau, path.tStop);
  return path.v0 * t - 0.5 * a * t * t;
}

export function pathHeight(path, tau) {
  if (path.mode !== LOFT || tau <= 0 || tau >= path.T) return BALL.radius;
  return BALL.radius + path.vz0 * tau - 0.5 * BALL.gravity * tau * tau;
}

export function pathSpeed(path, tau) {
  const a = BALL.rollDecel;
  if (path.mode === LOFT) {
    if (tau <= path.T) return path.vh;
    return Math.max(0, path.vh * 0.45 - a * (tau - path.T));
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
