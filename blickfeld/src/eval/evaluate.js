// Bewertung der Handlungsoptionen zu einem Zeitpunkt und Note der getroffenen Entscheidung.
// Wert einer Option = Erfolgschance × Nutzen − Verlustchance × Schaden (+ Kontext).
// Reines JavaScript, in Node testbar. Wird nur bei Ereignissen aufgerufen, nicht pro Frame.

import { PITCH, LANE, PLAYER } from '../config.js';
import { clamp } from '../core/math.js';
import { createPath, planPass, arrivalTime, LOFT } from '../sim/ball.js';
import { analyzePath, analyzeDribble, createLaneResult, createDribbleResult, isOffside, timeToIntercept, classify } from './lanes.js';
import { W } from './weights.js';

const HALF_L = PITCH.length / 2;

// Raumwert, angelehnt an "Expected Threat": steigt Richtung gegnerisches Tor und zur Mitte.
export function zoneValue(x, y) {
  const xn = clamp((x + HALF_L) / PITCH.length, 0, 1);
  const central = 1 - Math.pow(Math.min(1, Math.abs(y) / 34), 1.6) * 0.6;
  let v = 0.01 + 0.2 * Math.pow(xn, 2.6) * central;
  if (x > 36) v += 0.18 * clamp((x - 36) / 16.5, 0, 1) * (Math.abs(y) < 20.2 ? 1 : 0.4) * central;
  return v;
}

// Schaden eines Ballverlusts an dieser Stelle (eigenes Tor bei -x).
export function lossCost(x, y) {
  const xn = clamp((x + HALF_L) / PITCH.length, 0, 1);
  return W.lossBase + W.lossOwnGoal * Math.pow(1 - xn, 2.2) * (1 - 0.5 * Math.min(1, Math.abs(y) / 34));
}

function sigmoid(z) { return 1 / (1 + Math.exp(-z)); }

function contextFactors(w) {
  const c = (w.scene && w.scene.meta && w.scene.meta.context) || { own: 0, opp: 0, minute: 45 };
  const f = { gain: 1, loss: 1, shield: 0, label: '' };
  if (c.own > c.opp && c.minute >= W.leadLate.minute) { f.loss = W.leadLate.loss; f.shield = W.leadLate.shield; f.label = 'lead'; }
  else if (c.own < c.opp && c.minute >= W.trailLate.minute) { f.gain = W.trailLate.gain; f.loss = W.trailLate.loss; f.label = 'trail'; }
  return f;
}

// Linien des Gegners (verteidigt +x): Abwehrlinie = Ø der 4 tiefsten Feldspieler, Mittelfeld = nächste 4
function oppLines(w, team) {
  const xs = [];
  for (let j = 0; j < w.n; j++) if (w.team[j] !== team && !w.gk[j]) xs.push(w.px[j]);
  xs.sort((a, b) => b - a);
  const avg = (a) => a.reduce((s, v) => s + v, 0) / Math.max(1, a.length);
  return { def: avg(xs.slice(0, 4)), mid: avg(xs.slice(4, 8)) };
}

function packingCount(w, team, fx, fy, tx, ty) {
  const gx = HALF_L;
  const dFrom = Math.hypot(gx - fx, fy), dTo = Math.hypot(gx - tx, ty);
  let n = 0;
  for (let j = 0; j < w.n; j++) {
    if (w.team[j] === team) continue;
    const d = Math.hypot(gx - w.px[j], w.py[j]);
    if (d < dFrom && d > dTo) n++;
  }
  return n;
}

const path = createPath();
const path2 = createPath();
const lane = createLaneResult();
const lane2 = createLaneResult();
const drib = createDribbleResult();

// Temporäre Welt, in der alle Spieler um T Sekunden fortgeschrieben sind (für den Anschlusspass)
function shiftedWorld(w, T, out) {
  out.n = w.n; out.team = w.team; out.gk = w.gk;
  const t = Math.min(T, 1.2);
  for (let j = 0; j < w.n; j++) {
    out.px[j] = w.px[j] + w.vx[j] * t; out.py[j] = w.py[j] + w.vy[j] * t;
    out.vx[j] = w.vx[j] * 0.6; out.vy[j] = w.vy[j] * 0.6;
  }
  return out;
}
const shifted = { px: new Float64Array(22), py: new Float64Array(22), vx: new Float64Array(22), vy: new Float64Array(22) };

