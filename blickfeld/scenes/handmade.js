// Handgebaute Szenen. Koordinaten in Metern, Ursprung Anstoßpunkt,
// eigene Mannschaft (team 0) greift Richtung +x an, y quer (+y = links).
// heading in Grad (0 = Richtung gegnerisches Tor, 90 = linke Seitenlinie).

// M1: Linker Achter im Halbraum, Aufbau gegen 4-4-2-Mittelfeldblock.
// Der linke Innenverteidiger spielt an. Der rechte Sechser des Gegners läuft
// im Bogen an und stellt dabei den Weg zwischen die Linien zu. Wer vor der
// Annahme über die rechte Schulter scannt, sieht: Der Zehner zwischen den
// Linien ist früh frei, der Rechtsaußen auf der ballfernen Seite ist frei.
export const M1_SCENE = {
  id: 'm1-achter-halbraum',
  seed: 0,
  meta: {
    position: 8, lane: 'halbraum', phase: 'aufbau_mittelfeldblock',
    pressure: 'hinten_seitlich', stance: 'halboffen',
    oppShape: '4-4-2', ownShape: '4-3-3',
    context: { own: 1, opp: 0, minute: 84 },
  },
  ballRef: [-33, 17],
  receive: [-18, 12],
  pass: { from: 'LIV', at: 1.6 },
  players: [
    // eigene Mannschaft (hell)
    { id: 'TW', team: 0, num: 1, role: 'TW', pos: [-47.5, 2], heading: 0, script: { type: 'gk' }, skin: 0 },
    { id: 'RV', team: 0, num: 2, role: 'AV', pos: [-19, -27], heading: 60, skin: 2 },
    { id: 'RIV', team: 0, num: 4, role: 'IV', pos: [-35, -9], heading: 50, skin: 1 },
    { id: 'LIV', team: 0, num: 5, role: 'IV', pos: [-33, 17], heading: -20, script: { type: 'passer', after: [-31, 12.5] }, skin: 4 },
    { id: 'LV', team: 0, num: 3, role: 'AV', pos: [-23, 29.5], heading: -40, skin: 3 },
    { id: 'S6', team: 0, num: 6, role: 'ZM', pos: [-27, 1], heading: 30, skin: 0 },
    { id: 'L8', team: 0, num: 8, role: 'ZM', user: true, pos: [-16.2, 13.6], heading: 120, script: { type: 'user', stance: 100 }, skin: 0 },
    { id: 'R8', team: 0, num: 10, role: 'ZM', pos: [-2, -2], heading: 150, script: { type: 'move', to: [-3, -3.5], at: 0.6, speed: 2 }, skin: 1 },
    { id: 'RA', team: 0, num: 7, role: 'FL', pos: [-5, -29], heading: 120, skin: 3 },
    { id: 'ST', team: 0, num: 9, role: 'ST', pos: [3, -3], heading: 170, skin: 2 },
    { id: 'LA', team: 0, num: 11, role: 'FL', pos: [-3, 28.5], heading: -150, script: { type: 'run', to: [18, 23], trigger: 'reception', delay: 0.35 }, skin: 4 },

    // Gegner (dunkel), 4-4-2, ballorientiert auf unsere linke Seite verschoben
    { id: 'gTW', team: 1, num: 1, role: 'TW', pos: [47, 2], heading: 180, script: { type: 'gk' }, skin: 1 },
    { id: 'gLV', team: 1, num: 3, role: 'AV', pos: [5, -14], heading: 170, skin: 0 },
    { id: 'gLIV', team: 1, num: 5, role: 'IV', pos: [6, -3.5], heading: 175, skin: 2 },
    { id: 'gRIV', team: 1, num: 4, role: 'IV', pos: [5.5, 8], heading: 185, skin: 3 },
    { id: 'gRV', team: 1, num: 2, role: 'AV', pos: [4, 20], heading: 190, script: { type: 'mark', target: 'LA', dist: 2.2, trigger: 'reception', delay: 0.55 }, skin: 0 },
    { id: 'gLM', team: 1, num: 11, role: 'M', pos: [-10, -12], heading: 175, skin: 4 },
    { id: 'gLZM', team: 1, num: 6, role: 'ZM', pos: [-13, -5], heading: 170, skin: 1 },
    { id: 'gRZM', team: 1, num: 8, role: 'ZM', pos: [-8.5, 9], heading: 175, script: { type: 'press', victim: 'L8', shadow: 'R8', trigger: 'pass', delay: 0.2, speed: 6.8, curveFrom: 6.5 }, skin: 2 },
    { id: 'gRM', team: 1, num: 7, role: 'M', pos: [-9.5, 17], heading: 185, script: { type: 'shadow', b: 'LA', f: 0.45, trigger: 'pass', delay: 0.3, speed: 4.5 }, skin: 0 },
    { id: 'gST1', team: 1, num: 9, role: 'ST', pos: [-24, 3.5], heading: 190, script: { type: 'shadow', b: 'S6', f: 0.62, speed: 4 }, skin: 3 },
    { id: 'gST2', team: 1, num: 10, role: 'ST', pos: [-25.5, 13], heading: 165, script: { type: 'press', victim: 'LIV', shadow: 'LV', at: 0.2, speed: 4.5 }, skin: 1 },
  ],
};

export const HANDMADE = [M1_SCENE];
