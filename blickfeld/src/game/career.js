// Karriere: 5 Kapitel à 6 Level. Jedes Level ist ein Spielzug mit einem Ziel; Sterne gibt es für
// das erreichte Ziel (mindestens 1) und die Qualität des Spielzugs (bis 3). Die Situation wird
// bei jedem Versuch neu aus den passenden echten Szenen gezogen – kein Auswendiglernen.

export const OBJECTIVES = {
  clean: { text: 'Triff nach der Annahme eine gute Entscheidung (mindestens „Gut“).', short: 'Gute erste Entscheidung' },
  scan: { text: 'Schau vor der Annahme mindestens einmal weg vom Ball und entscheide dich dann sinnvoll.', short: 'Vor der Annahme scannen' },
  scan2: { text: 'Scanne vor der Annahme mindestens zweimal – dann eine gute Entscheidung.', short: 'Zweimal scannen' },
  lines: { text: 'Spiel einen Pass, der mindestens zwei Gegner überspielt und ankommt.', short: 'Linien überspielen' },
  direct: { text: 'Leite den Ball direkt weiter: Mitspieler vor der Annahme antippen.', short: 'Direktpass' },
  fast: { text: 'Entscheide in unter einer Sekunde nach der Annahme – und gut.', short: 'Unter 1 Sekunde' },
  escape: { text: 'Befreie dich aus dem Pressing, ohne den Ball zu verlieren.', short: 'Pressing lösen' },
  shield: { text: 'Sichere den Ball unter Druck und spiel ihn danach sauber weiter.', short: 'Sichern und lösen' },
  space: { text: 'Spiel einen Pass in den Raum (auf den Rasen tippen), den ein Mitspieler erläuft.', short: 'Pass in den Raum' },
  run: { text: 'Nach deinem Pass nach vorn wischen: Tiefenlauf – und wieder angespielt werden.', short: 'Tiefenlauf bedient' },
  shot: { text: 'Schließ den Spielzug mit einem Torschuss ab (aufs Tor tippen).', short: 'Torschuss' },
  shotTarget: { text: 'Bring einen Schuss aufs Tor.', short: 'Schuss aufs Tor' },
  goal: { text: 'Der Spielzug endet mit einem Tor – egal wer trifft.', short: 'Tor' },
  goalUser: { text: 'Erziele selbst ein Tor.', short: 'Selbst treffen' },
  noloss: { text: 'Mindestens drei eigene Aktionen ohne Ballverlust.', short: '3 Aktionen ohne Verlust' },
  stars3: { text: 'Ein Spielzug mit drei Sternen.', short: 'Drei Sterne' },
};

const C1 = { phases: ['aufbau_mittelfeldblock'], pressure: ['keiner', 'seitlich'] };
const C2 = { phases: ['aufbau_hohes_pressing', 'gegenpressing'], pressure: ['seitlich', 'hinten', 'doppeln'] };
const C3 = { phases: ['letztes_drittel'], pos: ['8', '10', '6'] };
const C4 = { phases: ['umschalten'] };
const C5 = { phases: null };

export const CHAPTERS = [
  {
    id: 1, title: 'Grundlagen', sub: 'Scannen, annehmen, weiterspielen', levels: [
      { name: 'Der erste Kontakt', goal: 'clean', filter: C1 },
      { name: 'Kopf hoch', goal: 'scan', filter: C1 },
      { name: 'Zwischen die Linien', goal: 'lines', filter: C1 },
      { name: 'Direkt weiter', goal: 'direct', filter: C1 },
      { name: 'Mitgehen', goal: 'run', filter: C1 },
      { name: 'Abschluss suchen', goal: 'shot', filter: { phases: ['letztes_drittel', 'umschalten'] } },
    ],
  },
  {
    id: 2, title: 'Unter Druck', sub: 'Pressing, Gegenpressing, Rücken zum Gegner', levels: [
      { name: 'Schnell entscheiden', goal: 'fast', filter: C2 },
      { name: 'Raus aus dem Pressing', goal: 'escape', filter: C2 },
      { name: 'Rücken zum Gegner', goal: 'shield', filter: { phases: C2.phases, pressure: ['hinten', 'doppeln', 'seitlich'] } },
      { name: 'Doppelt gescannt', goal: 'scan2', filter: C2 },
      { name: 'Linie brechen', goal: 'lines', filter: C2 },
      { name: 'Durchs Pressing zum Abschluss', goal: 'shot', filter: C2 },
    ],
  },
  {
    id: 3, title: 'Letztes Drittel', sub: 'Der tödliche Pass und der Abschluss', levels: [
      { name: 'Steilpass', goal: 'space', filter: C3 },
      { name: 'Zwischen den Ketten', goal: 'lines', filter: C3 },
      { name: 'Aufs Tor', goal: 'shotTarget', filter: C3 },
      { name: 'Kombination', goal: 'goal', filter: C3 },
      { name: 'Selbst vollenden', goal: 'goalUser', filter: C3 },
      { name: 'Traumtor', goal: 'stars3', filter: C3 },
    ],
  },
  {
    id: 4, title: 'Umschalten', sub: 'Nach Ballgewinn schnell nach vorn', levels: [
      { name: 'Tempo nach vorn', goal: 'fast', filter: C4 },
      { name: 'Tief laufen', goal: 'run', filter: C4 },
      { name: 'In den Raum', goal: 'space', filter: C4 },
      { name: 'Konter abschließen', goal: 'shot', filter: C4 },
      { name: 'Konter vollenden', goal: 'goal', filter: C4 },
      { name: 'Der perfekte Konter', goal: 'stars3', filter: C4 },
    ],
  },
  {
    id: 5, title: 'Spielmacher', sub: 'Alles zusammen – aus jeder Lage', levels: [
      { name: 'Übersicht', goal: 'scan2', filter: C5 },
      { name: 'Ballsicher', goal: 'noloss', filter: C5 },
      { name: 'Vorlage', goal: 'goal', filter: C5 },
      { name: 'Torgefahr', goal: 'goalUser', filter: C5 },
      { name: 'Meisterstück', goal: 'stars3', filter: C5 },
      { name: 'Spielmacher', goal: 'stars3', filter: { phases: ['letztes_drittel', 'umschalten'] } },
    ],
  },
];

