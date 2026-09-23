// Zentrale Konstanten. 1 Einheit = 1 Meter, Zeiten in Sekunden.
// Simulation: x entlang der Längsachse (eigene Mannschaft greift Richtung +x an),
// y quer (von +x aus gesehen links positiv), Winkel gegen den Uhrzeigersinn ab +x.

export const SIM_HZ = 60;
export const STEP = 1 / SIM_HZ;
export const MAX_STEPS_PER_FRAME = 8;

export const PITCH = {
  length: 105,
  width: 68,
  lineWidth: 0.12,
  centerCircle: 9.15,
  penaltyDepth: 16.5,
  penaltyWidth: 40.32,
  goalAreaDepth: 5.5,
  goalAreaWidth: 18.32,
  penaltySpot: 11,
  cornerArc: 1,
  goalWidth: 7.32,
  goalHeight: 2.44,
  stripeWidth: 5.25,
};

export const PLAYER = {
  eyeHeight: 1.75,
  jog: 3.2,
  run: 5.5,
  sprint: 7.8,
  gkSprint: 6.2,
  dribble: 6.0,
  accel: 4.5,          // m/s² beim Antreten
  decel: 7.0,          // m/s² beim Abbremsen / Richtungswechsel
  turnRateStand: 9.0,  // rad/s Körperdrehung im Stand
  turnRateSprint: 2.6, // rad/s bei Sprinttempo
  minSeparation: 1.5,
};

export const BALL = {
  radius: 0.11,
  rollDecel: 1.5,       // m/s² Rollreibung auf Rasen
  minPass: 12,
  maxPass: 20,
  loftThreshold: 30,    // ab hier halbhoch
  gravity: 9.81,
  receiveSpeedCap: 17,
};

// Modell "Zeit bis zum Abfangen" – dieselben Werte nutzt die Auflösung.
export const LANE = {
  reaction: 0.25,       // s
  reach: 0.9,           // m Reichweite mit Bein / Grätsche
  headerReach: 0.6,     // m bei hohem Ball
  bodyBlock: 0.5,       // m: Ball trifft den Körper ohne Reaktion
  maxInterceptHeight: 2.2,
  sampleDt: 0.05,
  tight: 0.35,          // s Puffer: darunter "eng"
  gkReach: 1.4,
};

export const CAMERA = {
  hfovDeg: 95,
  near: 0.1,
  far: 700,
  basePitchDeg: -6,
  headLimitDeg: 150,
  swipeDegPerWidth: 200,
  headTau: 0.06,        // s Glättung beim Wischen
  returnTau: 0.16,      // s Glättung "zurück zum Ball"
  maxHeadRateDeg: 720,
};

export const TIMING = {
  contextCard: 1.2,     // s Echtzeit
  kickDelay: 0.15,      // s Spielzeit zwischen Tipp und Ballkontakt
  tackleContact: 0.2,   // s Kontakt, bis der Ball weg ist
  shieldHold: 1.6,      // s Sichern gegen einen Gegenspieler
  resolveTail: 1.2,     // s nach dem Ergebnis weiterlaufen lassen
  dribbleHorizon: 2.2,  // s
};

export const TEMPI = [0.25, 0.5, 0.75, 1];

export const COLORS = {
  own: { shirt: 0xeceee9, shorts: 0xeceee9, socks: 0xe6e8e3, number: 0x1c2748 },
  opp: { shirt: 0x1d2957, shorts: 0x1a2140, socks: 0x1d2957, number: 0xf1f0ea },
  ownGk: { shirt: 0xd9dc3f, shorts: 0x2a2a2a, socks: 0xd9dc3f, number: 0x1a1a1a },
  oppGk: { shirt: 0xe07b2e, shorts: 0x2a2a2a, socks: 0xe07b2e, number: 0x1a1a1a },
  skin: [0xe3b796, 0xc99171, 0x9a6446, 0x6e4631, 0xf0c9a8],
  hair: [0x2a1d15, 0x17120f, 0x5b3b22, 0xa9824d, 0x3a2a1e],
  boots: [0x1b1b1b, 0xf2f2f2, 0x1b1b1b, 0x2b3a67, 0x1b1b1b],
};