// Alle Optionen des Ballführers bewerten. Rückgabe: { options, best, ctx }
export function evaluateOptions(w, carrier, extraDribbleDir) {
  const team = w.team[carrier];
  const def = team === 0 ? 1 : 0;
  const bx = w.ball.x, by = w.ball.y;
  const v0 = zoneValue(bx, by);
  const ctx = contextFactors(w);
  const lines = oppLines(w, team);
  const options = [];

  // --- Pässe ---
  for (let r = 0; r < w.n; r++) {
    if (r === carrier || w.team[r] !== team) continue;
    let Px = w.px[r], Py = w.py[r], T = 0;
    for (let it = 0; it < 4; it++) {
      const d = Math.hypot(Px - bx, Py - by);
      T = arrivalTime(d);
      Px = clamp(w.px[r] + w.vx[r] * T, -HALF_L + 1, HALF_L - 1);
      Py = clamp(w.py[r] + w.vy[r] * T, -PITCH.width / 2 + 1, PITCH.width / 2 - 1);
    }
    planPass(path, bx, by, Px, Py, 0);
    analyzePath(w, path, def, lane);
    const offside = isOffside(w, r, bx);
    let pS = offside ? 0 : sigmoid(lane.margin / W.sigmaMargin);
    if (lane.margin === Infinity) pS = 1;
    const gain = (zoneValue(Px, Py) - v0) * (ctx.gain > 1 && Px > bx ? ctx.gain : 1);
    const packing = packingCount(w, team, bx, by, Px, Py);
    // Druck auf den Empfänger bei Ankunft
    let tPress = Infinity;
    for (let j = 0; j < w.n; j++) {
      if (w.team[j] === team) continue;
      const tt = timeToIntercept(w, j, Px, Py, 0.1, path.T) - path.T;
      if (tt < tPress) tPress = tt;
    }
    const pressurePen = tPress < 0.9 ? W.pressure * (1 - Math.max(0, tPress) / 0.9) : 0;
    // Kann der Empfänger aufdrehen? Kein Gegner in 5 m Richtung gegnerisches Tor
    let turn = true;
    for (let j = 0; j < w.n; j++) {
      if (w.team[j] === team) continue;
      const ex = w.px[j] + w.vx[j] * path.T - Px, ey = w.py[j] + w.vy[j] * path.T - Py;
      if (ex > -1 && Math.hypot(ex, ey) < 5) { turn = false; break; }
    }
    // Anschlusspass vom Empfänger aus (Dritter Mann / Klatschen)
    let follow = 0, followTo = -1;
    if (pS > 0.3 && path.dist < 32) {
      const sw = shiftedWorld(w, path.T, shifted);
      for (let k = 0; k < w.n; k++) {
        if (k === r || w.team[k] !== team || w.gk[k]) continue;
        const kx = sw.px[k], ky = sw.py[k];
        const g2 = zoneValue(kx, ky) - zoneValue(Px, Py);
        if (g2 <= 0.004) continue;
        planPass(path2, Px, Py, kx, ky, 0);
        analyzePath(sw, path2, def, lane2);
        const p2 = sigmoid(lane2.margin / W.sigmaMargin);
        const val = p2 * g2;
        if (val > follow) { follow = val; followTo = k; }
      }
    }
    const lossX = lane.interceptor >= 0 ? lane.ix : bx, lossY = lane.interceptor >= 0 ? lane.iy : by;
    const reward = gain + W.packing * packing + W.followUp * follow + (turn ? W.turn : 0) - pressurePen;
    const value = pS * reward - (1 - pS) * lossCost(lossX, lossY) * ctx.loss;
    options.push({
      type: 'pass', target: r, value, pS, gain, packing, follow, followTo, turn, tPress,
      status: offside ? 'abseits' : lane.status, margin: lane.margin, critical: lane.critical,
      lofted: path.mode === LOFT, dist: path.dist, tx: Px, ty: Py, T: path.T,
      between: Px > lines.mid + 2 && Px < lines.def - 1,
      behind: Px > lines.def + 1,
      runner: w.vx[r] > 4,
    });
  }

  // --- Dribbling in 8 Richtungen (+ ggf. die tatsächlich gewählte) ---
  const dirs = [];
  for (let k = 0; k < 8; k++) dirs.push((k / 8) * Math.PI * 2);
  if (extraDribbleDir !== undefined) dirs.push(extraDribbleDir);
  for (let k = 0; k < dirs.length; k++) {
    const a = dirs[k];
    const dx = Math.cos(a), dy = Math.sin(a);
    analyzeDribble(w, carrier, dx, dy, 2.2, drib);
    const ex = w.px[carrier] + dx * drib.gain, ey = w.py[carrier] + dy * drib.gain;
    const pS = drib.tackler >= 0 ? sigmoid((drib.margin - 0.05) / W.sigmaMargin) * 0.5 : sigmoid((drib.margin + 0.1) / W.sigmaMargin);
    const gain = (zoneValue(ex, ey) - v0) * W.dribble;
    const value = pS * gain - (1 - pS) * lossCost(bx, by) * ctx.loss;
    options.push({ type: 'dribble', dir: a, dx, dy, value, pS, gain, meters: drib.gain, tackler: drib.tackler, exact: k === 8 });
  }

  // --- Sichern ---
  let near = 0, d1 = Infinity;
  for (let j = 0; j < w.n; j++) {
    if (w.team[j] === team) continue;
    const d = Math.hypot(w.px[j] - w.px[carrier], w.py[j] - w.py[carrier]);
    if (d < 6) near++;
    if (d < d1) d1 = d;
  }
  let bestPass = 0, bestSafe = -Infinity;
  for (const o of options) {
    if (o.type !== 'pass') continue;
    if (o.value > bestPass) bestPass = o.value;
    if (o.pS > 0.85 && o.value > bestSafe) bestSafe = o.value;
  }
  let sv = W.shieldAfter * bestPass + (d1 < 6 ? W.shieldPressure : W.shieldNoPressure);
  if (near >= 2) sv += W.shieldDouble - lossCost(bx, by) * 0.2;
  sv += ctx.shield;
  // Sichern ist nie besser als ein sicher ankommender Pass – es verschiebt die Lösung nur
  if (bestSafe > -Infinity) sv = Math.min(sv, bestSafe - 0.001);
  options.push({ type: 'shield', value: sv, pS: near >= 2 ? 0.45 : 0.85, gain: 0, near });

  let best = options[0];
  for (const o of options) if (o.value > best.value) best = o;
  return { options, best, ctx, v0, lines, t: w.t };
}

