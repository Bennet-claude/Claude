// Weitergeführter Spielzug: Pass in den Raum, Schuss, KI mit Ball, Ende und Gesamtbewertung.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/sim/world.js';
import { STEP, PITCH } from '../src/config.js';
import { SITUATIONS, buildRealScene } from '../scenes/real/loader.js';
import { createPath, planSpace, planShot, pathPos, SPACE } from '../src/sim/ball.js';
import { createRace, raceForBall } from '../src/eval/lanes.js';
import { xG, resolveShot, createShotResult } from '../src/sim/shot.js';
import { evaluateMove } from '../src/eval/move.js';
import { gradeDecision } from '../src/eval/evaluate.js';
import { mulberry32 } from '../src/core/rng.js';

function step(w, n) { for (let k = 0; k < n; k++) w.step(STEP); }
function until(w, pred, max = 60 * 30) {
  for (let k = 0; k < max && !pred(w); k++) w.step(STEP);
  return pred(w);
}
function load(i, mirror = false) {
  const w = new World();
  w.continuous = true;
  w.load(buildRealScene(i, mirror));
  return w;
}

test('Pass in den Raum: Ball kommt am getippten Punkt an und bleibt bald liegen', () => {
  const p = createPath();
  const out = new Float64Array(3);
  for (const d of [8, 15, 25, 31]) {
    planSpace(p, 0, 0, d, 0, 0);
    pathPos(p, p.T, out);
    assert.ok(Math.abs(out[0] - d) < 0.05, `Ankunft bei ${d} m`);
    assert.ok(p.T > 0.5 && p.T < 3.2, `Laufzeit ${p.T.toFixed(2)} s bei ${d} m`);
    pathPos(p, p.tStop, out);
    assert.ok(out[0] - d < 45, 'rollt nicht endlos weiter');
  }
  planSpace(p, 0, 0, 40, 0, 0); // halbhoch
  pathPos(p, p.T, out);
  assert.ok(Math.abs(out[0] - 40) < 0.05);
  pathPos(p, p.tStop, out);
  assert.ok(out[0] - 40 < 12, 'halbhoher Ball rollt nur kurz aus');
  assert.ok(SPACE.decel > 1.5);
});

test('Schussbahn: trifft die Torlinie auf der geplanten Höhe', () => {
  const p = createPath();
  const out = new Float64Array(3);
  planShot(p, 36, 4, 52.5, -2.5, 1.2, 26, 0, 1.6);
  pathPos(p, p.T, out);
  assert.ok(Math.abs(out[0] - 52.5) < 0.02 && Math.abs(out[1] + 2.5) < 0.02 && Math.abs(out[2] - 1.2) < 0.02);
  pathPos(p, p.tStop + 1, out);
  assert.ok(out[0] > 52.5 && out[0] < 55, 'Ball bleibt im Netz');
});

test('xG: nah und zentral hoch, weit und spitz niedrig', () => {
  // nur der Torwart in Grundposition
  const w = { n: 1, team: [1], gk: [1], px: [51.5], py: [0], vx: [0], vy: [0] };
  const team = 0;
  const near = xG(w, 41.5, 0, team);
  w.px[0] = 51.2;
  const far = xG(w, 22.5, 0, team);
  const tight = xG(w, 50, 30, team);
  assert.ok(near > 0.2 && near < 0.6, `11 m: ${near}`);
  assert.ok(far < 0.06, `30 m: ${far}`);
  assert.ok(tight < 0.03, `spitzer Winkel: ${tight}`);
});

test('Schuss ist mit gleichem Seed reproduzierbar, Ergebnis immer eines der bekannten', () => {
  const w = load(3);
  until(w, (x) => x.phase === 'decide');
  w.ball.x = 40; w.ball.y = 3;
  const res = ['goal', 'saved', 'wide', 'post', 'blocked'];
  const a = resolveShot(w, w.user, 2.8, 0.5, createPath(), w.t, mulberry32(9), createShotResult());
  const b = resolveShot(w, w.user, 2.8, 0.5, createPath(), w.t, mulberry32(9), createShotResult());
  assert.equal(a.result, b.result);
  assert.equal(a.y, b.y);
  assert.ok(res.includes(a.result));
});

test('Wettlauf zum Ball: Pass in den freien Raum vor einen Mitspieler gewinnt dieser', () => {
  let found = 0;
  for (let i = 0; i < 60 && found < 5; i++) {
    const w = load(i);
    if (!until(w, (x) => x.phase === 'decide', 60 * 10)) continue;
    const ev = w.evalAtReception;
    const o = ev.options.filter((x) => x.type === 'pass' && x.status === 'frei' && x.pS > 0.97).sort((a, b) => b.value - a.value)[0];
    if (!o) continue;
    const p = createPath();
    planSpace(p, w.ball.x, w.ball.y, o.tx, o.ty, 0);
    const r = raceForBall(w, p, w.user, w.team[w.user], createRace());
    assert.ok(r.winner >= 0, 'jemand kommt an den Ball');
    assert.equal(w.team[r.winner], w.team[w.user], `Szene ${i}: freier Pass in den Raum geht an den Mitspieler`);
    found++;
  }
  assert.ok(found >= 3);
});

