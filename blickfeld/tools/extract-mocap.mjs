// Extrahiert Bewegungsclips aus der CMU-Motion-Capture-Datenbank (BVH-Konvertierung von
// Bruce Hahne, Spiegel: https://github.com/una-dinosauria/cmu-mocap). Ergebnis:
// src/render/mocap-data.js mit kompakten, loopbaren Zyklen für das Spielerrig.
//
// "The data used in this project was obtained from mocap.cs.cmu.edu.
//  The database was created with funding from NSF EIA-0196217."
//
// Aufruf: node tools/extract-mocap.mjs <ordner-mit-cmu-mocap>   (enthält data/0xx/xx_yy.bvh)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = process.argv[2];
if (!src) { console.error('Ordner mit cmu-mocap fehlt'); process.exit(1); }

// Gelenke des Spielerrigs (Finger/Daumen entfallen)
export const JOINTS = [
  'Hips', 'LHipJoint', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase',
  'RHipJoint', 'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase',
  'LowerBack', 'Spine', 'Spine1', 'Neck', 'Neck1', 'Head',
  'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand',
  'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand',
];

// ---------- BVH ----------

function parseBVH(file) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  const joints = [];
  const stack = [];
  let i = 0, nch = 0, cur = -1;
  for (; i < lines.length; i++) {
    const t = lines[i].trim().split(/\s+/);
    if (t[0] === 'MOTION') break;
    if (t[0] === 'ROOT' || t[0] === 'JOINT') {
      joints.push({ name: t[1], parent: stack.length ? stack[stack.length - 1] : -1, off: [0, 0, 0], ch: [], start: 0, end: false });
      cur = joints.length - 1;
    } else if (t[0] === 'End') {
      joints.push({ name: `${joints[stack[stack.length - 1]].name}_End`, parent: stack[stack.length - 1], off: [0, 0, 0], ch: [], start: 0, end: true });
      cur = joints.length - 1;
    } else if (t[0] === '{') stack.push(cur);
    else if (t[0] === '}') stack.pop();
    else if (t[0] === 'OFFSET') joints[cur].off = t.slice(1, 4).map(Number);
    else if (t[0] === 'CHANNELS') { joints[cur].ch = t.slice(2); joints[cur].start = nch; nch += +t[1]; }
  }
  const nf = +lines[i + 1].trim().split(/\s+/)[1];
  const dt = +lines[i + 2].trim().split(/\s+/)[2];
  const frames = [];
  for (let k = 0; k < nf; k++) frames.push(lines[i + 3 + k].trim().split(/\s+/).map(Number));
  return { joints, dt, frames };
}

// ---------- Quaternionen (x, y, z, w) ----------

const qMul = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
const qAxis = (ax, deg) => {
  const h = (deg * Math.PI) / 360, s = Math.sin(h);
  return ax === 'X' ? [s, 0, 0, Math.cos(h)] : ax === 'Y' ? [0, s, 0, Math.cos(h)] : [0, 0, s, Math.cos(h)];
};
const qInv = (q) => [-q[0], -q[1], -q[2], q[3]];
const qRot = (q, v) => {
  const p = qMul(qMul(q, [v[0], v[1], v[2], 0]), qInv(q));
  return [p[0], p[1], p[2]];
};
const qNorm = (q) => { const l = Math.hypot(...q) || 1; return q.map((c) => c / l); };
function qSlerp(a, b, t) {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  let bb = b;
  if (d < 0) { d = -d; bb = b.map((c) => -c); }
  if (d > 0.9995) return qNorm(a.map((c, i) => c + (bb[i] - c) * t));
  const th = Math.acos(d), s = Math.sin(th);
  const wa = Math.sin((1 - t) * th) / s, wb = Math.sin(t * th) / s;
  return a.map((c, i) => c * wa + bb[i] * wb);
}

// Lokale Rotation eines Gelenks im Frame (Kanäle in BVH-Reihenfolge: M = Rz·Ry·Rx …)
function localRot(j, f) {
  let q = [0, 0, 0, 1];
  for (let c = 0; c < j.ch.length; c++) {
    const name = j.ch[c];
    if (!name.endsWith('rotation')) continue;
    q = qMul(q, qAxis(name[0], f[j.start + c]));
  }
  return q;
}

