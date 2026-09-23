// Fünf handgebaute Situationen mit eindeutiger richtiger Lösung.
// Eigene Mannschaft (team 0) spielt Richtung +x, y quer (+y = links).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/sim/world.js';
import { evaluateOptions, patternOf } from '../src/eval/evaluate.js';

// Kleine Szene ohne Bewegung: alle stehen, der Nutzer (U) hat den Ball.
function scene(players, context = { own: 0, opp: 0, minute: 30 }) {
  const list = [
    { id: 'TW', team: 0, pos: [-48, 0], role: 'TW', num: 1 },
    { id: 'gTW', team: 1, pos: [48, 0], role: 'TW', num: 1 },
    ...players,
  ].map((p) => ({ num: 0, heading: p.team === 0 ? 0 : 180, script: { type: 'hold' }, ...p }));
  const u = list.find((p) => p.user);
  return {
    id: 'test', meta: { position: 8, phase: 'test', context },
    ballRef: u.pos, receive: u.pos, pass: { from: u.id, at: 99 }, players: list,
  };
}

function bestFor(sc) {
  const w = new World();
  w.load(sc);
  const ev = evaluateOptions(w, w.user);
  return { w, ev, best: ev.best };
}

test('1: Freier Mitspieler zwischen den Linien schlägt den zugestellten Weg', () => {
  const { w, best } = bestFor(scene([
    { id: 'U', team: 0, pos: [-10, 0], user: true, num: 8 },
    { id: 'Z', team: 0, pos: [8, -3], num: 10 },          // zwischen den Linien
    { id: 'S', team: 0, pos: [-12, 20], num: 3 },         // sicher, seitlich
    { id: 'C', team: 0, pos: [4, 12], num: 11 },          // eng gedeckt
    { id: 'g1', team: 1, pos: [0, -12] }, { id: 'g2', team: 1, pos: [0, 8] }, { id: 'g3', team: 1, pos: [3, 11] },
    { id: 'g4', team: 1, pos: [16, -15] }, { id: 'g5', team: 1, pos: [16, -5] }, { id: 'g6', team: 1, pos: [16, 5] }, { id: 'g7', team: 1, pos: [16, 15] },
    { id: 'g8', team: 1, pos: [-4, 7] },                   // Stürmer, weit genug weg vom Passweg
  ]));
  assert.equal(best.type, 'pass');
  assert.equal(w.ids[best.target], 'Z');
  assert.equal(patternOf(w, best), 'Zwischen die Linien');
});

test('2: Rücken zum Spiel, Druck von hinten – klatschen lassen auf den offenen Sechser', () => {
  const { w, best } = bestFor(scene([
    { id: 'U', team: 0, pos: [5, 0], user: true, num: 8, heading: 180 },
    { id: 'S6', team: 0, pos: [-5, 3], num: 6 },          // offen, Blick nach vorn
    { id: 'A8', team: 0, pos: [12, -14], num: 10 },       // frei für den Anschlusspass
    { id: 'ST', team: 0, pos: [20, -3], num: 9 },
    { id: 'p', team: 1, pos: [6.4, 0.3] },                  // Gegner im Rücken
    { id: 'b1', team: 1, pos: [9, -7] },                    // stellt den direkten Weg zur 10 zu
    { id: 'b2', team: 1, pos: [19, -2] },                   // deckt den Stürmer
    { id: 'm1', team: 1, pos: [-2, 16] },
  ]));
  assert.equal(best.type, 'pass');
  assert.equal(w.ids[best.target], 'S6');
  assert.equal(patternOf(w, best), 'Klatschen lassen – Dritter Mann');
});

test('3: Block ballseitig verschoben – Verlagerung auf die freie Seite', () => {
  const marks = [];
  const mates = [[-2, 25], [6, 16], [-14, 10], [12, 26]];
  mates.forEach(([x, y], k) => {
    marks.push({ id: `m${k}`, team: 0, pos: [x, y], num: 2 + k });
    marks.push({ id: `d${k}`, team: 1, pos: [x + 1.0, y - 0.6] }); // eng gedeckt
  });
  const { w, best } = bestFor(scene([
    { id: 'U', team: 0, pos: [-5, 18], user: true, num: 8 },
    { id: 'RV', team: 0, pos: [0, -26], num: 7 },          // ballfern, völlig frei
    ...marks,
    { id: 'x1', team: 1, pos: [-1, 12] }, { id: 'x2', team: 1, pos: [4, 8] },
  ]));
  assert.equal(best.type, 'pass');
  assert.equal(w.ids[best.target], 'RV');
  assert.equal(patternOf(w, best), 'Verlagerung');
});

test('4: Offene Stellung, Raum vor dir, alle Wege zu – andribbeln', () => {
  const marks = [];
  const mates = [[-25, 18], [-26, -16], [-5, 25], [-4, -24]];
  mates.forEach(([x, y], k) => {
    marks.push({ id: `m${k}`, team: 0, pos: [x, y], num: 2 + k });
    marks.push({ id: `d${k}`, team: 1, pos: [x + (x < -10 ? 1 : -1), y * 0.9] });
  });
  const { best } = bestFor(scene([
    { id: 'U', team: 0, pos: [-15, 0], user: true, num: 6 },
    ...marks,
    { id: 'f1', team: 1, pos: [20, -8] }, { id: 'f2', team: 1, pos: [20, 8] },
  ]));
  assert.equal(best.type, 'dribble');
  assert.ok(best.dx > 0.5, 'Richtung gegnerisches Tor');
});

test('5: 1:0 in der 88., gedoppelt, alle Wege zu – Ball sichern', () => {
  const marks = [];
  const mates = [[-30, 12], [-12, 28], [-4, 6], [-24, -6]];
  mates.forEach(([x, y], k) => {
    marks.push({ id: `m${k}`, team: 0, pos: [x, y], num: 2 + k });
    marks.push({ id: `d${k}`, team: 1, pos: [x + (x < -20 ? 1.2 : -1.0), y - 0.8] });
  });
  const { best } = bestFor(scene([
    { id: 'U', team: 0, pos: [-20, 10], user: true, num: 8 },
    { id: 'p1', team: 1, pos: [-18.3, 10.8] },
    { id: 'p2', team: 1, pos: [-20.4, 8.1] },
    { id: 'p3', team: 1, pos: [-21.6, 11.4] },
    { id: 'k', team: 1, pos: [-25, 8.1] },                  // stellt den Rückpass zum Torwart zu
    ...marks,
  ], { own: 1, opp: 0, minute: 88 }));
  assert.equal(best.type, 'shield');
});
