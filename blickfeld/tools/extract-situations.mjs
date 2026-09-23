// Extrahiert echte Spielsituationen aus den Metrica-Sports-Beispieldaten (anonymisiert,
// 25 Hz, alle 22 Spieler + Ball, Feld 105 × 68 m). Ergebnis: scenes/real/library.js
//
// Eine Situation = ein Pass auf einen (meist zentralen) Mittelfeldspieler im offenen Spiel.
// Gespeichert werden alle Laufwege ab ~1,6 s vor dem Pass bis ~3 s nach der Annahme,
// ausgerichtet so, dass die ballbesitzende Mannschaft Richtung +x spielt.
//
// Aufruf: node tools/extract-situations.mjs <ordner-mit-metrica-csv>
// Daten: https://github.com/metrica-sports/sample-data (Quelle wird in CREDITS.md genannt)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { passOptions, createOptionList } from '../src/eval/options.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = process.argv[2];
if (!dataDir) { console.error('Ordner mit Metrica-CSV fehlt'); process.exit(1); }

const FPS = 25;
const L = 105, W = 68;
const STEP_FRAMES = 2;            // 12,5 Hz in der Bibliothek
const PRE = 1.6;                  // s vor dem Pass
const POST = 3.0;                 // s nach der Annahme
const Q = 0.03;                   // Quantisierung 3 cm

// ---------- Einlesen ----------

function readTracking(file) {
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);
  const header = lines[2].split(',');
  const names = [];
  for (let c = 3; c < header.length; c += 2) if (header[c]) names.push({ name: header[c], col: c });
  const n = lines.length - 3;
  const frames = new Int32Array(n), period = new Uint8Array(n);
  const tracks = names.map(() => ({ x: new Float32Array(n), y: new Float32Array(n) }));
  let k = 0;
  for (let i = 3; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const p = line.split(',');
    period[k] = +p[0]; frames[k] = +p[1];
    for (let j = 0; j < names.length; j++) {
      const c = names[j].col;
      tracks[j].x[k] = p[c] === 'NaN' || p[c] === '' ? NaN : +p[c];
      tracks[j].y[k] = p[c + 1] === 'NaN' || p[c + 1] === '' ? NaN : +p[c + 1];
    }
    k++;
  }
  return { names: names.map((q) => q.name), frames: frames.subarray(0, k), period: period.subarray(0, k), tracks, n: k };
}

function readEvents(file) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean);
  const head = lines[0].split(',');
  return lines.slice(1).map((l) => {
    const p = l.split(',');
    const o = {};
    head.forEach((h, i) => { o[h] = p[i]; });
    return {
      team: o.Team, type: o.Type, sub: o.Subtype || '', period: +o.Period,
      start: +o['Start Frame'], end: +o['End Frame'], t: +o['Start Time [s]'],
      from: o.From, to: o.To,
      sx: +o['Start X'], sy: +o['Start Y'], ex: +o['End X'], ey: +o['End Y'],
    };
  });
}

// ---------- Hilfen ----------

// Metrica (0..1, oben links) → Meter, Mannschaft spielt Richtung +x, +y = links
function toMeters(x, y, attacksRight) {
  const X = (x - 0.5) * L, Y = (0.5 - y) * W;
  return attacksRight ? [X, Y] : [-X, -Y];
}

function mean(arr) { return arr.reduce((a, b) => a + b, 0) / arr.length; }

function present(tr, f) { return !Number.isNaN(tr.x[f]) && !Number.isNaN(tr.y[f]); }

// Spielrichtung pro Halbzeit: Mannschaft mit kleinerem mittlerem x greift nach rechts an
function directions(home, away) {
  const dir = {};
  for (const per of [1, 2]) {
    let f0 = -1;
    for (let f = 0; f < home.n; f++) if (home.period[f] === per) { f0 = f; break; }
    const avg = (team) => {
      const xs = [];
      for (let f = f0; f < f0 + 250; f++) for (const tr of team.tracks) if (present(tr, f)) xs.push(tr.x[f]);
      return mean(xs);
    };
    dir[per] = { Home: avg(home) < avg(away), Away: avg(away) < avg(home) };
  }
  return dir;
}