function rootPos(j, f) {
  const p = [0, 0, 0];
  j.ch.forEach((name, c) => { if (name.endsWith('position')) p['XYZ'.indexOf(name[0])] = f[j.start + c]; });
  return p;
}

// Vorwärtskinematik: Weltpositionen aller Gelenke
function fk(bvh, f) {
  const n = bvh.joints.length;
  const pos = new Array(n), rot = new Array(n);
  for (let i = 0; i < n; i++) {
    const j = bvh.joints[i];
    if (j.parent < 0) { pos[i] = rootPos(j, f); rot[i] = localRot(j, f); continue; }
    const pr = rot[j.parent];
    const o = qRot(pr, j.off);
    pos[i] = [pos[j.parent][0] + o[0], pos[j.parent][1] + o[1], pos[j.parent][2] + o[2]];
    rot[i] = j.end ? pr : qMul(pr, localRot(j, f));
  }
  return { pos, rot };
}

const idx = (bvh, name) => bvh.joints.findIndex((j) => j.name === name);

// Standhöhe des Skeletts (Ruhepose): Hüfte über Zehen
function restHipHeight(bvh) {
  const zero = new Array(bvh.frames[0].length).fill(0);
  const { pos } = fk(bvh, zero);
  const toe = pos[idx(bvh, 'LeftToeBase')];
  const foot = pos[idx(bvh, 'LeftFoot')];
  return pos[0][1] - Math.min(toe[1], foot[1]) + 0.35; // + halbe Fußhöhe
}

// Blickrichtung (Yaw) der Hüfte: lokale +Z-Achse in der Ebene
function hipYaw(bvh, f) {
  const q = localRot(bvh.joints[0], f);
  const z = qRot(q, [0, 0, 1]);
  return Math.atan2(z[0], z[2]);
}

// ---------- Zyklen finden ----------

// Fersenaufsatz: Knöchelhöhe fällt unter eine Schwelle (einmal pro Doppelschritt dieses Fußes)
function footContacts(bvh, a, b, footName) {
  const fi = idx(bvh, footName);
  const hs = [];
  for (let k = a; k < b; k++) hs.push(fk(bvh, bvh.frames[k]).pos[fi][1]);
  const lo = Math.min(...hs), hi = Math.max(...hs);
  const thr = lo + 0.3 * (hi - lo);
  const out = [];
  let above = hs[0] > thr;
  for (let k = 1; k < hs.length; k++) {
    if (above && hs[k] <= thr) { out.push(a + k); above = false; }
    else if (!above && hs[k] > thr + 0.1 * (hi - lo)) above = true;
  }
  return out;
}

function speedAt(bvh, k, scale) {
  const f0 = bvh.frames[Math.max(0, k - 6)], f1 = bvh.frames[Math.min(bvh.frames.length - 1, k + 6)];
  const p0 = rootPos(bvh.joints[0], f0), p1 = rootPos(bvh.joints[0], f1);
  const dt = (Math.min(bvh.frames.length - 1, k + 6) - Math.max(0, k - 6)) * bvh.dt;
  return { v: (Math.hypot(p1[0] - p0[0], p1[2] - p0[2]) / dt) * scale, dir: Math.atan2(p1[0] - p0[0], p1[2] - p0[2]) };
}

// ---------- Clip bauen ----------

const FRAMES_PER_CYCLE = 32;
const TARGET_HIP = 0.98; // Hüfthöhe des Spielerrigs in m (1,82 m groß)