export function findChoice(ev, choice) {
  if (!ev || !choice) return null;
  if (choice.type === 'pass') return ev.options.find((o) => o.type === 'pass' && o.target === choice.target) || null;
  if (choice.type === 'shield') return ev.options.find((o) => o.type === 'shield');
  if (choice.type === 'dribble') return ev.options.find((o) => o.type === 'dribble' && o.exact) || null;
  return null;
}

// ---------- Beschreibung in Fußballsprache ----------

const nr = (w, i) => `die ${w.num[i]}`;

export function patternOf(w, o) {
  if (!o) return '';
  if (o.type === 'shield') return 'Ball sichern';
  if (o.type === 'dribble') {
    const fwd = o.dx > 0.5;
    return fwd ? 'Andribbeln' : o.dx < -0.5 ? 'Abdrehen' : 'Andribbeln zur Seite';
  }
  const bx = w.ball.x, by = w.ball.y;
  if (o.behind && o.runner) return 'Tiefenlauf';
  if (Math.abs(o.ty - by) > 24 && o.dist > 25) return 'Verlagerung';
  if (o.between && o.packing >= 2) return 'Zwischen die Linien';
  if (o.tx < bx - 1 && o.dist < 16 && o.follow > 0.012) return 'Klatschen lassen – Dritter Mann';
  if (o.tx < bx - 3) return o.packing === 0 ? 'Sicherheitspass' : 'Querpass';
  if (o.packing >= 3) return 'Linien überspielen';
  return o.tx > bx + 3 ? 'Pass nach vorn' : 'Querpass';
}