// ---------- Hauptlauf pro Spiel ----------

function processGame(g) {
  const base = path.join(dataDir, `Sample_Game_${g}_`);
  const home = readTracking(base + 'RawTrackingData_Home_Team.csv');
  const away = readTracking(base + 'RawTrackingData_Away_Team.csv');
  const events = readEvents(base + 'RawEventsData.csv');
  const dir = directions(home, away);
  const teams = { Home: home, Away: away };
  const ballTr = home.tracks[home.names.indexOf('Ball')];

  const t2 = (events.find((x) => x.period === 2) || { t: 2700 }).t; // Anstoß 2. Halbzeit
  // Spielstand und Ballbesitzwechsel entlang der Ereignisse
  const score = { Home: 0, Away: 0 };
  let possTeam = null, possSince = 0;
  const out = [];

  for (let e = 0; e < events.length; e++) {
    const ev = events[e];
    const snapScore = { ...score };
    const possessive = ev.type === 'PASS' || ev.type === 'RECOVERY' || ev.type === 'SHOT' || ev.type === 'SET PIECE';
    if (possessive && ev.team !== possTeam) { possTeam = ev.team; possSince = ev.start; }
    if (ev.type === 'SHOT' && /GOAL/.test(ev.sub) && !/GOAL KICK/.test(ev.sub)) score[ev.team]++;

    if (ev.type !== 'PASS' || (ev.sub && ev.sub !== 'HEAD') || !ev.to) continue;
    const prev = events[e - 1];
    if (prev && (prev.type === 'SET PIECE' || prev.type === 'BALL OUT') && ev.start - prev.start < 60) continue;
    const kickF = ev.start - 1, recF = ev.end - 1; // Frames beginnen bei 1
    const T = (recF - kickF) / FPS;
    if (T < 0.35 || T > 2.4) continue;
    const startF = Math.round(kickF - PRE * FPS);
    // Wann handelt der echte Empfänger das nächste Mal? (danach weicht die Realität ab)
    let realAct = recF + POST * FPS;
    for (let k = e + 1; k < events.length && events[k].start - 1 <= recF + POST * FPS; k++) {
      const n = events[k];
      if (n.start - 1 < recF) continue;
      realAct = n.start - 1; break;
    }
    const endF = Math.min(recF + Math.round(POST * FPS), realAct + Math.round(0.6 * FPS));
    if (startF < 0 || endF >= home.n || endF - recF < 0.8 * FPS) continue;
    if (home.period[startF] !== ev.period || home.period[endF] !== ev.period) continue;
    // kein Ballaus / Standard im Fenster
    if (events.some((x) => x.start - 1 >= startF - 10 && x.start - 1 <= recF && (x.type === 'BALL OUT' || x.type === 'SET PIECE'))) continue;

    const att = ev.team, def = att === 'Home' ? 'Away' : 'Home';
    const right = dir[ev.period][att];
    // anwesende Spieler (ohne NaN im ganzen Fenster)
    const pick = (team) => {
      const tm = teams[team];
      const list = [];
      tm.names.forEach((nm, j) => {
        if (nm === 'Ball') return;
        const tr = tm.tracks[j];
        for (let f = startF; f <= endF; f += 5) if (!present(tr, f)) return;
        if (!present(tr, endF)) return;
        list.push({ name: nm, tr });
      });
      return list;
    };
    const own = pick(att), opp = pick(def);
    if (own.length !== 11 || opp.length !== 11) continue;
    if (!present(ballTr, kickF) || !present(ballTr, startF)) continue;

    // Rollen aus der mittleren Position ± 5 min
    const roleInfo = (list, teamRight) => list.map((p) => {
      const xs = [], ys = [];
      for (let f = Math.max(0, kickF - 7500); f < Math.min(home.n, kickF + 7500); f += 25) {
        if (home.period[f] !== ev.period || !present(p.tr, f)) continue;
        const [X, Y] = toMeters(p.tr.x[f], p.tr.y[f], teamRight);
        xs.push(X); ys.push(Y);
      }
      return { ...p, ax: mean(xs), ay: mean(ys) };
    });
    const ownR = roleInfo(own, right);
    const oppR = roleInfo(opp, right); // im Koordinatensystem der Angreifer
    // Torwart = tiefster Spieler (bei den Gegnern der mit größtem x)
    ownR.sort((a, b) => a.ax - b.ax);
    oppR.sort((a, b) => b.ax - a.ax);

    const recvIdx = ownR.findIndex((p) => p.name === ev.to);
    const passIdx = ownR.findIndex((p) => p.name === ev.from);
    if (recvIdx <= 0 || passIdx < 0) continue; // Torwart als Empfänger ausschließen
    const recv = ownR[recvIdx];
    // Position des Empfängers in der Mannschaft: Tiefe zwischen Abwehr- und Sturmlinie
    const outfield = ownR.slice(1);
    const defLine = mean(outfield.slice(0, 4).map((p) => p.ax));
    const fwdLine = mean(outfield.slice(-2).map((p) => p.ax));
    const depth = (recv.ax - defLine) / Math.max(5, fwdLine - defLine);
    const central = Math.abs(recv.ay) < 16;
    const midfielder = depth > 0.22 && depth < 0.9;
    let pos = depth < 0.42 ? 6 : depth > 0.66 ? 10 : 8;

    // Fenster abtasten
    const frames = [];
    for (let f = startF; f <= endF; f += STEP_FRAMES) frames.push(f);
    const objs = [...ownR, ...oppR];
    const tracks = objs.map((p) => frames.map((f) => toMeters(p.tr.x[f], p.tr.y[f], right)));
    // Ball: bis zum Pass echte Positionen, danach steuert die Simulation
    const ballT = frames.map((f) => (present(ballTr, f) ? toMeters(ballTr.x[f], ballTr.y[f], right) : null));
    if (ballT.slice(0, Math.ceil((kickF - startF) / STEP_FRAMES) + 1).some((b) => !b)) continue;
    for (let k = 0; k < ballT.length; k++) if (!ballT[k]) ballT[k] = ballT[k - 1];
    tracks.push(ballT);
    // leichte Glättung gegen Messrauschen (nicht beim Ball)
    for (let o = 0; o < 22; o++) {
      const tr = tracks[o];
      const sm = tr.map((p, k) => {
        const a = tr[Math.max(0, k - 1)], c = tr[Math.min(tr.length - 1, k + 1)];
        return [(a[0] + 2 * p[0] + c[0]) / 4, (a[1] + 2 * p[1] + c[1]) / 4];
      });
      tracks[o] = sm;
    }

    const tKick = (kickF - startF) / FPS, tRec = (recF - startF) / FPS;
    const kIdx = (kickF - startF) / STEP_FRAMES, rIdx = (recF - startF) / STEP_FRAMES;
    const sampleAt = (o, idx) => {
      const i0 = Math.floor(idx), u = idx - i0, tr = tracks[o];
      const a = tr[Math.min(i0, tr.length - 1)], b = tr[Math.min(i0 + 1, tr.length - 1)];
      return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
    };
    const recvPos = sampleAt(recvIdx, rIdx);
    const ballKick = sampleAt(22, kIdx);
    const d = Math.hypot(recvPos[0] - ballKick[0], recvPos[1] - ballKick[1]);
    if (d < 5 || d > 45) continue;
    if (Math.abs(recvPos[0]) > 40 || Math.abs(recvPos[1]) > 31) continue;
    const avgSpeed = d / T;
    if (avgSpeed < 5 || avgSpeed > 30) continue;

    // Zustand bei der Annahme → Validierung mit dem Passweg-Modell
    const n = 22;
    const w = {
      n, team: new Uint8Array(n), gk: new Uint8Array(n), num: new Uint8Array(n),
      px: new Float64Array(n), py: new Float64Array(n), vx: new Float64Array(n), vy: new Float64Array(n),
      ball: { x: recvPos[0], y: recvPos[1] },
    };
    for (let o = 0; o < n; o++) {
      w.team[o] = o < 11 ? 0 : 1; w.gk[o] = o === 0 || o === 11 ? 1 : 0;
      const p = sampleAt(o, rIdx), p0 = sampleAt(o, Math.max(0, rIdx - 2)), p1 = sampleAt(o, rIdx + 2);
      w.px[o] = p[0]; w.py[o] = p[1];
      w.vx[o] = (p1[0] - p0[0]) / (4 * STEP_FRAMES / FPS); w.vy[o] = (p1[1] - p0[1]) / (4 * STEP_FRAMES / FPS);
    }
    const opts = passOptions(w, recvIdx, createOptionList());
    let free = 0, tight = 0, closed = 0;
    for (let i = 0; i < opts.count; i++) {
      const o = opts[i];
      if (w.gk[o.target] || o.offside || o.dist > 50) continue;
      if (o.status === 'frei') free++; else if (o.status === 'eng') tight++; else closed++;
    }
    // Druck bei der Annahme
    let d1 = Infinity, d2 = Infinity, near = -1;
    for (let o = 11; o < 22; o++) {
      const dd = Math.hypot(w.px[o] - recvPos[0], w.py[o] - recvPos[1]);
      if (dd < d1) { d2 = d1; d1 = dd; near = o; } else if (dd < d2) d2 = dd;
    }
    let pressure = 'keiner';
    if (d2 < 5.5 && d1 < 4) pressure = 'doppeln';
    else if (d1 < 8) {
      const toPasser = Math.atan2(ballKick[1] - recvPos[1], ballKick[0] - recvPos[0]);
      const toOpp = Math.atan2(w.py[near] - recvPos[1], w.px[near] - recvPos[0]);
      let diff = Math.abs(toOpp - toPasser); if (diff > Math.PI) diff = 2 * Math.PI - diff;
      pressure = diff > 2.1 ? 'hinten' : 'seitlich';
    }
    if (free + tight < 2) continue;         // mindestens zwei echte Passoptionen
    if (free === 0 && pressure === 'keiner') continue;

    // Phase
    const sinceGain = (kickF - (possSince - 1)) / FPS;
    const oppXs = oppR.slice(1).map((p) => sampleAt(objs.indexOf(p), rIdx)[0]).sort((a, b) => a - b);
    let phase;
    if (sinceGain < 5) phase = recvPos[0] < 0 && d1 < 9 ? 'gegenpressing' : 'umschalten';
    else if (recvPos[0] > 17.5) phase = 'letztes_drittel';
    else if (recvPos[0] < 0 && oppXs[2] < -12) phase = 'aufbau_hohes_pressing';
    else phase = 'aufbau_mittelfeldblock';

    const lane = Math.abs(recvPos[1]) < 9 ? 'zentral' : Math.abs(recvPos[1]) < 22 ? 'halbraum' : 'aussen';
    // Spielminute wie im TV: 1. Hälfte ab 0:00, 2. Hälfte ab 45:00 (Nachspielzeit 45+/90+)
    const minute = ev.period === 1 ? Math.floor(ev.t / 60) + 1 : 46 + Math.floor((ev.t - t2) / 60);

    out.push({
      id: `g${g}-${ev.start}`,
      central: central && midfielder,
      pos, phase, lane, pressure, free, tight, closed,
      ctx: { own: snapScore[att], opp: snapScore[def], minute, half: ev.period },
      receiver: recvIdx, passer: passIdx, tKick, tRec,
      tRealAct: Math.min((realAct - startF) / FPS, (endF - startF) / FPS),
      lofted: d > 30 && avgSpeed < 17,
      tracks,
      d, T,
    });
  }
  return out;
}