// flache Liste mit Kennung "k-l" (Kapitel-Level) und laufender Nummer
export const LEVELS = [];
for (const ch of CHAPTERS) {
  ch.levels.forEach((lv, i) => {
    lv.id = `${ch.id}-${i + 1}`;
    lv.chapter = ch.id;
    lv.n = LEVELS.length + 1;
    LEVELS.push(lv);
  });
}

export function levelById(id) {
  return LEVELS.find((l) => l.id === id) || LEVELS[0];
}

export function nextLevel(id) {
  const i = LEVELS.findIndex((l) => l.id === id);
  return i >= 0 && i < LEVELS.length - 1 ? LEVELS[i + 1] : null;
}

// freigeschaltet: erstes Level oder Vorgänger mit mindestens einem Stern
export function isUnlocked(stars, id) {
  const i = LEVELS.findIndex((l) => l.id === id);
  return i <= 0 || (stars[LEVELS[i - 1].id] || 0) > 0;
}

export function totalStars(stars) {
  return LEVELS.reduce((s, l) => s + (stars[l.id] || 0), 0);
}

// erstes noch nicht geschafftes, freigeschaltetes Level (sonst das letzte)
export function currentLevel(stars) {
  for (const l of LEVELS) if (!(stars[l.id] > 0)) return l;
  return LEVELS[LEVELS.length - 1];
}

// Passende Situationen: Phase, Druck und (wenn möglich) die gewählte Position
export function levelPool(lib, level, position) {
  const f = level.filter || {};
  const base = [];
  for (let i = 0; i < lib.length; i++) {
    const e = lib[i];
    if (f.phases && !f.phases.includes(e.phase)) continue;
    if (f.pressure && !f.pressure.includes(e.pressure)) continue;
    if (f.pos && !f.pos.includes(String(e.pos))) continue;
    base.push(i);
  }
  if (position !== 'mix') {
    const own = base.filter((i) => String(lib[i].pos) === String(position));
    if (own.length >= 8) return own;
  }
  return base.length ? base : lib.map((_, i) => i);
}

// Ziel erreicht? w: Welt nach dem Spielzug, m: evaluateMove(w)
export function objectiveMet(goal, w, m) {
  const d0 = w.decisions[0];
  const g0 = m.first;
  const good = (g) => g && (g.grade === 'top' || g.grade === 'good');
  const okGrade = (g) => g && g.grade !== 'bad' && g.grade !== 'risky';
  const firstLost = d0 && ['intercepted', 'tackled', 'dribbleLost', 'shieldLost', 'offside', 'hesitated', 'out'].includes(d0.outcome.type);
  const userShots = w.decisions.filter((d) => d.choice && d.choice.type === 'shot');
  switch (goal) {
    case 'clean': return good(g0) && !firstLost;
    case 'scan': return !!d0 && d0.scans >= 1 && okGrade(g0);
    case 'scan2': return !!d0 && d0.scans >= 2 && good(g0);
    case 'lines': return w.decisions.some((d, k) => {
      const g = m.grades[k];
      return d.choice && (d.choice.type === 'pass' || d.choice.type === 'space') && g.chosen && g.chosen.packing >= 2
        && (d.outcome.type === 'received' || !['intercepted', 'offside', 'out'].includes(d.outcome.type));
    });
    case 'direct': return !!d0 && d0.direct && !firstLost;
    case 'fast': return !!g0 && g0.decisionTime !== null && g0.decisionTime <= 1.0 && good(g0) && !firstLost;
    case 'escape': return !!d0 && !firstLost && okGrade(g0);
    case 'shield': return !!w.move.shielded && !m.lostByUser;
    case 'space': return w.decisions.some((d) => d.choice && d.choice.type === 'space' && d.outcome.type === 'received');
    case 'run': return m.offball.runsRewarded > 0;
    case 'shot': return userShots.length > 0;
    case 'shotTarget': return userShots.some((d) => ['goal', 'saved', 'post'].includes(d.outcome.type));
    case 'goal': return m.type === 'goal';
    case 'goalUser': return userShots.some((d) => d.outcome.type === 'goal');
    case 'noloss': return w.decisions.length >= 3 && !m.lostByUser;
    case 'stars3': return m.stars >= 3;
    default: return false;
  }
}

// Sterne im Level: Ziel verfehlt = 0; sonst Qualität des Spielzugs (mind. 1)
export function levelStars(goal, w, m) {
  if (!objectiveMet(goal, w, m)) return 0;
  return Math.max(1, m.stars);
}
