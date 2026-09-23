// Auswahl der nächsten Situation: keine Wiederholungen, keine Serien ähnlicher Szenen,
// schwache Phasen etwas häufiger – aber nie dominant. Rein funktional, in Node testbar.

export const PHASES = ['aufbau_hohes_pressing', 'aufbau_mittelfeldblock', 'letztes_drittel', 'umschalten', 'gegenpressing'];
const HISTORY = 300;
const CLUSTER_FRAMES = 250;   // 10 s im selben Spiel gelten als "gleiche Situation"
const CLUSTER_RECENT = 40;
const MAX_SHARE = 0.35;

function parseId(id) {
  const m = /^g(\d+)-(\d+)/.exec(id);
  return m ? { g: +m[1], f: +m[2] } : { g: 0, f: 0 };
}

// Fingerabdruck einer Szene (für Verlauf und Ähnlichkeit)
export function fingerprint(entry) {
  return `${entry.phase}|${entry.lane}|${entry.pressure}|${entry.pos}|${entry.id}`;
}

// lib: Liste von Einträgen {id, pos, phase, ...}; state: { history: [id], phases: [phase], stats: {phase: {n, avg}} }
export function pickNext(lib, position, state, rng) {
  const recentIds = new Set(state.history.slice(-HISTORY));
  const recentClusters = state.history.slice(-CLUSTER_RECENT).map(parseId);
  const lastTwo = state.phases.slice(-2);
  const blockedPhase = lastTwo.length === 2 && lastTwo[0] === lastTwo[1] ? lastTwo[0] : null;

  const byPos = (e) => position === 'mix' || String(e.pos) === String(position);
  // Regeln stufenweise lockern, statt sofort zu wiederholen:
  // 0 = alles, 1 = ähnliche Nachbarszenen erlaubt, 2 = Phasenfolge egal, 3 = nur die letzten 100 sperren
  const olderIds = new Set(state.history.slice(-100));
  let cands = [];
  for (let level = 0; level <= 4 && cands.length === 0; level++) {
    for (let i = 0; i < lib.length; i++) {
      const e = lib[i];
      if (!byPos(e)) continue;
      if (level <= 2 && recentIds.has(e.id)) continue;
      if (level === 3 && olderIds.has(e.id)) continue;
      if (level <= 1 && blockedPhase && e.phase === blockedPhase) continue;
      if (level === 0) {
        const id = parseId(e.id);
        if (recentClusters.some((c) => c.g === id.g && Math.abs(c.f - id.f) < CLUSTER_FRAMES)) continue;
      }
      cands.push(i);
    }
  }

  // Gewichte je Phase: schwache Phasen (niedriger Punkteschnitt) häufiger
  const phaseWeight = {};
  for (const p of PHASES) {
    const s = state.stats && state.stats[p];
    const avg = s && s.n >= 3 ? s.avg : 60;
    phaseWeight[p] = 1 + 0.8 * (1 - Math.min(100, Math.max(0, avg)) / 100);
  }
  // Anteil je Phase deckeln
  const count = {};
  for (const i of cands) count[lib[i].phase] = (count[lib[i].phase] || 0) + 1;
  let mass = {};
  let total = 0;
  for (const p in count) { mass[p] = count[p] * phaseWeight[p]; total += mass[p]; }
  const phasesPresent = Object.keys(mass);
  if (phasesPresent.length > 2) {
    for (let it = 0; it < 4; it++) {
      let over = 0;
      for (const p of phasesPresent) if (mass[p] / total > MAX_SHARE) { over += mass[p] - MAX_SHARE * total; mass[p] = MAX_SHARE * total; }
      if (over <= 1e-9) break;
      total = phasesPresent.reduce((s, p) => s + mass[p], 0);
    }
  }
  // Phase ziehen, dann Situation innerhalb der Phase
  let r = rng() * total, phase = phasesPresent[0];
  for (const p of phasesPresent) { if (r < mass[p]) { phase = p; break; } r -= mass[p]; }
  const inPhase = cands.filter((i) => lib[i].phase === phase);
  const idx = inPhase[Math.floor(rng() * inPhase.length)];
  return { index: idx, mirror: rng() < 0.5 };
}