// ---------- Kodierung ----------

// Pro Spur: Startwert (int16, 3 cm) + Differenzen (int8). Base64 für kleine Dateien.
function encode(tracks) {
  const nObj = tracks.length, nS = tracks[0].length;
  const buf = Buffer.alloc(nObj * 2 * (2 + (nS - 1)));
  let o = 0, overflow = false;
  for (const tr of tracks) {
    for (let c = 0; c < 2; c++) {
      let prev = Math.round(tr[0][c] / Q);
      buf.writeInt16LE(prev, o); o += 2;
      for (let k = 1; k < nS; k++) {
        const v = Math.round(tr[k][c] / Q);
        let dlt = v - prev;
        if (dlt > 127 || dlt < -127) { overflow = true; dlt = Math.max(-127, Math.min(127, dlt)); }
        buf.writeInt8(dlt, o); o++;
        prev += dlt;
      }
    }
  }
  return { b64: buf.toString('base64'), overflow };
}

const all = [...processGame(1), ...processGame(2)];
const stats = {};
for (const s of all) {
  const k = `${s.central ? 'zentral' : 'andere'}/${s.pos}/${s.phase}`;
  stats[k] = (stats[k] || 0) + 1;
}
console.log('Kandidaten:', all.length);
console.log(stats);

// Auswahl: alle zentralen Mittelfeldspieler, dazu ca. 15 % andere (Halbraum/außen)
const centralList = all.filter((s) => s.central);
const others = all.filter((s) => !s.central && s.lane !== 'zentral' && Math.abs(s.tracks[s.receiver][0][0]) < 35);
const extra = others.filter((_, i) => i % Math.max(1, Math.round(others.length / (centralList.length * 0.18))) === 0);
const chosen = [...centralList, ...extra];

