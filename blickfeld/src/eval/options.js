// Handlungsoptionen zum aktuellen Zeitpunkt: Passwege zu allen Mitspielern.
// Wird von der Debug-Anzeige genutzt; in M2 kommt hier die vollständige Bewertung dazu.

import { PITCH } from '../config.js';
import { clamp } from '../core/math.js';
import { createPath, planPass, arrivalTime, LOFT } from '../sim/ball.js';
import { analyzePath, createLaneResult, isOffside } from './lanes.js';

const path = createPath();
const lane = createLaneResult();

export function createOptionList(n = 22) {
  const list = [];
  for (let i = 0; i < n; i++) {
    list.push({ target: -1, status: 'frei', margin: 0, lofted: false, dist: 0, offside: false, critical: -1 });
  }
  list.count = 0;
  return list;
}

// Pässe vom Ballführer (Ballposition) zu allen Mitspielern.
export function passOptions(w, carrier, out) {
  const bx = w.ball.x, by = w.ball.y;
  const team = w.team[carrier];
  const def = team === 0 ? 1 : 0;
  let k = 0;
  for (let r = 0; r < w.n; r++) {
    if (r === carrier || w.team[r] !== team) continue;
    let Px = w.px[r], Py = w.py[r];
    for (let it = 0; it < 4; it++) {
      const d = Math.sqrt((Px - bx) * (Px - bx) + (Py - by) * (Py - by));
      const T = arrivalTime(d);
      Px = clamp(w.px[r] + w.vx[r] * T, -PITCH.length / 2 + 1, PITCH.length / 2 - 1);
      Py = clamp(w.py[r] + w.vy[r] * T, -PITCH.width / 2 + 1, PITCH.width / 2 - 1);
    }
    planPass(path, bx, by, Px, Py, 0);
    analyzePath(w, path, def, lane);
    const o = out[k++];
    o.target = r; o.status = lane.status; o.margin = lane.margin; o.critical = lane.critical;
    o.lofted = path.mode === LOFT; o.dist = path.dist; o.offside = isOffside(w, r, bx);
  }
  out.count = k;
  return out;
}