const PHRASE = {
  'Tiefenlauf': (t) => `Steilpass in den Lauf ${t.replace('die', 'der')}`,
  'Verlagerung': (t) => `Verlagerung auf ${t}`,
  'Zwischen die Linien': (t) => `Pass zwischen die Linien auf ${t}`,
  'Klatschen lassen – Dritter Mann': (t) => `Klatschen lassen auf ${t}`,
  'Sicherheitspass': (t) => `Sicherheitspass auf ${t}`,
  'Linien überspielen': (t) => `Vertikalpass auf ${t}`,
  'Pass nach vorn': (t) => `Pass nach vorn auf ${t}`,
  'Querpass': (t) => `Querpass auf ${t}`,
};

export function describeOption(w, o) {
  if (!o) return '';
  if (o.type === 'shield') return 'Ball sichern';
  if (o.type === 'dribble') return o.dx > 0.5 ? 'Andribbeln nach vorn' : 'Andribbeln in den freien Raum';
  const p = patternOf(w, o);
  const f = PHRASE[p];
  return f ? f(nr(w, o.target)) : `Pass auf ${nr(w, o.target)}`;
}

const GRADE_LABELS = { top: 'Top-Lösung', good: 'Gut', ok: 'Vertretbar', risky: 'Riskant', bad: 'Fehler' };

// Note der Entscheidung. Vergleich mit der besten Option bei der Annahme und beim Handeln.
export function gradeDecision(w) {
  const evA = w.evalAtAction, evR = w.evalAtReception;
  const o = w.outcome ? w.outcome.type : '';
  const res = {
    grade: 'bad', label: '', points: 0, text: '', pattern: '', best: null, chosen: null,
    decisionTime: w.ev.reception >= 0 && w.ev.action >= 0 ? Math.max(0, w.ev.action - w.ev.reception) : null,
    scans: w.scans, scanText: '', lateNote: '',
  };
  const ref = evR && evA ? (evR.best.value > evA.best.value ? evR : evA) : (evA || evR);
  const best = ref ? ref.best : null;
  res.best = best;
  const chosen = findChoice(evA, w.choice);
  res.chosen = chosen;

  if (o === 'fouled') {
    // aus dem Sichern ein Foul gezogen: Ball behauptet, Freistoß
    res.grade = 'good';
    res.pattern = 'Ball sichern';
    res.text = 'Foul gezogen: Der Anläufer kam mit Tempo in deinen Rücken. Freistoß – Ball behauptet.';
    res.label = GRADE_LABELS[res.grade];
    res.points = W.points.good;
    return res;
  }
  if (!chosen) {
    // keine Entscheidung (Ballverlust im Warten oder zu lange gezögert)
    res.grade = 'bad';
    res.text = `Zu lange gewartet. ${best ? `${capital(describeOption(w, best))} wäre die Lösung gewesen.` : ''}`;
    res.pattern = best ? patternOf(w, best) : '';
  } else {
    const delta = best.value - chosen.value;
    if (delta <= W.grade.top) res.grade = 'top';
    else if (delta <= W.grade.good) res.grade = 'good';
    else if (delta <= W.grade.ok) res.grade = 'ok';
    else res.grade = 'bad';
    const lost = o === 'intercepted' || o === 'tackled' || o === 'dribbleLost' || o === 'shieldLost' || o === 'offside';
    if (chosen.pS < W.riskyP && res.grade !== 'bad' && !(res.grade === 'top' && !lost)) res.grade = 'risky';
    if (lost && (res.grade === 'top' || res.grade === 'good' || res.grade === 'ok')) res.grade = 'risky';
    res.pattern = patternOf(w, res.grade === 'top' ? chosen : best);
    res.text = explain(w, chosen, best, res.grade, o);
    if (evR && evA && evR.best.value > evA.best.value + 0.01 && res.decisionTime > 0.5) {
      res.lateNote = `Bei der Annahme war ${describeOption(w, evR.best)} noch besser – ${fmt(res.decisionTime)} s gezögert.`;
    }
  }
  res.label = GRADE_LABELS[res.grade];
  const P = W.points;
  res.points = { top: P.top, good: P.good, ok: P.ok, risky: P.risky, bad: P.bad }[res.grade];
  if (res.points > 0 && res.decisionTime !== null && res.decisionTime < 0.8) res.points += P.fast;

  // Scan-Rückmeldung: Hattest du die beste Option vor der Annahme im Blick?
  if (best && best.type === 'pass' && w.ev.reception >= 0) {
    const seenT = w.seen[best.target];
    if (seenT < 0) res.scanText = `Die ${w.num[best.target]} hattest du vor der Annahme nie im Blick.`;
    else res.scanText = `Die ${w.num[best.target]} hattest du ${fmt(Math.max(0, w.ev.reception - seenT))} s vor der Annahme gesehen.`;
  }
  return res;
}