function sampleClip(bvh, kA, kB, n, loop, yawFix) {
  const jIdx = JOINTS.map((nm) => idx(bvh, nm));
  if (jIdx.some((x) => x < 0)) throw new Error('Gelenk fehlt');
  const hip0 = restHipHeight(bvh);
  const out = { q: [], y: [] };
  const fixQ = qAxis('Y', (-yawFix * 180) / Math.PI);
  const frameAt = (t) => {
    const s = kA + t * (kB - kA);
    const k0 = Math.floor(s), u = s - k0;
    return [bvh.frames[k0], bvh.frames[Math.min(bvh.frames.length - 1, k0 + 1)], u];
  };
  const first = [], last = [];
  for (let s = 0; s < n; s++) {
    const [f0, f1, u] = frameAt(s / (loop ? n : n - 1));
    const qs = jIdx.map((ji, k) => {
      let q = qSlerp(localRot(bvh.joints[ji], f0), localRot(bvh.joints[ji], f1), u);
      if (k === 0) q = qMul(fixQ, q);
      return q;
    });
    out.q.push(qs);
    const y = rootPos(bvh.joints[0], f0)[1] * (1 - u) + rootPos(bvh.joints[0], f1)[1] * u;
    out.y.push((y / hip0) * TARGET_HIP);
  }
  if (loop) {
    // Nahtloser Übergang: Unterschied zwischen Ende (= Start des nächsten Zyklus) und Anfang verteilen
    const [fe] = frameAt(1);
    const qEnd = jIdx.map((ji, k) => (k === 0 ? qMul(fixQ, localRot(bvh.joints[ji], fe)) : localRot(bvh.joints[ji], fe)));
    for (let k = 0; k < JOINTS.length; k++) {
      const corr = qMul(out.q[0][k], qInv(qEnd[k]));
      for (let s = 0; s < n; s++) out.q[s][k] = qNorm(qMul(qSlerp([0, 0, 0, 1], corr, s / n), out.q[s][k]));
    }
    const yEnd = (rootPos(bvh.joints[0], fe)[1] / hip0) * TARGET_HIP;
    const dy = out.y[0] - yEnd;
    for (let s = 0; s < n; s++) out.y[s] += (dy * s) / n;
  }
  void first; void last;
  return out;
}

function locomotion(file, name, opts = {}) {
  const bvh = parseBVH(path.join(src, file));
  const scale = TARGET_HIP / restHipHeight(bvh);
  const n = bvh.frames.length;
  let a = opts.from ? Math.round(opts.from / bvh.dt) : 0, b = opts.to ? Math.round(opts.to / bvh.dt) : n;
  const contacts = footContacts(bvh, a, b, 'LeftFoot');
  // stabilsten Zyklus wählen: Tempo nahe Median, mittig im Clip
  let best = null;
  for (let c = 0; c + 1 < contacts.length; c++) {
    const kA = contacts[c], kB = contacts[c + 1];
    const len = (kB - kA) * bvh.dt;
    if (len < 0.45 || len > 1.6) continue;
    const pA = rootPos(bvh.joints[0], bvh.frames[kA]), pB = rootPos(bvh.joints[0], bvh.frames[kB]);
    const dist = Math.hypot(pB[0] - pA[0], pB[2] - pA[2]) * scale;
    const mid = (kA + kB) / 2;
    const score = Math.abs(mid - (a + b) / 2) / n;
    if (!best || score < best.score) best = { kA, kB, len, dist, score };
  }
  if (!best) throw new Error(`${file}: kein Zyklus gefunden`);
  const yaw = hipYaw(bvh, bvh.frames[best.kA]) * 0.5 + hipYaw(bvh, bvh.frames[best.kB]) * 0.5;
  const clip = sampleClip(bvh, best.kA, best.kB, FRAMES_PER_CYCLE, true, yaw);
  const pA = rootPos(bvh.joints[0], bvh.frames[best.kA]), pB = rootPos(bvh.joints[0], bvh.frames[best.kB]);
  const moveDir = Math.atan2(pB[0] - pA[0], pB[2] - pA[2]) - yaw;
  const speed = best.dist / best.len;
  console.log(`${name.padEnd(8)} ${file}: Zyklus ${best.len.toFixed(2)} s, ${best.dist.toFixed(2)} m, ${speed.toFixed(2)} m/s, Richtung ${((moveDir * 180) / Math.PI).toFixed(0)}°`);
  return { name, loop: true, n: FRAMES_PER_CYCLE, cycle: best.len, stride: best.dist, speed, dir: moveDir, ...clip };
}

// Segment mit bestimmter Bewegungsrichtung relativ zur Hüfte finden (für 09_12)
function findSegment(file, wantDeg, minSpeed) {
  const bvh = parseBVH(path.join(src, file));
  const scale = TARGET_HIP / restHipHeight(bvh);
  let run = 0, bestA = -1, bestLen = 0, curA = 0;
  for (let k = 0; k < bvh.frames.length; k += 6) {
    const { v, dir } = speedAt(bvh, k, scale);
    let rel = ((dir - hipYaw(bvh, bvh.frames[k])) * 180) / Math.PI;
    rel = ((rel + 540) % 360) - 180;
    const ok = v > minSpeed && Math.abs(((rel - wantDeg + 540) % 360) - 180) < 30;
    if (ok) { if (run === 0) curA = k; run += 6; if (run > bestLen) { bestLen = run; bestA = curA; } } else run = 0;
  }
  return bestA < 0 ? null : { from: bestA * bvh.dt, to: (bestA + bestLen) * bvh.dt };
}

