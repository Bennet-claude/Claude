import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPath, planPass, pathPos, LOFT, FLAT } from '../src/sim/ball.js';
import { analyzePath, createLaneResult, runTime, isOffside } from '../src/eval/lanes.js';
import { PLAYER } from '../src/config.js';

// Minimal-Welt für Passweg-Tests
function miniWorld(players) {
  const n = players.length;
  const w = {
    n,
    team: new Uint8Array(n), gk: new Uint8Array(n),
    px: new Float64Array(n), py: new Float64Array(n),
    vx: new Float64Array(n), vy: new Float64Array(n),
  };
  players.forEach((p, i) => {
    w.team[i] = p.team; w.gk[i] = p.gk ? 1 : 0;
    w.px[i] = p.x; w.py[i] = p.y; w.vx[i] = p.vx || 0; w.vy[i] = p.vy || 0;
  });
  return w;
}

test('flacher Pass: Tempo im erlaubten Bereich, Ankunft stimmt mit Bahn überein', () => {
  const p = createPath();
  const T = planPass(p, 0, 0, 20, 0, 0);
  assert.equal(p.mode, FLAT);
  assert.ok(p.v0 >= 12 && p.v0 <= 20);
  const out = new Float64Array(3);
  pathPos(p, T, out);
  assert.ok(Math.abs(out[0] - 20) < 1e-6);
});

test('Pässe über 30 m werden halbhoch gespielt und landen am Ziel', () => {
  const p = createPath();
  const T = planPass(p, 0, 0, 40, 0, 0);
  assert.equal(p.mode, LOFT);
  const out = new Float64Array(3);
  pathPos(p, T / 2, out);
  assert.ok(out[2] > 2.5, 'Scheitelpunkt über Kopfhöhe');
  pathPos(p, T, out);
  assert.ok(Math.abs(out[0] - 40) < 1e-6 && out[2] < 0.2);
});

test('Gegner direkt in der Passlinie blockt den flachen Pass', () => {
  const w = miniWorld([{ team: 1, x: 10, y: 0.3 }]);
  const p = createPath();
  planPass(p, 0, 0, 20, 0, 0);
  const r = analyzePath(w, p, 1, createLaneResult());
  assert.equal(r.status, 'zu');
  assert.equal(r.interceptor, 0);
});

test('Gegner weit weg: Weg frei', () => {
  const w = miniWorld([{ team: 1, x: 10, y: 15 }]);
  const p = createPath();
  planPass(p, 0, 0, 20, 0, 0);
  const r = analyzePath(w, p, 1, createLaneResult());
  assert.equal(r.status, 'frei');
});

test('Halbhoher Ball geht über einen Gegner in der Mitte hinweg', () => {
  const w = miniWorld([{ team: 1, x: 20, y: 0.5 }]);
  const p = createPath();
  planPass(p, 0, 0, 40, 0, 0);
  const r = analyzePath(w, p, 1, createLaneResult());
  assert.notEqual(r.status, 'zu');
});

test('… aber nicht über einen Gegner nahe am Landepunkt', () => {
  const w = miniWorld([{ team: 1, x: 38.5, y: 0.8 }]);
  const p = createPath();
  planPass(p, 0, 0, 40, 0, 0);
  const r = analyzePath(w, p, 1, createLaneResult());
  assert.equal(r.status, 'zu');
});

test('Laufzeit: Beschleunigung und Höchsttempo', () => {
  const t = runTime(0, 0, 0, 0, 30, 0, 0, PLAYER.sprint, PLAYER.accel, PLAYER.decel);
  // 0 → 7,8 m/s bei 4,5 m/s² dauert 1,73 s und braucht 6,76 m
  const expected = PLAYER.sprint / PLAYER.accel + (30 - (PLAYER.sprint ** 2) / (2 * PLAYER.accel)) / PLAYER.sprint;
  assert.ok(Math.abs(t - expected) < 1e-9);
  // wer schon in Richtung Ziel läuft, ist schneller
  assert.ok(runTime(0, 0, 5, 0, 30, 0, 0, PLAYER.sprint, PLAYER.accel, PLAYER.decel) < t);
  // wer weg läuft, ist langsamer
  assert.ok(runTime(0, 0, -5, 0, 30, 0, 0, PLAYER.sprint, PLAYER.accel, PLAYER.decel) > t);
});

test('Abseits: Empfänger hinter dem vorletzten Gegner in der gegnerischen Hälfte', () => {
  const w = miniWorld([
    { team: 0, x: 20, y: 0 },   // Empfänger
    { team: 1, x: 18, y: 5 },   // letzter Feldspieler
    { team: 1, x: 50, y: 0 },   // Torwart
  ]);
  assert.equal(isOffside(w, 0, 0), true);
  w.px[0] = 17.5;
  assert.equal(isOffside(w, 0, 0), false);
});
