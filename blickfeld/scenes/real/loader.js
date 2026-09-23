// Baut aus einem Eintrag der Bibliothek (echte Situation) eine spielbare Szene.
// Alle 22 Spieler und der Ball folgen zunächst ihren echten Laufwegen; der Empfänger des
// Passes ist der Spieler. Optional gespiegelt (links ↔ rechts) für doppelte Vielfalt.

import { SITUATIONS, SAMPLE_DT, QUANT } from './library.js';
import { createReplay } from '../../src/sim/replay.js';
import { hashString, mulberry32 } from '../../src/core/rng.js';

export { SITUATIONS };

function base64ToBytes(b64) {
  if (typeof atob === 'function') {
    const s = atob(b64);
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }
  return new Uint8Array(Buffer.from(b64, 'base64'));
}

export function decodeTracks(entry, mirror) {
  const bytes = base64ToBytes(entry.data);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const n = entry.ns;
  const xs = [], ys = [];
  let o = 0;
  for (let obj = 0; obj < 23; obj++) {
    const arr = [];
    for (let c = 0; c < 2; c++) {
      const a = new Float32Array(n);
      let v = dv.getInt16(o, true); o += 2;
      a[0] = v * QUANT;
      for (let k = 1; k < n; k++) { v += dv.getInt8(o); o++; a[k] = v * QUANT; }
      if (c === 1 && mirror) for (let k = 0; k < n; k++) a[k] = -a[k];
      arr.push(a);
    }
    xs.push(arr[0]); ys.push(arr[1]);
  }
  return { xs, ys, n };
}

function mean(a) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i]; return s / a.length; }

// Rückennummern nach Rolle: 4 tiefste = Abwehr (2, 4, 5, 3 von rechts nach links),
// 3 mittlere = 6/8/10 nach Tiefe, 3 vorderste = 7/9/11 von rechts nach links.
function assignNumbers(xs, ys, from, attackSign) {
  const idx = [];
  for (let i = from + 1; i < from + 11; i++) idx.push({ i, x: mean(xs[i]) * attackSign, y: mean(ys[i]) * attackSign });
  idx.sort((a, b) => a.x - b.x);
  const nums = {};
  nums[from] = 1;
  const def = idx.slice(0, 4).sort((a, b) => a.y - b.y);
  [2, 4, 5, 3].forEach((n, k) => { nums[def[k].i] = n; });
  const mid = idx.slice(4, 7);
  [6, 8, 10].forEach((n, k) => { nums[mid[k].i] = n; });
  const att = idx.slice(7, 10).sort((a, b) => a.y - b.y);
  [7, 9, 11].forEach((n, k) => { nums[att[k].i] = n; });
  return nums;
}

export function buildRealScene(entryIndex, mirror) {
  const e = SITUATIONS[entryIndex];
  const { xs, ys, n } = decodeTracks(e, mirror);
  const replay = createReplay(SAMPLE_DT, n, xs, ys);
  const kRec = e.tr / SAMPLE_DT;
  const at = (k, t) => {
    const s = Math.min(n - 1.001, t / SAMPLE_DT), i = Math.floor(s), u = s - i;
    return [xs[k][i] + (xs[k][i + 1] - xs[k][i]) * u, ys[k][i] + (ys[k][i + 1] - ys[k][i]) * u];
  };
  const own = assignNumbers(xs, ys, 0, 1);
  const opp = assignNumbers(xs, ys, 11, -1);
  // Spielernummer passend zur Position (6/8/10), ggf. tauschen
  const want = e.pos;
  const holder = Object.keys(own).find((k) => own[k] === want);
  if (holder !== undefined && +holder !== e.r) { own[holder] = own[e.r]; }
  own[e.r] = want;
  const rng = mulberry32(hashString(e.id));
  const ball0 = at(22, 0);
  const players = [];
  for (let i = 0; i < 22; i++) {
    const p0 = at(i, 0);
    players.push({
      id: `p${i}`,
      team: i < 11 ? 0 : 1,
      num: i < 11 ? own[i] : opp[i],
      role: i === 0 || i === 11 ? 'TW' : 'FS',
      user: i === e.r,
      heading: (Math.atan2(ball0[1] - p0[1], ball0[0] - p0[0]) * 180) / Math.PI,
      skin: Math.floor(rng() * 5),
      script: { type: 'replay', k: i },
      pos: p0,
    });
  }
  const rec = at(e.r, e.tr);
  return {
    id: e.id + (mirror ? 'm' : ''),
    baseId: e.id,
    meta: {
      position: e.pos, lane: e.lane, phase: e.phase, pressure: e.pressure,
      context: e.ctx, source: 'real', options: e.opt,
    },
    replay,
    ballRef: rec,
    receive: rec,
    pass: { from: `p${e.p}`, at: e.tk, T: e.tr - e.tk, lofted: !!e.lo },
    release: e.ta + 0.25,
    players,
    kRec,
  };
}
