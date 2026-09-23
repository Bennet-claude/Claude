// Diagnose einer Szene in Node: Passwege zu mehreren Zeitpunkten, Zeit bis zum Tackling.
// Aufruf: node tools/probe.mjs
import { World } from '../src/sim/world.js';
import { STEP } from '../src/config.js';
import { M1_SCENE } from '../scenes/handmade.js';
import { passOptions, createOptionList } from '../src/eval/options.js';
import { analyzeDribble, createDribbleResult } from '../src/eval/lanes.js';

const w = new World();
w.load(M1_SCENE);
const opts = createOptionList();
const dr = createDribbleResult();
const probes = [0, 0.3, 0.6, 0.9, 1.2];
let recT = -1;
const fmt = (v) => (v === Infinity ? ' inf' : v.toFixed(2).padStart(5));
for (let k = 0; k < 60 * 12; k++) {
  w.step(STEP);
  if (w.phase === 'decide' && recT < 0) {
    recT = w.t;
    console.log(`Annahme bei t=${recT.toFixed(2)}s, Nutzer bei (${w.px[w.user].toFixed(1)}, ${w.py[w.user].toFixed(1)})`);
  }
  if (recT >= 0 && w.phase === 'decide') {
    for (const p of probes) {
      if (Math.abs(w.t - recT - p) < STEP / 2) {
        passOptions(w, w.user, opts);
        const row = [];
        for (let i = 0; i < opts.count; i++) {
          const o = opts[i];
          row.push(`${w.ids[o.target]}:${o.status}${fmt(o.margin)}${o.lofted ? 'L' : ''}${o.offside ? '!OFF' : ''}(${o.critical >= 0 ? w.ids[o.critical] : '-'})`);
        }
        console.log(`+${p.toFixed(1)}s  ` + row.join('  '));
        const dirs = [];
        for (let a = -180; a < 180; a += 45) {
          const r = (a * Math.PI) / 180;
          analyzeDribble(w, w.user, Math.cos(r), Math.sin(r), 2.2, dr);
          dirs.push(`${a}°:${dr.tackler >= 0 ? 'x' + dr.tTackle.toFixed(1) : 'ok'}/${dr.gain.toFixed(0)}m`);
        }
        console.log('        Dribbling ' + dirs.join(' '));
        let near = Infinity, who = '';
        for (let j = 0; j < w.n; j++) if (w.team[j] === 1) {
          const d = Math.hypot(w.px[j] - w.px[w.user], w.py[j] - w.py[w.user]);
          if (d < near) { near = d; who = w.ids[j]; }
        }
        console.log(`        nächster Gegner ${who} ${near.toFixed(1)} m`);
      }
    }
  }
  if (w.outcome) { console.log(`Ergebnis ohne Aktion: ${w.outcome.type} bei t=${w.t.toFixed(2)} (${(w.t - recT).toFixed(2)} s nach Annahme)`); break; }
}
