// Feste Schrittweite, entkoppelt vom Bildschirm. Der Tempo-Regler skaliert nur die
// zugeführte Zeit – die Simulation rechnet immer mit STEP und ist deshalb bei jedem
// Tempo identisch. alpha liefert den Anteil für die Interpolation beim Zeichnen.

import { STEP, MAX_STEPS_PER_FRAME } from '../config.js';

export class FixedClock {
  constructor() {
    this.acc = 0;
    this.tempo = 1;
    this.paused = false;
    this.alpha = 0;
  }

  reset() {
    this.acc = 0;
    this.alpha = 0;
  }

  // Liefert die Zahl der Simulationsschritte für diesen Frame.
  advance(realDt) {
    if (this.paused) { this.alpha = this.acc / STEP; return 0; }
    if (realDt > 0.1) realDt = 0.1; // nach Tab-Wechsel o. Ä. nicht nachholen
    this.acc += realDt * this.tempo;
    let n = 0;
    while (this.acc >= STEP && n < MAX_STEPS_PER_FRAME) {
      this.acc -= STEP;
      n++;
    }
    if (n === MAX_STEPS_PER_FRAME && this.acc > STEP) this.acc = STEP * 0.5;
    this.alpha = this.acc / STEP;
    return n;
  }
}
