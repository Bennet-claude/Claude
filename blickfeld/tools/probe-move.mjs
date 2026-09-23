// Spielt weitergeführte Spielzüge headless durch (w.continuous) und zählt, wie sie enden.
// Politik "gut": immer die beste Option, im Strafraum schießen, ohne Ball in die Tiefe sprinten
// und fordern. Aufruf: node tools/probe-move.mjs [anzahl] [politik]
import { World } from '../src/sim/world.js';
import { STEP } from '../src/config.js';
import { SITUATIONS, buildRealScene } from '../scenes/real/loader.js';
import { gradeDecision } from '../src/eval/evaluate.js';
import { evaluateMove } from '../src/eval/move.js';

const limit = +(process.argv[2] || 200);
const policy = process.argv[3] || 'gut';
const inc = (o, k) => { o[k] = (o[k] || 0) + 1; };
const S = { stars: {}, points: [], samples: [], userOpt: {}, byDist: {}, results: {}, decisions: [], len: [], nan: 0, errors: 0, userTouches: [], shots: 0, xg: 0, aiPicks: {}, grades: {}, firstType: {}, choice: {} };

function act(w, pol) {
  const ev = w.evalAtReception;
  let o = ev.best;
  if (pol === 'schuss') {
    const s = ev.options.find((x) => x.type === 'shot');
    if (s) o = s;
  }
  if (pol === 'raum' || pol === 'punkt') {
    // Pass in den Raum 6 m vor den besten Passempfänger
    const p = ev.options.filter((x) => x.type === 'pass').sort((a, b) => b.value - a.value)[0];
    if (p) { w.input({ type: 'space', x: p.tx + (pol === 'raum' ? 4 : 0), y: p.ty }); inc(S.choice, 'space'); return; }
  }
  inc(S.choice, o.type);
  if (o.type === 'pass') w.input({ type: 'pass', target: o.target });
  else if (o.type === 'dribble') w.input({ type: 'dribble', dx: o.dx, dy: o.dy });
  else if (o.type === 'shot') w.input({ type: 'shot', y: (w.rand() < 0.5 ? -1 : 1) * 2.6, z: 0.5 });
  else w.input({ type: 'shield' });
}

function run(i, mirror) {
  const w = new World();
  w.continuous = true;
  w.load(buildRealScene(i, mirror));
  let lastDec = -1, ranAt = -1;
  for (let k = 0; k < 60 * 40; k++) {
    if (w.phase === 'decide' && w.ev.reception !== lastDec && w.t - w.ev.reception > 0.35) {
      lastDec = w.ev.reception;
      act(w, policy);
    }
    if (w.phase === 'team' && w.t - ranAt > 3) {
      ranAt = w.t;
      w.input({ type: 'run', dx: 0.9, dy: w.py[w.user] > 0 ? -0.43 : 0.43 });
      w.input({ type: 'demand' });
    }
    w.step(STEP);
    for (let j = 0; j < w.n; j++) if (!Number.isFinite(w.px[j]) || !Number.isFinite(w.py[j])) { S.nan++; return null; }
    if (!Number.isFinite(w.ball.x) || !Number.isFinite(w.ball.y)) { S.nan++; return null; }
    if (w.outcome && w.t - w.outcomeT > 0.5) break;
  }
  return w;
}

const n = Math.min(limit, SITUATIONS.length);
const t0 = Date.now();
for (let i = 0; i < n; i++) {
  try {
    const w = run(i, i % 2 === 1);
    if (!w) continue;
    if (!w.outcome) { inc(S.results, 'kein-ende'); continue; }
    inc(S.results, w.outcome.type + (w.outcome.type === 'lost' ? ':' + w.move.lostBy : ''));
    S.decisions.push(w.decisions.length);
    S.len.push(w.t - (w.move.t0 >= 0 ? w.move.t0 : w.t));
    S.userTouches.push(w.move.userTouches);
    for (const e of w.move.events) {
      if (e.type === 'ai') {
        inc(S.aiPicks, e.pick + (e.to === w.user ? '→du' : ''));
        const u = e.user;
        inc(S.userOpt, !u ? 'keine' : u.status + (u.tPress <= 0.25 ? '/gedrückt' : '') + (u.value < e.best - 0.05 ? '/viel schlechter' : u.value < e.best - 0.02 ? '/schlechter' : '/ok'));
      }
      if (e.type === 'shot') {
        S.shots++; S.xg += e.xg;
        const b = e.dist < 11 ? '<11' : e.dist < 17 ? '11-17' : e.dist < 25 ? '17-25' : '25+';
        const r = (S.byDist[b] ||= { n: 0, goal: 0, xg: 0, onT: 0 });
        r.n++; r.xg += e.xg; if (e.result === 'goal') r.goal++; if (e.onTarget) r.onT++;
      }
    }
    for (const d of w.decisions) inc(S.grades, gradeDecision(d).grade);
    const m = evaluateMove(w);
    inc(S.stars, m.stars);
    S.points.push(m.points);
    if (S.samples.length < 6 && (i % 37 === 0)) S.samples.push(`${m.head} ★${m.stars} ${m.points} P · ${m.items.map((x) => x.label + ':' + x.grade).join(' | ')}\n   ${m.key}\n   Tipp: ${m.tip}`);
    if (w.decisions[0]) inc(S.firstType, w.decisions[0].outcome.type);
  } catch (e) {
    S.errors++;
    if (S.errors < 4) console.error(i, e);
  }
}
const avg = (a) => (a.length ? (a.reduce((s, v) => s + v, 0) / a.length).toFixed(2) : '–');
console.log(`Politik ${policy}, ${n} Szenen, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
console.log('Ende:', S.results);
console.log('erste Entscheidung →', S.firstType);
console.log('Wahl:', S.choice);
console.log('Noten:', S.grades, 'Sterne:', S.stars, 'Ø Punkte', avg(S.points));
for (const x of S.samples) console.log(' ·', x);
console.log('KI:', S.aiPicks);
console.log('Nutzer-Option bei KI-Entscheidungen:', S.userOpt);
for (const [k, r] of Object.entries(S.byDist)) console.log(`Schüsse ${k} m: ${r.n}, Tore ${r.goal}, aufs Tor ${r.onT}, Σ xG ${r.xg.toFixed(1)}`);
console.log(`Ø Entscheidungen ${avg(S.decisions)} · Ø Ballkontakte ${avg(S.userTouches)} · Ø Dauer ${avg(S.len)} s · Schüsse ${S.shots} (Σ xG ${S.xg.toFixed(1)}) · NaN ${S.nan} · Fehler ${S.errors}`);
