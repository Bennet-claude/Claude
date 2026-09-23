import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/sim/world.js';
import { STEP } from '../src/config.js';
import { SITUATIONS, buildRealScene, decodeTracks } from '../scenes/real/loader.js';
import { pickNext, PHASES } from '../src/generator/scheduler.js';
import { mulberry32 } from '../src/core/rng.js';

test('Bibliothek: genug echte Situationen, alle dekodierbar und plausibel', () => {
  assert.ok(SITUATIONS.length >= 300);
  for (const e of SITUATIONS) {
    const { xs, ys } = decodeTracks(e, false);
    for (let o = 0; o < 22; o++) {
      for (let k = 0; k < e.ns; k++) {
        assert.ok(Math.abs(xs[o][k]) < 60 && Math.abs(ys[o][k]) < 40, `${e.id}: Position außerhalb`);
      }
    }
    assert.ok(e.tk < e.tr && e.tr < e.ta + 0.01, `${e.id}: Zeitachse`);
  }
});

test('Echte Situation: Ball kommt sauber getimet am Fuß des Spielers an, alle in Bewegung', () => {
  const rng = mulberry32(7);
  for (let n = 0; n < 40; n++) {
    const i = Math.floor(rng() * SITUATIONS.length);
    const w = new World();
    w.load(buildRealScene(i, n % 2 === 1));
    let moving = 0;
    for (let k = 0; k < 60 * 8 && w.phase !== 'decide'; k++) {
      w.step(STEP);
      if (k === 30) for (let j = 0; j < w.n; j++) if (Math.hypot(w.vx[j], w.vy[j]) > 0.8) moving++;
    }
    assert.equal(w.phase, 'decide', `${SITUATIONS[i].id}: keine Annahme`);
    const u = w.user;
    assert.ok(Math.hypot(w.ball.x - w.px[u], w.ball.y - w.py[u]) < 0.6, 'Ball am Fuß');
    assert.ok(w.ball.path.v0 >= 9.5 && w.ball.path.v0 <= 25, `Passtempo ${w.ball.path.v0}`);
    assert.ok(moving >= 6, 'mehrere Spieler in Bewegung');
  }
});

test('Echte Situation: gespiegelt ist die gleiche Szene seitenverkehrt', () => {
  const a = new World(), b = new World();
  a.load(buildRealScene(5, false));
  b.load(buildRealScene(5, true));
  for (let j = 0; j < 22; j++) {
    assert.ok(Math.abs(a.px[j] - b.px[j]) < 1e-9);
    assert.ok(Math.abs(a.py[j] + b.py[j]) < 1e-9);
  }
});

test('Auswahl: keine Wiederholung, nie drei gleiche Phasen hintereinander, Position wird beachtet', () => {
  const rng = mulberry32(3);
  const state = { history: [], phases: [], stats: {} };
  const seen = new Set();
  for (let k = 0; k < 120; k++) {
    const pick = pickNext(SITUATIONS, '8', state, rng);
    const e = SITUATIONS[pick.index];
    assert.equal(e.pos, 8);
    assert.ok(!seen.has(e.id), 'Wiederholung');
    seen.add(e.id);
    const ph = state.phases;
    if (ph.length >= 2) assert.ok(!(ph[ph.length - 1] === e.phase && ph[ph.length - 2] === e.phase), 'drei gleiche Phasen');
    state.history.push(e.id);
    state.phases.push(e.phase);
  }
});

test('Auswahl: schwache Phase kommt häufiger, aber nicht dominant', () => {
  const rng = mulberry32(11);
  const stats = {};
  for (const p of PHASES) stats[p] = { n: 10, avg: 85 };
  stats.gegenpressing = { n: 10, avg: 10 };
  const count = {};
  for (let k = 0; k < 600; k++) {
    const pick = pickNext(SITUATIONS, 'mix', { history: [], phases: [], stats }, rng);
    const p = SITUATIONS[pick.index].phase;
    count[p] = (count[p] || 0) + 1;
  }
  const share = count.gegenpressing / 600;
  const base = SITUATIONS.filter((e) => e.phase === 'gegenpressing').length / SITUATIONS.length;
  assert.ok(share > base * 1.2, `Anteil ${share} vs. Basis ${base}`);
  for (const p in count) assert.ok(count[p] / 600 <= 0.4, `${p} zu dominant`);
});