function standing(file, name) {
  const bvh = parseBVH(path.join(src, file));
  const scale = TARGET_HIP / restHipHeight(bvh);
  // längste Phase fast ohne Bewegung
  let bestA = 0, bestLen = 0, curA = 0, run = 0;
  for (let k = 0; k < bvh.frames.length; k += 6) {
    const { v } = speedAt(bvh, k, scale);
    if (v < 0.12) { if (run === 0) curA = k; run += 6; if (run > bestLen) { bestLen = run; bestA = curA; } } else run = 0;
  }
  const len = Math.min(bestLen, Math.round(1.6 / bvh.dt));
  const yaw = hipYaw(bvh, bvh.frames[bestA]);
  const clip = sampleClip(bvh, bestA, bestA + len, 24, true, yaw);
  console.log(`${name.padEnd(8)} ${file}: Stand ${(len * bvh.dt).toFixed(2)} s`);
  return { name, loop: true, n: 24, cycle: len * bvh.dt, stride: 0, speed: 0, dir: 0, ...clip };
}

// Schuss/Pass: Fenster um den Moment der höchsten Fußgeschwindigkeit
function kick(file, name) {
  const bvh = parseBVH(path.join(src, file));
  const scale = TARGET_HIP / restHipHeight(bvh);
  let bestK = 0, bestV = 0, foot = 'RightFoot';
  for (const fn of ['RightFoot', 'LeftFoot']) {
    const fi = idx(bvh, fn);
    for (let k = 3; k < bvh.frames.length - 3; k++) {
      const p0 = fk(bvh, bvh.frames[k - 3]).pos[fi], p1 = fk(bvh, bvh.frames[k + 3]).pos[fi];
      const v = (Math.hypot(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]) / (6 * bvh.dt)) * scale;
      if (v > bestV) { bestV = v; bestK = k; foot = fn; }
    }
  }
  const pre = Math.round(0.42 / bvh.dt), post = Math.round(0.5 / bvh.dt);
  const kA = Math.max(0, bestK - pre), kB = Math.min(bvh.frames.length - 1, bestK + post);
  const yaw = hipYaw(bvh, bvh.frames[bestK]);
  const n = 36;
  const clip = sampleClip(bvh, kA, kB, n, false, yaw);
  const dur = (kB - kA) * bvh.dt;
  console.log(`${name.padEnd(8)} ${file}: Schuss mit ${foot}, Fußtempo ${bestV.toFixed(1)} m/s, Kontakt bei ${((bestK - kA) * bvh.dt).toFixed(2)} s von ${dur.toFixed(2)} s`);
  return { name, loop: false, n, cycle: dur, contact: (bestK - kA) * bvh.dt, stride: 0, speed: 0, dir: 0, foot, ...clip };
}