test('Spielzug läuft nach dem Pass weiter und endet sicher', () => {
  const ends = {};
  for (let i = 0; i < 30; i++) {
    const w = load(i, i % 2 === 1);
    let last = -1;
    for (let k = 0; k < 60 * 40 && !w.outcome; k++) {
      if (w.phase === 'decide' && w.ev.reception !== last && w.t - w.ev.reception > 0.3) {
        last = w.ev.reception;
        const b = w.evalAtReception.best;
        if (b.type === 'pass') w.input({ type: 'pass', target: b.target });
        else if (b.type === 'dribble') w.input({ type: 'dribble', dx: b.dx, dy: b.dy });
        else if (b.type === 'shot') w.input({ type: 'shot', y: 2.5, z: 0.4 });
        else w.input({ type: 'shield' });
      }
      w.step(STEP);
      assert.ok(Number.isFinite(w.ball.x) && Math.abs(w.ball.x) < PITCH.length / 2 + 15);
    }
    assert.ok(w.outcome, `Szene ${i} endet`);
    ends[w.outcome.type] = (ends[w.outcome.type] || 0) + 1;
    assert.ok(w.decisions.length >= 1);
    const m = evaluateMove(w);
    assert.ok(m.stars >= 0 && m.stars <= 3);
    assert.ok(m.items.length >= 1 && m.key.length > 0);
    for (const d of w.decisions) assert.ok(gradeDecision(d).text.length > 0);
  }
  // Nicht jeder Zug endet nach dem ersten Pass: Mitspieler spielen weiter
  assert.ok(!ends.received, 'erfolgreicher Pass beendet den Zug nicht');
});

test('Mitspieler mit Ball entscheidet selbst und bindet den Nutzer ein', () => {
  let aiDecisions = 0, toUser = 0;
  for (let i = 0; i < 40; i++) {
    const w = load(i);
    if (!until(w, (x) => x.phase === 'decide', 60 * 10)) continue;
    const b = w.evalAtReception.options.filter((o) => o.type === 'pass').sort((a, c) => c.value - a.value)[0];
    w.input({ type: 'pass', target: b.target });
    until(w, (x) => !!x.outcome, 60 * 25);
    for (const e of w.move.events) if (e.type === 'ai') { aiDecisions++; if (e.to === w.user) toUser++; }
  }
  assert.ok(aiDecisions > 20, `KI-Entscheidungen: ${aiDecisions}`);
  assert.ok(toUser >= 5, `Nutzer angespielt: ${toUser}`);
});

test('Ohne Weiterführung bleibt alles wie bisher (erfolgreicher Pass beendet die Szene)', () => {
  const w = new World();
  w.load(buildRealScene(5, false));
  until(w, (x) => x.phase === 'decide');
  const b = w.evalAtReception.options.filter((o) => o.type === 'pass').sort((a, c) => c.value - a.value)[0];
  w.input({ type: 'pass', target: b.target });
  until(w, (x) => !!x.outcome);
  assert.ok(['received', 'intercepted', 'offside'].includes(w.outcome.type));
  assert.equal(w.decisions.length, 1);
});

test('Sprint ohne Ball bleibt vor dem Pass onside', () => {
  let checked = 0;
  for (let i = 0; i < SITUATIONS.length && checked < 8; i += 7) {
    const w = load(i);
    if (!until(w, (x) => x.phase === 'decide', 60 * 10)) continue;
    const b = w.evalAtReception.options.filter((o) => o.type === 'pass').sort((a, c) => c.value - a.value)[0];
    w.input({ type: 'pass', target: b.target });
    if (!until(w, (x) => x.phase === 'team' || !!x.outcome, 60 * 5) || w.outcome) continue;
    w.input({ type: 'run', dx: 1, dy: 0 });
    step(w, 60 * 2);
    if (w.outcome || w.ball.inFlight) continue;
    // Abseitslinie (vorletzter Gegner) – der Nutzer darf höchstens knapp drüber sein
    const xs = [];
    for (let j = 0; j < w.n; j++) if (w.team[j] !== w.team[w.user]) xs.push(w.px[j]);
    xs.sort((a, c) => c - a);
    const line = Math.max(xs[1], w.ball.x);
    assert.ok(w.px[w.user] < line + 1.5, `Szene ${i}: ${w.px[w.user].toFixed(1)} vs Linie ${line.toFixed(1)}`);
    checked++;
  }
  assert.ok(checked >= 3);
});
