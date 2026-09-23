import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32, hashString } from '../src/core/rng.js';
import { World } from '../src/sim/world.js';
import { FixedClock } from '../src/sim/clock.js';
import { STEP } from '../src/config.js';
import { M1_SCENE } from '../scenes/handmade.js';

test('mulberry32 ist reproduzierbar', () => {
  const a = mulberry32(1234), b = mulberry32(1234);
  for (let i = 0; i < 100; i++) assert.equal(a(), b());
  assert.notEqual(mulberry32(1)(), mulberry32(2)());
  assert.equal(hashString('blickfeld'), hashString('blickfeld'));
});

function runUntil(w, pred, maxSteps = 60 * 15) {
  for (let k = 0; k < maxSteps; k++) {
    if (pred(w)) return true;
    w.step(STEP);
  }
  return pred(w);
}

function playScene(actionAtReception, delayAfterReception = 0) {
  const w = new World();
  w.load(M1_SCENE);
  runUntil(w, (x) => x.phase === 'decide');
  const tRec = w.t;
  runUntil(w, (x) => x.t >= tRec + delayAfterReception - 1e-9);
  if (actionAtReception) w.input(actionAtReception(w));
  runUntil(w, (x) => x.outcome !== null);
  return w;
}

test('Szene: Pass zwischen die Linien sofort nach der Annahme kommt an', () => {
  const w = playScene((x) => ({ type: 'pass', target: x.idx.R8 }));
  assert.equal(w.outcome.type, 'received');
  assert.equal(w.passInfo.status, 'frei');
});

test('Szene: derselbe Pass 1,2 s später wird abgefangen', () => {
  const w = playScene((x) => ({ type: 'pass', target: x.idx.R8 }), 1.2);
  assert.equal(w.outcome.type, 'intercepted');
  assert.equal(w.passInfo.status, 'zu');
});

test('Szene: Pass auf den Stürmer zwischen die Innenverteidiger ist zu', () => {
  const w = playScene((x) => ({ type: 'pass', target: x.idx.ST }));
  assert.equal(w.outcome.type, 'intercepted');
});

test('Szene: Wer wartet, verliert den Ball', () => {
  const w = playScene(null);
  assert.equal(w.outcome.type, 'tackled');
  assert.ok(w.t - w.ev.reception > 1.2 && w.t - w.ev.reception < 3.0);
});

test('Szene: Direktpass vor der Annahme wird bei Ballankunft gespielt', () => {
  const w = new World();
  w.load(M1_SCENE);
  runUntil(w, (x) => x.phase === 'toUser');
  w.input({ type: 'pass', target: w.idx.LV });
  runUntil(w, (x) => x.outcome !== null);
  assert.equal(w.passInfo.direct, true);
  assert.equal(w.outcome.type, 'received');
});

test('Szene: Sichern gegen einen Gegenspieler hält den Ball', () => {
  const w = playScene(() => ({ type: 'shield' }), 0.3);
  assert.equal(w.outcome.type, 'shielded');
});

test('Determinismus: gleiche Eingaben → identischer Zustand', () => {
  const a = playScene((x) => ({ type: 'dribble', dx: Math.cos(2.4), dy: Math.sin(2.4) }), 0.2);
  const b = playScene((x) => ({ type: 'dribble', dx: Math.cos(2.4), dy: Math.sin(2.4) }), 0.2);
  assert.equal(a.outcome.type, b.outcome.type);
  assert.equal(a.tick, b.tick);
  for (let i = 0; i < a.n; i++) {
    assert.equal(a.px[i], b.px[i]);
    assert.equal(a.py[i], b.py[i]);
  }
});

test('Tempo ändert nichts am Ablauf: 0,25× und 1× liefern dieselben Schritte', () => {
  const runWithTempo = (tempo, frameDt) => {
    const w = new World();
    w.load(M1_SCENE);
    const clock = new FixedClock();
    clock.tempo = tempo;
    while (w.tick < 300) {
      const n = clock.advance(frameDt);
      for (let k = 0; k < n && w.tick < 300; k++) w.step(STEP);
    }
    return w;
  };
  const slow = runWithTempo(0.25, 1 / 60);
  const fast = runWithTempo(1, 1 / 57);
  assert.equal(slow.tick, fast.tick);
  for (let i = 0; i < slow.n; i++) {
    assert.equal(slow.px[i], fast.px[i]);
    assert.equal(slow.hd[i], fast.hd[i]);
  }
  assert.equal(slow.ball.x, fast.ball.x);
});