// Rest-Skelett (Offsets) für das Rig: Subjekt 35, links/rechts gemittelt, in Metern
function restSkeleton(file) {
  const bvh = parseBVH(path.join(src, file));
  const scale = TARGET_HIP / restHipHeight(bvh);
  const out = {};
  for (const nm of JOINTS) {
    const j = bvh.joints[idx(bvh, nm)];
    out[nm] = { parent: j.parent >= 0 ? bvh.joints[j.parent].name : null, off: j.off.map((v) => v * scale) };
  }
  // Symmetrie: linke/rechte Offsets mitteln (x gespiegelt)
  for (const nm of JOINTS) {
    if (!nm.startsWith('Left') && !nm.startsWith('L')) continue;
    const r = nm.replace(/^Left/, 'Right').replace(/^LHip/, 'RHip');
    if (!out[r] || r === nm) continue;
    const a = out[nm].off, b = out[r].off;
    const m = [(a[0] - b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    out[nm].off = [m[0], m[1], m[2]];
    out[r].off = [-m[0], m[1], m[2]];
  }
  // Endpunkte (Kopf, Zehen, Hände) für die Körperform
  const ends = {};
  for (const j of bvh.joints) if (j.end) ends[j.name.replace('_End', '')] = j.off.map((v) => v * scale);
  return { joints: out, ends };
}

// ---------- Ausgabe ----------

const clips = [];
clips.push(standing('data/010/10_01.bvh', 'idle'));
clips.push(locomotion('data/035/35_01.bvh', 'walk'));
// erster Kandidat mit sauberem Zyklus gewinnt
function firstOk(files, name) {
  for (const f of files) {
    try { return locomotion(f, name); } catch (e) { console.log(`  (${name}: ${f} ohne Zyklus)`); }
  }
  throw new Error(`${name}: kein Clip`);
}
clips.push(firstOk(['data/016/16_36.bvh', 'data/016/16_35.bvh'], 'jog'));
clips.push(firstOk(['data/035/35_22.bvh', 'data/009/09_06.bvh', 'data/009/09_02.bvh', 'data/035/35_18.bvh'], 'run'));
clips.push(firstOk(['data/016/16_46.bvh', 'data/016/16_45.bvh', 'data/016/16_55.bvh'], 'fast'));
const back = findSegment('data/009/09_12.bvh', 180, 0.5);
console.log('Rückwärts 09_12:', back);
if (back) clips.push(locomotion('data/009/09_12.bvh', 'back', back));
// Seitschritt: längstes Seitwärts-Segment in mehreren Aufnahmen
let sideClip = null;
for (const f of ['data/069/69_42.bvh', 'data/069/69_48.bvh', 'data/041/41_02.bvh', 'data/009/09_12.bvh']) {
  for (const deg of [90, -90]) {
    const seg = findSegment(f, deg, 0.35);
    if (!seg || seg.to - seg.from < 1.2) continue;
    try { sideClip = locomotion(f, 'side', seg); break; } catch (e) { /* weiter */ }
  }
  if (sideClip) break;
}
if (sideClip) clips.push(sideClip); else console.log('kein Seitschritt gefunden');
clips.push(kick('data/010/10_02.bvh', 'kick'));

const rig = restSkeleton('data/035/35_01.bvh');

// Quaternionen als int16 (×32767), Höhe als uint16 (mm)
function encodeClip(c) {
  const buf = Buffer.alloc(c.n * (JOINTS.length * 8 + 2));
  let o = 0;
  for (let s = 0; s < c.n; s++) {
    for (let k = 0; k < JOINTS.length; k++) {
      let q = qNorm(c.q[s][k]);
      if (q[3] < 0) q = q.map((v) => -v);
      for (let d = 0; d < 4; d++) { buf.writeInt16LE(Math.round(q[d] * 32767), o); o += 2; }
    }
    buf.writeUInt16LE(Math.round(c.y[s] * 1000), o); o += 2;
  }
  return buf.toString('base64');
}

const outClips = clips.map((c) => ({
  name: c.name, loop: c.loop, n: c.n, cycle: +c.cycle.toFixed(4), stride: +c.stride.toFixed(4),
  speed: +c.speed.toFixed(3), dir: +c.dir.toFixed(3), contact: c.contact ? +c.contact.toFixed(3) : undefined,
  foot: c.foot, data: encodeClip(c),
}));
const header = `// Automatisch erzeugt von tools/extract-mocap.mjs – nicht von Hand bearbeiten.
// Bewegungsdaten: CMU Graphics Lab Motion Capture Database (mocap.cs.cmu.edu),
// BVH-Konvertierung von Bruce Hahne. "The data used in this project was obtained from
// mocap.cs.cmu.edu. The database was created with funding from NSF EIA-0196217."
// BVH-Konvention: y oben, z vorn, x links. Quaternionen (x,y,z,w) int16, Hüfthöhe in mm.
`;
const file = path.join(root, 'src/render/mocap-data.js');
fs.writeFileSync(file, `${header}export const JOINTS = ${JSON.stringify(JOINTS)};\nexport const RIG = ${JSON.stringify(rig)};\nexport const CLIPS = ${JSON.stringify(outClips)};\n`);
console.log(`geschrieben: ${(fs.statSync(file).size / 1024).toFixed(0)} KB`);