function explain(w, c, b, grade, outcome) {
  const same = c === b || (c.type === b.type && c.target === b.target && c.type === 'pass');
  if (outcome === 'offside') return `Abseits – ${nr(w, c.target)} stand beim Pass hinter der letzten Linie.`;
  if (outcome === 'intercepted') {
    return `Der Passweg auf ${nr(w, c.target)} war zu – ihre ${w.num[c.critical >= 0 ? c.critical : 0]} kam vorher an den Ball.${same ? '' : ` Besser: ${describeOption(w, b)}.`}`;
  }
  if (outcome === 'dribbleLost') return `Im Dribbling gestellt – der Raum war schon zu.${same ? '' : ` Besser: ${describeOption(w, b)}.`}`;
  if (outcome === 'shieldLost') return `Beim Sichern den Ball verloren – zu lange gehalten oder gedoppelt.${same ? '' : ` Besser: ${describeOption(w, b)}.`}`;
  if (grade === 'top') {
    if (c.type === 'pass') {
      const bits = [];
      if (c.packing >= 2 && c.tx > w.ball.x) bits.push(`${c.packing} Gegner überspielt`);
      if (c.status === 'eng') bits.push('knapp, aber richtig getimt');
      if (c.follow > 0.012 && c.followTo >= 0) bits.push(`${nr(w, c.followTo)} kann direkt weiterspielen`);
      if (c.turn && c.tx > w.ball.x) bits.push('der Empfänger kann aufdrehen');
      return `${capital(describeOption(w, c))}${bits.length ? ' – ' + bits.join(', ') : ''}.`;
    }
    if (c.type === 'shield') return 'Unter Druck den Ball behauptet und Zeit gewonnen.';
    return `${capital(describeOption(w, c))} in den freien Raum – ${fmt(c.meters, 0)} m gewonnen.`;
  }
  if (c.type === 'pass' && b.type === 'pass' && b.packing > c.packing + 1) {
    return `Sicher gespielt, aber ${describeOption(w, b)} war frei und hätte ${b.packing} Gegner überspielt.`;
  }
  if (c.type === 'pass' && c.status === 'eng') return `Riskanter Pass – der Weg auf ${nr(w, c.target)} war eng. Besser: ${describeOption(w, b)}.`;
  if (c.type === 'shield' && b.type !== 'shield') return `Kein Druck, der ein Sichern nötig macht. Besser: ${describeOption(w, b)}.`;
  return `${grade === 'good' ? 'Gute Lösung.' : grade === 'ok' ? 'Geht.' : 'Nicht die beste Wahl.'} Besser: ${describeOption(w, b)}.`;
}

function fmt(v, d = 1) { return v.toFixed(d).replace('.', ','); }
function capital(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }

export { classify, LANE, PLAYER };
