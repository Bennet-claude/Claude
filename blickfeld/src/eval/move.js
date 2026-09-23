// Bewertung eines ganzen Spielzugs: jede eigene Entscheidung (mit Ball), das Verhalten ohne Ball
// (Anbieten, Tiefenläufe, Fordern) und das Ergebnis. Daraus Sterne, Punkte und eine kurze Analyse
// in Trainersprache. Regelbasiert und nachvollziehbar – keine externe KI.

import { gradeDecision, describeOption } from './evaluate.js';

export const RESULT = {
  goal: { head: 'Tor', bonus: 150, shot: true },
  saved: { head: 'Gehalten', bonus: 60, shot: true },
  post: { head: 'Pfosten', bonus: 50, shot: true },
  wide: { head: 'Vorbei', bonus: 20, shot: true },
  blocked: { head: 'Geblockt', bonus: 15, shot: true },
  received: { head: 'Angekommen', bonus: 0 },
  dribbleOk: { head: 'Durchgesetzt', bonus: 0 },
  intercepted: { head: 'Abgefangen', bonus: 0, lost: true },
  tackled: { head: 'Ball verloren', bonus: 0, lost: true },
  dribbleLost: { head: 'Hängen geblieben', bonus: 0, lost: true },
  shieldLost: { head: 'Ball verloren', bonus: 0, lost: true },
  hesitated: { head: 'Zu lange gezögert', bonus: 0, lost: true },
  offside: { head: 'Abseits', bonus: 0, lost: true },
  out: { head: 'Im Aus', bonus: 0, lost: true },
  lost: { head: 'Ballverlust', bonus: 0, lost: true },
  fouled: { head: 'Foul gezogen', bonus: 30 },
  stalled: { head: 'Ohne dich weiter', bonus: 5 },
  timeout: { head: 'Angriff verpufft', bonus: 10 },
};

const GRADE_SCORE = { top: 1, good: 0.8, ok: 0.55, risky: 0.3, bad: 0 };

function actionLabel(d, g) {
  const c = d.choice;
  if (!c) return d.outcome.type === 'tackled' ? 'Ball verloren' : 'Gezögert';
  if (c.type === 'shield') return 'Ball gesichert';
  if (c.type === 'shot') return d.shotInfo && d.shotInfo.dist < 17 ? 'Abschluss' : 'Torschuss';
  if (c.type === 'dribble') return 'Dribbling';
  if (c.type === 'space') return g.chosen && g.chosen.target >= 0 ? `Pass in den Raum → ${d.num[g.chosen.target]}` : 'Pass in den Raum';
  if (c.type === 'pass') return `${d.direct ? 'Direktpass' : 'Pass'} → ${d.num[c.target]}`;
  return '';
}

// Verhalten ohne Ball aus den KI-Entscheidungen ablesen
function offBall(w) {
  const out = { offers: 0, found: 0, runsRewarded: 0, badDemands: 0, goodDemands: 0, runs: w.move.runs.length, demands: 0 };
  const events = w.move.events;
  for (const e of events) {
    if (e.type === 'demand') out.demands++;
    if (e.type !== 'ai' || !e.user) continue;
    const u = e.user;
    const open = (u.status === 'frei' || u.status === 'eng') && u.pS >= 0.7 && u.tPress > 0.25;
    if (open && u.gain > 0.005) out.offers++;
    if (e.to === w.user) {
      out.found++;
      if (w.move.runs.some((r) => e.t - r.t > 0 && e.t - r.t < 3.2)) out.runsRewarded++;
      if (e.demanded && open) out.goodDemands++;
    }
    if (e.demanded && (u.status === 'zu' || u.status === 'abseits')) out.badDemands++;
  }
  return out;
}

