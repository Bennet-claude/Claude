// Alle Gewichte der Bewertung an einer Stelle. Werte sind in "Raumwert"-Einheiten
// (≈ Wahrscheinlichkeit, dass aus dem Ballbesitz ein Tor entsteht, grob skaliert).

export const W = {
  sigmaMargin: 0.1,       // s: Unschärfe der Erfolgswahrscheinlichkeit aus dem Passweg-Puffer
  lossBase: 0.06,         // Schaden eines Ballverlusts im Mittelfeld
  lossOwnGoal: 0.2,       // zusätzlicher Schaden nahe dem eigenen Tor (zentral)
  packing: 0.008,         // pro überspieltem Gegner
  pressure: 0.03,         // Empfänger sofort unter Druck
  turn: 0.012,            // Empfänger kann aufdrehen (kein Gegner im Rücken)
  followUp: 0.4,          // Anteil des besten Anschlusspasses (Dritter Mann, Klatschen)
  dribble: 0.85,          // Raumgewinn im Dribbling etwas vorsichtiger bewertet
  shieldAfter: 0.7,       // Sichern verschiebt die Lösung nur: Anteil des besten Passes danach
  shieldPressure: 0.003,  // Bonus unter Druck (Ball behaupten statt Risiko)
  shieldNoPressure: -0.02,// ohne Druck ist Sichern verschenkte Zeit
  shieldDouble: -0.03,
  leadLate: { minute: 75, loss: 1.5, shield: 0.006 },   // Führung kurz vor Schluss
  trailLate: { minute: 70, gain: 1.3, loss: 0.8 },       // Rückstand: Risiko für Raumgewinn
  grade: { top: 0.006, good: 0.016, ok: 0.032 },
  riskyP: 0.62,           // darunter gilt eine Entscheidung als riskant
  points: { top: 100, good: 70, ok: 40, risky: 20, bad: 0, fast: 10 },
  shotGoal: 1.8,          // Umrechnung xG → Raumwert (die Raumwerte am Strafraum liegen ≈ 1,8× über typischen xT-Werten)
  shotLoss: 0.4,          // nach dem Schuss ist der Ball meist weg, aber weit vom eigenen Tor
  shotRiskyXg: 0.07,      // Schüsse darunter gelten als Verzweiflungstat
};
