// Spielt alle echten Situationen headless durch und prüft Plausibilität.
// Aufruf: node tools/probe-real.mjs [anzahl]
import { World } from '../src/sim/world.js';
import { STEP } from '../src/config.js';
import { SITUATIONS, buildRealScene } from '../scenes/real/loader.js';
import { gradeDecision, evaluateOptions } from '../src/eval/evaluate.js';

const limit = +(process.argv[2] || SITUATIONS.length);
const stats = { arriveErr: [], passSpeed: [], outcomes: {}, grades: {}, bestType: {}, patterns: {}, nan: 0, errors: 0, recvSpeed: [], decideLen: [] };
const inc = (o, k) => { o[k] = (o[k] || 0) + 1; };

function run(i, mirror, policy) {
  const w = new World();
  const scene = buildRealScene(i, mirror);
  w.load(scene);
  let acted = false, shieldAt = -1;
  for (let k = 0; k < 60 * 14; k++) {
    // nach dem Sichern: nach 1 s den dann besten Pass spielen
    if (shieldAt >= 0 && w.phase === 'decide' && w.t - shieldAt > 1.0) {
      shieldAt = -1;
      const ev = evaluateOptions(w, w.user);
      const p = ev.options.filter((x) => x.type === 'pass').sort((a, b) => b.value - a.value)[0];
      w.input({ type: 'pass', target: p.target });
    }
    w.step(STEP);
    for (let j = 0; j < w.n; j++) if (!Number.isFinite(w.px[j]) || !Number.isFinite(w.py[j])) { stats.nan++; return null; }
    if (w.phase === 'decide' && !acted && policy) {
      if (policy === 'wait') { acted = true; continue; }
      const ev = w.evalAtReception;
      acted = true;
      let o = ev.best;
      if (policy === 'worst-pass') {
        const passes = ev.options.filter((x) => x.type === 'pass' && !w.gk[x.target]);
        o = passes.sort((a, b) => a.value - b.value)[0];
      }
      if (policy === 'shield') o = { type: 'shield' };
      if (o.type === 'pass') w.input({ type: 'pass', target: o.target });
      else if (o.type === 'dribble') w.input({ type: 'dribble', dx: o.dx, dy: o.dy });
      else { w.input({ type: 'shield' }); shieldAt = w.t; }
    }
    if (w.outcome && w.t - w.outcomeT > 0.3) break;
  }
  return w;
}

for (let i = 0; i < Math.min(limit, SITUATIONS.length); i++) {
  try {
    // Ankunft des Balls beim Spieler prüfen
    const w0 = new World();
    w0.load(buildRealScene(i, false));
    for (let k = 0; k < 60 * 8 && w0.phase !== 'decide'; k++) w0.step(STEP);
    if (w0.phase === 'decide') {
      const u = w0.user;
      stats.arriveErr.push(Math.hypot(w0.ball.x - w0.px[u], w0.ball.y - w0.py[u]));
      stats.passSpeed.push(w0.ball.path.v0);
      stats.recvSpeed.push(Math.hypot(w0.vx[u], w0.vy[u]));
      inc(stats.bestType, w0.evalAtReception.best.type);
    }
    for (const pol of ['best', 'wait', 'worst-pass']) {
      const w = run(i, i % 2 === 1, pol);
      if (!w || !w.outcome) { inc(stats.outcomes, `${pol}:kein-ende`); continue; }
      inc(stats.outcomes, `${pol}:${w.outcome.type}`);
      const g = gradeDecision(w);
      inc(stats.grades, `${pol}:${g.grade}`);
      if (pol === 'best') inc(stats.patterns, g.pattern);
      if (pol === 'wait') stats.decideLen.push(w.t - w.ev.reception);
    }
  } catch (err) {
    stats.errors++;
    if (stats.errors < 4) console.error(SITUATIONS[i].id, err);
  }
}
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(p * (s.length - 1))]; };
const quant = (a) => [0.05, 0.5, 0.95].map((p) => q(a, p).toFixed(2)).join(' / ');
console.log('Ball ↔ Spieler bei Annahme (m) 5%/50%/95%:', quant(stats.arriveErr));
console.log('Passtempo v0 (m/s):', quant(stats.passSpeed));
console.log('Tempo des Spielers bei Annahme (m/s):', quant(stats.recvSpeed));
console.log('Zeit bis Ballverlust ohne Aktion (s):', quant(stats.decideLen));
console.log('Beste Option nach Typ:', stats.bestType);
console.log('Ergebnisse:', stats.outcomes);
console.log('Noten:', stats.grades);
console.log('Muster der besten Lösung:', stats.patterns);
console.log('NaN:', stats.nan, 'Fehler:', stats.errors);