export function evaluateMove(w) {
  const type = w.outcome ? w.outcome.type : 'timeout';
  const R = RESULT[type] || RESULT.timeout;
  const items = [];
  let points = 0, q = 0;
  const grades = [];
  let prevDrib = null;
  for (const d of w.decisions) {
    const g = gradeDecision(d);
    grades.push(g);
    q += GRADE_SCORE[g.grade] ?? 0;
    const isDrib = d.choice && d.choice.type === 'dribble';
    if (isDrib && prevDrib) {
      // Dribbling in Folge zählt als eine Aktion (kein Punktesammeln durch Dauerdribbeln)
      prevDrib.count++;
      prevDrib.label = `Dribbling ×${prevDrib.count}`;
      if (GRADE_SCORE[g.grade] < GRADE_SCORE[prevDrib.grade]) { prevDrib.grade = g.grade; prevDrib.gradeLabel = g.label; prevDrib.text = g.text; }
      continue;
    }
    // erste Entscheidung zählt voll, spätere zu 60 %
    const pts = items.length === 0 ? g.points : Math.round(g.points * 0.6);
    points += pts;
    const item = { kind: 'decision', label: actionLabel(d, g), grade: g.grade, gradeLabel: g.label, points: pts, text: g.text, count: 1 };
    items.push(item);
    prevDrib = isDrib ? item : null;
  }
  const nDec = grades.length;
  q = nDec ? q / nDec : 0;
  // Ohne Ball zählt nur, was du selbst tust: Tiefenlauf, der bedient wird; Fordern im richtigen Moment
  const ob = offBall(w);
  const obPoints = ob.runsRewarded * 25 + Math.min(2, ob.goodDemands) * 10;
  if (obPoints > 0) {
    const bits = [];
    if (ob.runsRewarded) bits.push(ob.runsRewarded === 1 ? 'Tiefenlauf wurde bedient' : `${ob.runsRewarded} Läufe bedient`);
    if (ob.goodDemands) bits.push(ob.goodDemands === 1 ? 'Ball im richtigen Moment gefordert' : 'Ball zweimal richtig gefordert');
    items.push({ kind: 'offball', label: 'Ohne Ball', grade: 'top', gradeLabel: '', points: obPoints, text: bits.join(', ') });
  }
  points += obPoints + R.bonus;

  // Sterne: Entscheidungsqualität und Ergebnis
  const shotOnTarget = type === 'goal' || type === 'saved' || type === 'post';
  let stars;
  if (type === 'goal') stars = q >= 0.7 ? 3 : 2;
  else if (shotOnTarget) stars = q >= 0.85 ? 3 : q >= 0.5 ? 2 : 1;
  else if (R.shot) stars = q >= 0.6 ? 2 : 1;
  else if (R.lost) stars = q >= 0.8 && nDec > 1 ? 2 : q >= 0.5 ? 1 : 0;
  else stars = q >= 0.8 ? 2 : q >= 0.45 ? 1 : 0;
  if (nDec === 0) stars = 0;

  // Analyse: Was war entscheidend, was nehme ich mit?
  const worstIdx = grades.reduce((bi, g, i) => (GRADE_SCORE[g.grade] < GRADE_SCORE[grades[bi].grade] ? i : bi), 0);
  const worst = grades[worstIdx];
  const last = grades[nDec - 1];
  let key = '';
  if (type === 'goal') key = `Tor nach ${w.move.userTouches} ${w.move.userTouches === 1 ? 'eigenem Ballkontakt' : 'eigenen Ballkontakten'}. ${last ? last.text : ''}`;
  else if (R.shot) key = last && w.decisions[nDec - 1].choice && w.decisions[nDec - 1].choice.type === 'shot' ? last.text : `Abschluss der ${w.num[shooter(w)]}: ${R.head.toLowerCase()}.`;
  else if (type === 'lost') {
    const c = lastAiCarrier(w);
    key = w.move.lostBy === 'pass' ? `Der Pass der ${w.num[c]} wurde abgefangen.` : `Die ${w.num[c]} verliert den Zweikampf.`;
  }
  else if (type === 'stalled') key = 'Der Angriff lief ohne dich weiter.';
  else if (type === 'timeout') key = 'Der Angriff lief sich fest – kein Abschluss.';
  else key = last ? last.text : '';

  let tip = '';
  if (worst && GRADE_SCORE[worst.grade] <= 0.55 && worst.best) {
    tip = worst.lateNote || `Besser war ${describeOption(w.decisions[worstIdx], worst.best)}.`;
  } else if (type === 'stalled' || (ob.found === 0 && nDec <= 1 && !R.shot)) {
    tip = ob.runs === 0
      ? 'Nach dem Pass nicht stehen bleiben: nach vorn wischen für einen Tiefenlauf, den Ball fordern, wenn du frei bist.'
      : 'Lauf in freie Räume – dort, wo zwischen dir und dem Ballführer kein Gegner steht.';
  } else if (ob.badDemands > 0) tip = 'Du hast den Ball gefordert, obwohl der Passweg zu war. Erst freilaufen, dann fordern.';
  else if (grades[0] && grades[0].scanText && grades[0].grade !== 'top') tip = grades[0].scanText;
  else if (type === 'timeout') tip = 'Im letzten Drittel früher den Abschluss oder den tödlichen Pass suchen.';

  return {
    type, head: R.head, stars, points, items, key: key.trim(), tip,
    first: grades[0] || null, quality: q, shots: w.move.shots, touches: w.move.userTouches,
  };
}

function shooter(w) {
  for (let k = w.move.events.length - 1; k >= 0; k--) if (w.move.events[k].type === 'shot') return w.move.events[k].from;
  return 0;
}

function lastAiCarrier(w) {
  for (let k = w.move.events.length - 1; k >= 0; k--) if (w.move.events[k].type === 'ai') return w.move.events[k].from;
  return 0;
}