const lib = [];
let dropped = 0;
for (const s of chosen) {
  const { b64, overflow } = encode(s.tracks);
  if (overflow) { dropped++; continue; }
  lib.push({
    id: s.id, pos: s.pos, phase: s.phase, lane: s.lane, pressure: s.pressure,
    ctx: s.ctx, r: s.receiver, p: s.passer,
    tk: +s.tKick.toFixed(2), tr: +s.tRec.toFixed(2), ta: +s.tRealAct.toFixed(2),
    lo: s.lofted ? 1 : 0, ns: s.tracks[0].length, opt: [s.free, s.tight, s.closed], data: b64,
  });
}
const header = `// Automatisch erzeugt von tools/extract-situations.mjs – nicht von Hand bearbeiten.
// Echte Spielsituationen aus den Metrica Sports Sample Data (anonymisierte Profispiele,
// https://github.com/metrica-sports/sample-data). Koordinaten in 3 cm, 12,5 Hz, Delta-kodiert.
`;
const outFile = path.join(root, 'scenes/real/library.js');
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, `${header}export const SAMPLE_DT = ${STEP_FRAMES / FPS};\nexport const QUANT = ${Q};\nexport const SITUATIONS = ${JSON.stringify(lib)};\n`);
const count = (f) => lib.filter(f).length;
console.log(`Bibliothek: ${lib.length} Situationen (${dropped} verworfen), ${(fs.statSync(outFile).size / 1024).toFixed(0)} KB`);
console.log('Positionen', { 6: count((s) => s.pos === 6), 8: count((s) => s.pos === 8), 10: count((s) => s.pos === 10) });
console.log('Phasen', Object.fromEntries(['aufbau_hohes_pressing', 'aufbau_mittelfeldblock', 'letztes_drittel', 'umschalten', 'gegenpressing'].map((p) => [p, count((s) => s.phase === p)])));
console.log('Druck', Object.fromEntries(['keiner', 'seitlich', 'hinten', 'doppeln'].map((p) => [p, count((s) => s.pressure === p)])));
