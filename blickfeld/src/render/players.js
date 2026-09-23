// Spielerfiguren mit Motion-Capture-Animation (CMU-Datenbank).
// Ein glatter, prozedural modellierter Körper wird über ein 25-Gelenk-Skelett gehäutet
// (Skinning). Pro Frame werden Laufzyklen nach Tempo und Laufrichtung überblendet,
// die Pass-/Schussbewegung darübergelegt und der Kopf zum Ball gedreht.
// Rig-Raum = BVH-Konvention: y oben, z vorn, x links. Die Figur wird um +90° gedreht,
// damit "vorn" zur Simulationsrichtung passt. Keine Allokationen im Frame.

import * as THREE from 'three';
import { COLORS } from '../config.js';
import { angleDiff, clamp, lerp, lerpAngle, TAU } from '../core/math.js';
import { JOINTS, RIG, CLIPS } from './mocap-data.js';

const J = JOINTS.length;
const JI = Object.fromEntries(JOINTS.map((n, i) => [n, i]));
const PARENT = JOINTS.map((n) => (RIG.joints[n].parent ? JI[RIG.joints[n].parent] : -1));
const HIP_HEIGHT = 0.98;

// Proportionen: Wirbelsäule und Hals der CMU-Skelette sind kurz – auf 1,82 m Körpergröße strecken
const OFFSET_SCALE = { Spine: 1.75, Spine1: 2.05, Neck1: 0.85, Head: 0.85, LeftForeArm: 0.9, RightForeArm: 0.9, LeftHand: 1.25, RightHand: 1.25 };
const OFF = JOINTS.map((n) => {
  const s = OFFSET_SCALE[n] || 1;
  const o = RIG.joints[n].off;
  return [o[0] * s, o[1] * s, o[2] * s];
});
// Schultern etwas höher an den gestreckten Oberkörper setzen
OFF[JI.LeftArm][1] += 0.02; OFF[JI.RightArm][1] += 0.02;

// Ruhepose in Rig-Koordinaten (Hüfte bei y = HIP_HEIGHT)
const REST = [];
for (let j = 0; j < J; j++) {
  const p = PARENT[j] >= 0 ? REST[PARENT[j]] : [0, HIP_HEIGHT, 0];
  REST.push([p[0] + OFF[j][0], p[1] + OFF[j][1], p[2] + OFF[j][2]]);
}

// ---------- Clips dekodieren ----------

function b64(s) {
  if (typeof atob === 'function') {
    const t = atob(s), u = new Uint8Array(t.length);
    for (let i = 0; i < t.length; i++) u[i] = t.charCodeAt(i);
    return u;
  }
  return new Uint8Array(Buffer.from(s, 'base64'));
}

const MIRROR = JOINTS.map((n) => JI[n.replace(/^Left/, 'TMP').replace(/^Right/, 'Left').replace(/^TMP/, 'Right').replace(/^LHip/, 'TMPH').replace(/^RHip/, 'LHip').replace(/^TMPH/, 'RHip')]);

function decode(c) {
  const bytes = b64(c.data);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const q = new Float32Array(c.n * J * 4), y = new Float32Array(c.n);
  let o = 0;
  for (let s = 0; s < c.n; s++) {
    for (let k = 0; k < J; k++) for (let d = 0; d < 4; d++) { q[(s * J + k) * 4 + d] = dv.getInt16(o, true) / 32767; o += 2; }
    y[s] = dv.getUint16(o, true) / 1000; o += 2;
  }
  return { ...c, q, y };
}
const CLIP = {};
for (const c of CLIPS) CLIP[c.name] = decode(c);
// Seitschritt nach rechts = gespiegelter Seitschritt nach links
CLIP.sideR = mirrorClip(CLIP.side);

function mirrorClip(c) {
  const q = new Float32Array(c.q.length);
  for (let s = 0; s < c.n; s++) {
    for (let k = 0; k < J; k++) {
      const a = (s * J + k) * 4, b = (s * J + MIRROR[k]) * 4;
      q[b] = c.q[a]; q[b + 1] = -c.q[a + 1]; q[b + 2] = -c.q[a + 2]; q[b + 3] = c.q[a + 3];
    }
  }
  return { ...c, name: c.name + 'R', q, y: c.y };
}

// Vorwärts-Laufzyklen nach Tempo (m/s)
const FWD = [CLIP.idle, CLIP.walk, CLIP.jog, CLIP.run, CLIP.fast];
const FWD_V = [0, CLIP.walk.speed, CLIP.jog.speed, CLIP.run.speed, CLIP.fast.speed];

// Pose aus Clip bei Phase ph (0..1) in out (J×4) und Höhe zurück
function samplePose(c, ph, out) {
  const f = (c.loop ? ((ph % 1) + 1) % 1 : clamp(ph, 0, 1)) * (c.loop ? c.n : c.n - 1);
  let i0 = Math.floor(f);
  const u = f - i0;
  let i1 = i0 + 1;
  if (c.loop) { i0 %= c.n; i1 %= c.n; } else { i0 = Math.min(i0, c.n - 1); i1 = Math.min(i1, c.n - 1); }
  const q = c.q;
  for (let k = 0; k < J; k++) {
    const a = (i0 * J + k) * 4, b = (i1 * J + k) * 4;
    let d = q[a] * q[b] + q[a + 1] * q[b + 1] + q[a + 2] * q[b + 2] + q[a + 3] * q[b + 3];
    const sg = d < 0 ? -1 : 1;
    const x = q[a] + (q[b] * sg - q[a]) * u, yv = q[a + 1] + (q[b + 1] * sg - q[a + 1]) * u;
    const z = q[a + 2] + (q[b + 2] * sg - q[a + 2]) * u, w = q[a + 3] + (q[b + 3] * sg - q[a + 3]) * u;
    const l = 1 / Math.sqrt(x * x + yv * yv + z * z + w * w);
    out[k * 4] = x * l; out[k * 4 + 1] = yv * l; out[k * 4 + 2] = z * l; out[k * 4 + 3] = w * l;
  }
  return c.y[i0] + (c.y[i1] - c.y[i0]) * u + (c.ground || 0);
}

// Bodenkontakt: Die Clips stammen von verschiedenen Personen. Pro Clip wird die Hüfthöhe so verschoben,
// dass die Schuhsohle (Ferse/Spitze, wie im Körpermodell) in der Standphase den Rasen berührt.
const SOLE = (() => {
  const A = REST[JI.LeftFoot], T = REST[JI.LeftToeBase];
  return { heel: [0, -0.086, -0.07], toe: [T[0] - A[0], -0.092, T[2] + 0.07 - A[2]] };
})();
function groundOffset(c) {
  const pose = new Float32Array(J * 4);
  const M = JOINTS.map(() => new THREE.Matrix4()), L = new THREE.Matrix4();
  const q = new THREE.Quaternion(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  const vals = [];
  for (let f = 0; f < c.n; f++) {
    const y = samplePose(c, c.loop ? f / c.n : f / (c.n - 1), pose);
    for (let j = 0; j < J; j++) {
      q.set(pose[j * 4], pose[j * 4 + 1], pose[j * 4 + 2], pose[j * 4 + 3]);
      if (j === 0) { v.set(0, y, 0); M[0].compose(v, q, one); continue; }
      v.set(OFF[j][0], OFF[j][1], OFF[j][2]);
      L.compose(v, q, one);
      M[j].multiplyMatrices(M[PARENT[j]], L);
    }
    let lo = Infinity;
    for (const foot of [JI.LeftFoot, JI.RightFoot]) {
      const sx = foot === JI.LeftFoot ? 1 : -1;
      for (const pt of [SOLE.heel, SOLE.toe]) {
        v.set(pt[0] * sx, pt[1], pt[2]).applyMatrix4(M[foot]);
        lo = Math.min(lo, v.y);
      }
    }
    vals.push(lo);
  }
  vals.sort((a, b) => a - b);
  return -vals[Math.floor(vals.length * 0.1)];
}
for (const c of Object.values(CLIP)) c.ground = groundOffset(c);

// acc += w · pose (Vorzeichen an acc angleichen); am Ende normalisieren
function accumulate(acc, pose, w) {
  for (let k = 0; k < J; k++) {
    const a = k * 4;
    const d = acc[a] * pose[a] + acc[a + 1] * pose[a + 1] + acc[a + 2] * pose[a + 2] + acc[a + 3] * pose[a + 3];
    const s = d < 0 ? -w : w;
    acc[a] += pose[a] * s; acc[a + 1] += pose[a + 1] * s; acc[a + 2] += pose[a + 2] * s; acc[a + 3] += pose[a + 3] * s;
  }
}

function normalizePose(p) {
  for (let k = 0; k < J; k++) {
    const a = k * 4;
    const l = Math.sqrt(p[a] * p[a] + p[a + 1] * p[a + 1] + p[a + 2] * p[a + 2] + p[a + 3] * p[a + 3]) || 1;
    p[a] /= l; p[a + 1] /= l; p[a + 2] /= l; p[a + 3] /= l;
  }
}

// ---------- Körper modellieren ----------

// Regionen: 0 Haut, 1 Trikot, 2 Hose, 3 Stutzen, 4 Schuhe, 5 Haare, 6 Unterarm, 7 Hände, 8 Besatz (Kragen, Ärmelsaum)
class BodyBuilder {
  constructor() {
    this.pos = []; this.skinI = []; this.skinW = []; this.region = []; this.num = []; this.index = [];
  }
  vert(p, joints, weights, region, num) {
    this.pos.push(p[0], p[1], p[2]);
    const ji = [0, 0, 0, 0], jw = [0, 0, 0, 0];
    for (let k = 0; k < joints.length && k < 4; k++) { ji[k] = joints[k]; jw[k] = weights[k]; }
    const s = jw[0] + jw[1] + jw[2] + jw[3] || 1;
    this.skinI.push(...ji); this.skinW.push(jw[0] / s, jw[1] / s, jw[2] / s, jw[3] / s);
    this.region.push(region);
    this.num.push(num ? num[0] : -9, num ? num[1] : -9);
    return this.pos.length / 3 - 1;
  }
  // Ringe entlang einer Achse; ringFn(t) → {c: Mitte, u, v: Querachsen, rx, ry, joints, weights, region}.
  // Ändert sich die Region zwischen zwei Ringen, bekommt jedes Band eigene Vertices → saubere Kanten (Saum).
  tube(nRings, nSeg, ringFn, capStart, capEnd, numFn) {
    const rings = [];
    for (let r = 0; r < nRings; r++) rings.push(ringFn(r / (nRings - 1)));
    const cache = new Map();
    const ringVerts = (r, region) => {
      const key = r * 16 + region;
      if (cache.has(key)) return cache.get(key);
      const R = rings[r];
      const base = this.pos.length / 3;
      for (let s = 0; s < nSeg; s++) {
        const a = (s / nSeg) * TAU;
        const ca = Math.cos(a), sa = Math.sin(a);
        const sq = R.square || 0; // leicht kantige Querschnitte (Brustkorb)
        const cx = Math.sign(ca) * Math.pow(Math.abs(ca), 1 - sq), sy = Math.sign(sa) * Math.pow(Math.abs(sa), 1 - sq);
        const p = [
          R.c[0] + R.u[0] * cx * R.rx + R.v[0] * sy * R.ry,
          R.c[1] + R.u[1] * cx * R.rx + R.v[1] * sy * R.ry,
          R.c[2] + R.u[2] * cx * R.rx + R.v[2] * sy * R.ry,
        ];
        this.vert(p, R.joints, R.weights, region, numFn ? numFn(p) : null);
      }
      cache.set(key, base);
      return base;
    };
    const bandRegion = (r) => (rings[r].region === rings[r + 1].region ? rings[r].region : rings[r + 1].band ?? rings[r].region);
    for (let r = 0; r < nRings - 1; r++) {
      const reg = bandRegion(r);
      const b0 = ringVerts(r, reg), b1 = ringVerts(r + 1, reg);
      for (let s = 0; s < nSeg; s++) {
        const a = b0 + s, b = b0 + ((s + 1) % nSeg);
        const c = b1 + s, d = b1 + ((s + 1) % nSeg);
        this.index.push(a, c, b, b, c, d);
      }
    }
    const cap = (ring, flip) => {
      const R = rings[ring];
      const reg = ring === 0 ? bandRegion(0) : bandRegion(nRings - 2);
      const base = ringVerts(ring, reg);
      const ci = this.vert(R.c, R.joints, R.weights, reg, null);
      for (let s = 0; s < nSeg; s++) {
        const a = base + s, b = base + ((s + 1) % nSeg);
        if (flip) this.index.push(ci, b, a); else this.index.push(ci, a, b);
      }
    };
    if (capStart) cap(0, false);
    if (capEnd) cap(nRings - 1, true);
  }
  // Ellipsoid; regionFn(nx, ny, nz) bestimmt die Region je Fläche (Haaransatz), shapeFn verformt (Kinn)
  ellipsoid(c, rx, ry, rz, nLat, nLon, joints, weights, region, regionFn, shapeFn) {
    const cache = new Map();
    const grid = (reg) => {
      if (cache.has(reg)) return cache.get(reg);
      const base = this.pos.length / 3;
      for (let i = 0; i <= nLat; i++) {
        const th = (i / nLat) * Math.PI;
        for (let k = 0; k < nLon; k++) {
          const ph = (k / nLon) * TAU;
          const n = [Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)];
          const s = shapeFn ? shapeFn(n, reg) : [1, 1, 1];
          this.vert([c[0] + n[0] * rx * s[0], c[1] + n[1] * ry * s[1], c[2] + n[2] * rz * s[2]], joints, weights, reg, null);
        }
      }
      cache.set(reg, base);
      return base;
    };
    for (let i = 0; i < nLat; i++) {
      for (let k = 0; k < nLon; k++) {
        const th = ((i + 0.5) / nLat) * Math.PI, ph = ((k + 0.5) / nLon) * TAU;
        const reg = regionFn ? regionFn(Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)) : region;
        const base = grid(reg);
        const a = base + i * nLon + k, b = base + i * nLon + ((k + 1) % nLon);
        const cc = a + nLon, d = b + nLon;
        this.index.push(a, b, cc, b, d, cc);
      }
    }
  }
  // Haarkappe: Ringe vom Scheitel bis zum Haaransatz thetaFn(φ); Dicke nimmt zum Rand hin ab
  hairCap(c, rx, ry, rz, nLat, nLon, thetaFn, joints, weights, region) {
    const base = this.pos.length / 3;
    const top = this.vert([c[0], c[1] + ry * 1.06, c[2]], joints, weights, region, null);
    for (let i = 1; i <= nLat; i++) {
      const s = i / nLat;
      for (let k = 0; k < nLon; k++) {
        const ph = (k / nLon) * TAU;
        const th = s * thetaFn(ph);
        const sc = 1.06 - 0.035 * s * s;
        const chin = 0.82 + 0.18 * smooth(-0.9, -0.1, Math.cos(th));
        const n = [Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)];
        this.vert([c[0] + n[0] * rx * sc * chin, c[1] + n[1] * ry * sc, c[2] + n[2] * rz * sc * (n[2] > 0 ? 1 : 0.97)], joints, weights, region, null);
      }
    }
    for (let k = 0; k < nLon; k++) this.index.push(top, base + 1 + ((k + 1) % nLon), base + 1 + k);
    for (let i = 0; i < nLat - 1; i++) {
      for (let k = 0; k < nLon; k++) {
        const a = base + 1 + i * nLon + k, b = base + 1 + i * nLon + ((k + 1) % nLon);
        const cc = a + nLon, d = b + nLon;
        this.index.push(a, b, cc, b, d, cc);
      }
    }
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.skinI, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.skinW, 4));
    g.setAttribute('aRegion', new THREE.Float32BufferAttribute(this.region, 1));
    g.setAttribute('aNum', new THREE.Float32BufferAttribute(this.num, 2));
    g.setIndex(this.index);
    g.computeVertexNormals();
    // Nähte (doppelte Vertices an Farbkanten) weich schattieren: Normalen gleicher Positionen mitteln
    const pos = g.attributes.position.array, nor = g.attributes.normal.array;
    const groups = new Map();
    for (let i = 0; i < pos.length / 3; i++) {
      const key = `${Math.round(pos[i * 3] * 1e4)},${Math.round(pos[i * 3 + 1] * 1e4)},${Math.round(pos[i * 3 + 2] * 1e4)}`;
      const l = groups.get(key);
      if (l) l.push(i); else groups.set(key, [i]);
    }
    for (const l of groups.values()) {
      if (l.length < 2) continue;
      let x = 0, y = 0, z = 0;
      for (const i of l) { x += nor[i * 3]; y += nor[i * 3 + 1]; z += nor[i * 3 + 2]; }
      const n = Math.hypot(x, y, z) || 1;
      for (const i of l) { nor[i * 3] = x / n; nor[i * 3 + 1] = y / n; nor[i * 3 + 2] = z / n; }
    }
    g.computeBoundingSphere();
    return g;
  }
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };

// Querachsen zu einer Knochenrichtung (u zeigt möglichst nach "vorn" = +z)
function frame(dir, prefer) {
  let u = cross(dir, prefer || [0, 0, 1]);
  if (Math.hypot(...u) < 1e-3) u = cross(dir, [1, 0, 0]);
  u = norm(u);
  const v = norm(cross(u, dir));
  return [u, v];
}

// Gliedmaße zwischen Gelenk a und b; Gewichte an den Enden weich mit Nachbarn verblendet
function limb(B, ja, jb, jParent, jChild, profile, opts = {}) {
  const A = REST[ja], Bp = REST[jb];
  const dir = norm(sub(Bp, A));
  const [u, v] = frame(dir, opts.prefer);
  const len = Math.hypot(...sub(Bp, A)) * (opts.extend || 1);
  B.tube(opts.rings || 9, opts.seg || 12, (t) => {
    const pr = profile(t);
    const c = add(A, mul(dir, (opts.start || 0) * len + t * len * (1 - (opts.start || 0))));
    let joints = [ja], weights = [1];
    const sBlend = opts.blendStart ?? 0.18, eBlend = opts.blendEnd ?? 0.15;
    if (jParent >= 0 && t < sBlend) {
      const wp = 0.5 * (1 - smooth(0, sBlend, t));
      joints = [ja, jParent]; weights = [1 - wp, wp];
    } else if (jChild >= 0 && t > 1 - eBlend) {
      const wc = 0.5 * smooth(1 - eBlend, 1, t);
      joints = [ja, jChild]; weights = [1 - wc, wc];
    }
    return { c, u: pr.front ? u : u, v, rx: pr.rx, ry: pr.ry, joints, weights, region: pr.region, square: pr.square };
  }, opts.capStart, opts.capEnd);
}

function buildBody() {
  const B = new BodyBuilder();
  const hipY = HIP_HEIGHT;
  const J_ = JI;
  // ----- Rumpf: Querschnitte über der Hüfte (y relativ zur Hüfte) -----
  const sections = [
    [-0.13, 0.155, 0.105, 2], [-0.03, 0.172, 0.118, 2], [0.06, 0.163, 0.112, 2], [0.1, 0.158, 0.11, 1],
    [0.2, 0.152, 0.106, 1], [0.32, 0.168, 0.114, 1], [0.44, 0.185, 0.121, 1], [0.54, 0.19, 0.114, 1],
    [0.6, 0.155, 0.095, 1], [0.64, 0.075, 0.068, 1],
  ];
  const spineW = (y) => {
    // Gewichte entlang der Wirbelsäule nach Höhe
    const yS = REST[J_.Spine][1] - hipY, yS1 = REST[J_.Spine1][1] - hipY;
    if (y <= 0.02) return [[J_.Hips], [1]];
    if (y < yS) { const t = y / yS; return [[J_.LowerBack, J_.Hips], [0.5 + 0.5 * t, 0.5 - 0.5 * t]]; }
    if (y < yS1) { const t = (y - yS) / (yS1 - yS); return [[J_.Spine, J_.LowerBack], [0.6 + 0.4 * t, 0.4 - 0.4 * t]]; }
    return [[J_.Spine1, J_.Spine], [0.85, 0.15]];
  };
  const nS = sections.length;
  const cr = (k, u, idx) => {
    // Catmull-Rom über die Querschnitte → weiche Silhouette
    const p0 = sections[Math.max(0, k - 1)][idx], p1 = sections[k][idx], p2 = sections[k + 1][idx], p3 = sections[Math.min(nS - 1, k + 2)][idx];
    return 0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u);
  };
  B.tube(2 * nS - 1, 22, (t) => {
    const f = t * (nS - 1), i = Math.min(nS - 2, Math.floor(f)), u = f - i;
    const y = cr(i, u, 0), rx = cr(i, u, 1), rz = cr(i, u, 2);
    const [joints, weights] = spineW(y);
    const region = u < 0.5 ? sections[i][3] : sections[i + 1][3];
    return { c: [0, hipY + y, -0.01 + 0.012 * smooth(0.2, 0.5, y)], u: [1, 0, 0], v: [0, 0, 1], rx, ry: rz, joints, weights, region, square: y > 0.15 && y < 0.58 ? 0.1 : 0.03 };
  }, true, false, (p) => {
    // Rückennummer: Fläche auf dem Rücken (z < 0)
    if (p[2] > -0.02) return null;
    return [(0.12 - p[0]) / 0.24, (p[1] - (hipY + 0.2)) / 0.25];
  });
  // ----- Hals und Kopf -----
  const neckA = [0, hipY + 0.6, -0.012], neckB = [0, REST[J_.Head][1] + 0.03, 0.0];
  B.tube(5, 12, (t) => ({ c: add(neckA, mul(sub(neckB, neckA), t)), u: [1, 0, 0], v: [0, 0, 1], rx: 0.054, ry: 0.058, joints: t < 0.5 ? [J_.Neck1, J_.Spine1] : [J_.Head, J_.Neck1], weights: t < 0.5 ? [0.7, 0.3] : [0.7, 0.3], region: 0 }));
  // Kragen
  B.tube(3, 16, (t) => ({ c: [0, hipY + 0.598 + t * 0.03, -0.012], u: [1, 0, 0], v: [0, 0, 1], rx: 0.072 - t * 0.012, ry: 0.07 - t * 0.012, joints: [J_.Spine1], weights: [1], region: 8 }));
  const hc = add(REST[J_.Head], [0, 0.1, 0.018]);
  B.ellipsoid(hc, 0.082, 0.112, 0.099, 14, 20, [J_.Head], [1], 0, null, (n) => {
    const chin = 0.82 + 0.18 * smooth(-0.9, -0.1, n[1]);  // Kiefer schmaler
    return [chin, 1, n[2] > 0 ? 1 : 0.97];
  });
  // Haare als Kappe mit weichem Haaransatz: Stirn vorn, Schläfen seitlich, Nacken hinten
  B.hairCap(hc, 0.082, 0.112, 0.099, 7, 24, (ph) => {
    const f = Math.sin(ph); // +1 vorn, −1 hinten
    return (f > 0 ? 88 - 36 * f : 88 + 26 * -f) * Math.PI / 180;
  }, [J_.Head], [1], 5);
  // Nase und Ohren andeuten
  B.ellipsoid(add(hc, [0, -0.014, 0.094]), 0.014, 0.026, 0.02, 4, 8, [J_.Head], [1], 0);
  for (const sx of [-1, 1]) B.ellipsoid(add(hc, [sx * 0.08, -0.005, -0.004]), 0.012, 0.03, 0.02, 4, 8, [J_.Head], [1], 0);
  // ----- Arme -----
  for (const side of ['Left', 'Right']) {
    const arm = J_[`${side}Arm`], fore = J_[`${side}ForeArm`], hand = J_[`${side}Hand`];
    limb(B, arm, fore, J_.Spine1, fore, (t) => {
      const sleeve = t < 0.47, cuff = t >= 0.41 && t < 0.47;
      return { rx: lerp(0.056, 0.042, t) + (sleeve ? 0.009 : 0), ry: lerp(0.054, 0.04, t) + (sleeve ? 0.009 : 0), region: cuff ? 8 : sleeve ? 1 : 0 };
    }, { rings: 13, seg: 14, prefer: [0, 1, 0], blendStart: 0.25, blendEnd: 0.18, capStart: true, start: -0.2 });
    limb(B, fore, hand, arm, hand, (t) => ({ rx: lerp(0.044, 0.032, t), ry: lerp(0.04, 0.028, t), region: 6 }), { rings: 8, seg: 12, prefer: [0, 1, 0], blendStart: 0.2 });
    const dir = norm(sub(REST[hand], REST[fore]));
    B.ellipsoid(add(REST[hand], mul(dir, 0.055)), 0.05, 0.022, 0.042, 6, 10, [hand], [1], 7);
  }
  // ----- Beine -----
  for (const side of ['Left', 'Right']) {
    const up = J_[`${side}UpLeg`], leg = J_[`${side}Leg`], foot = J_[`${side}Foot`], toe = J_[`${side}ToeBase`];
    limb(B, up, leg, J_.Hips, leg, (t) => ({
      rx: lerp(0.088, 0.058, t) + (t < 0.4 ? 0.012 : 0), ry: lerp(0.092, 0.062, t) + (t < 0.4 ? 0.01 : 0), region: t < 0.4 ? 2 : 0,
    }), { rings: 11, seg: 16, blendStart: 0.2, blendEnd: 0.16, start: -0.08 });
    limb(B, leg, foot, up, foot, (t) => {
      const calf = Math.exp(-((t - 0.28) ** 2) / 0.02) * 0.012;
      return { rx: lerp(0.058, 0.04, t) + calf, ry: lerp(0.056, 0.038, t) + calf * 1.3, region: t < 0.1 ? 0 : 3 };
    }, { rings: 11, seg: 14, blendStart: 0.16, blendEnd: 0.1 });
    // Schuh: von der Ferse bis zur Spitze
    const A = REST[foot], T = add(REST[toe], [0, 0, 0.07]);
    const heel = add(A, [0, -0.04, -0.07]);
    const len = T[2] - heel[2];
    B.tube(8, 12, (t) => {
      const z = heel[2] + t * len;
      const hgt = lerp(0.075, 0.04, smooth(0.2, 1, t));
      const y = A[1] - 0.075 + hgt * 0.5 + (1 - t) * 0.01;
      const x = lerp(A[0], T[0], t);
      return { c: [x, y - 0.012, z], u: [1, 0, 0], v: [0, 1, 0], rx: lerp(0.045, 0.043, t) * (t > 0.85 ? 0.8 : 1), ry: hgt * 0.62, joints: [foot], weights: [1], region: 4, square: 0.3 };
    }, true, true);
  }
  return B.geometry();
}

// ---------- Rückennummern ----------

function makeNumberAtlas() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let n = 1; n <= 32; n++) {
    const col = (n - 1) % 8, row = Math.floor((n - 1) / 8);
    ctx.font = `700 ${n > 9 ? 46 : 54}px "Barlow Condensed", "Arial Narrow", system-ui, sans-serif`;
    ctx.fillText(String(n), col * 64 + 32, row * 64 + 34);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function makeMaterial(atlas) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.82, metalness: 0 });
  mat.userData.u = {
    uCol: { value: [0, 1, 2, 3, 4, 5, 6, 7, 8].map(() => new THREE.Color()) },
    uNumCell: { value: new THREE.Vector2() },
    uNumColor: { value: new THREE.Color() },
    uAtlas: { value: atlas },
  };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, mat.userData.u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aRegion;\nattribute vec2 aNum;\nvarying float vRegion;\nvarying vec2 vNum;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRegion = aRegion;\nvNum = aNum;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform vec3 uCol[9];
        uniform vec2 uNumCell;
        uniform vec3 uNumColor;
        uniform sampler2D uAtlas;
        varying float vRegion;
        varying vec2 vNum;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        int r = int(vRegion + 0.5);
        vec3 base = uCol[0];
        for (int k = 1; k < 9; k++) if (k == r) base = uCol[k];
        diffuseColor.rgb = base;
        if (r == 1 && vNum.x > 0.0 && vNum.x < 1.0 && vNum.y > 0.0 && vNum.y < 1.0) {
          float a = texture2D(uAtlas, uNumCell + vec2(vNum.x, vNum.y) * vec2(0.125, 0.25)).a;
          diffuseColor.rgb = mix(diffuseColor.rgb, uNumColor, smoothstep(0.35, 0.65, a));
        }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        if (r == 0 || r == 6 || r == 7) roughnessFactor = 0.62;
        if (r == 5) roughnessFactor = 0.9;
        if (r == 4) roughnessFactor = 0.45;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        // dezentes Streiflicht, hebt die Spieler vom Rasen ab (Fernsehbild)
        float rim = 1.0 - saturate(dot(normalize(vNormal), normalize(vViewPosition)));
        totalEmissiveRadiance += diffuseColor.rgb * pow(rim, 3.0) * 0.22;`);
  };
  mat.customProgramCacheKey = () => 'blickfeld-player-1';
  return mat;
}

// ---------- Spieler-Ensemble ----------

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpQ2 = new THREE.Quaternion();
const tmpV = new THREE.Vector3();
const ONE = new THREE.Vector3(1, 1, 1);
const AXIS_Y = new THREE.Vector3(0, 1, 0);
const AXIS_Z = new THREE.Vector3(0, 0, 1);
const AXIS_X = new THREE.Vector3(1, 0, 0);

export class Players {
  constructor(maxPlayers = 22) {
    this.max = maxPlayers;
    this.geometry = buildBody();
    this.atlas = makeNumberAtlas();
    this.group = new THREE.Group();
    this.meshes = [];
    this.world = new Array(J).fill(0).map(() => new THREE.Matrix4());
    this.base = new THREE.Matrix4();
    this.rigFix = new THREE.Matrix4().makeRotationY(Math.PI / 2);
    this.restInv = REST.map((p) => new THREE.Matrix4().makeTranslation(-p[0], -p[1], -p[2]));
    this.offV = OFF.map((o) => new THREE.Vector3(o[0], o[1], o[2]));
    this.pose = new Float32Array(J * 4);
    this.tmpPose = new Float32Array(J * 4);
    this.kickPose = new Float32Array(J * 4);
    this.phase = new Float32Array(maxPlayers);
    this.lastX = new Float32Array(maxPlayers);
    this.lastY = new Float32Array(maxPlayers);
    this.hidden = new Uint8Array(maxPlayers);
    this.dive = new Float32Array(maxPlayers);
    this.ballX = 0; this.ballY = 0;
    const bones = [];
    for (let j = 0; j < J; j++) bones.push(new THREE.Bone());
    for (let i = 0; i < maxPlayers; i++) {
      const mat = makeMaterial(this.atlas);
      const skel = new THREE.Skeleton(bones.slice(), bones.map(() => new THREE.Matrix4()));
      skel.computeBoneTexture();
      skel.update = () => {}; // Knochenmatrizen setzen wir selbst
      const m = new THREE.SkinnedMesh(this.geometry, mat);
      m.bind(skel, new THREE.Matrix4());
      m.frustumCulled = false;
      m.matrixAutoUpdate = false;
      this.meshes.push(m);
      this.group.add(m);
    }
  }

  setup(w) {
    const c = new THREE.Color();
    for (let i = 0; i < this.max; i++) {
      const m = this.meshes[i];
      m.visible = i < w.n;
      if (i >= w.n) continue;
      const kit = w.gk[i] ? (w.team[i] === 0 ? COLORS.ownGk : COLORS.oppGk) : (w.team[i] === 0 ? COLORS.own : COLORS.opp);
      const skin = COLORS.skin[w.skin[i] % COLORS.skin.length];
      const hair = COLORS.hair[(i * 7 + w.skin[i]) % COLORS.hair.length];
      const boot = COLORS.boots[(i * 3) % COLORS.boots.length];
      const u = m.material.userData.u;
      const set = (k, hex) => u.uCol.value[k].setHex(hex);
      set(0, skin); set(1, kit.shirt); set(2, kit.shorts); set(3, kit.socks); set(4, boot); set(5, hair);
      set(6, w.gk[i] ? kit.shirt : skin); set(7, w.gk[i] ? 0x2b2b2b : skin); set(8, kit.trim ?? kit.number);
      const n = Math.max(1, Math.min(32, w.num[i]));
      u.uNumCell.value.set(((n - 1) % 8) / 8, 1 - (Math.floor((n - 1) / 8) + 1) / 4);
      u.uNumColor.value.copy(c.setHex(kit.number));
      this.phase[i] = (i * 0.37) % 1;
      this.lastX[i] = w.px[i]; this.lastY[i] = w.py[i];
      this.dive[i] = 0;
    }
  }

  update(w, alpha, hideIndex, eyeX, eyeY, dtReal) {
    const b = w.ball;
    const gd = w.gkDive;
    this.ballX = lerp(b.px, b.x, alpha);
    this.ballY = lerp(b.py, b.y, alpha);
    for (let i = 0; i < w.n; i++) {
      const m = this.meshes[i];
      const x = lerp(w.ppx[i], w.px[i], alpha), y = lerp(w.ppy[i], w.py[i], alpha);
      let hide = i === hideIndex;
      if (!hide && eyeX !== undefined) {
        const dx = x - eyeX, dy = y - eyeY;
        hide = dx * dx + dy * dy < 0.6 * 0.6;
      }
      m.visible = !hide;
      if (hide) { this.lastX[i] = x; this.lastY[i] = y; continue; }
      // Torwart-Hechtsprung: Seite relativ zur Blickrichtung (+ = links)
      if (gd && gd.i === i) {
        const k = clamp((w.t - gd.t0) / 0.28, 0, 1);
        this.dive[i] = k * (Math.cos(w.hd[i]) * gd.dir >= 0 ? 1 : -1);
      } else this.dive[i] = 0;
      this.animate(w, i, x, y, alpha, dtReal);
    }
  }

  animate(w, i, x, y, alpha, dtReal) {
    const hd = lerpAngle(w.phd[i], w.hd[i], alpha);
    const vx = w.vx[i], vy = w.vy[i];
    const speed = Math.sqrt(vx * vx + vy * vy);
    const moved = Math.hypot(x - this.lastX[i], y - this.lastY[i]);
    this.lastX[i] = x; this.lastY[i] = y;
    const rel = speed > 0.25 ? angleDiff(hd, Math.atan2(vy, vx)) : 0;
    const fwd = Math.cos(rel), side = Math.sin(rel);
    const pose = this.pose;
    pose.fill(0);

    // --- Laufzyklen überblenden, Phase aus zurückgelegtem Weg (keine rutschenden Füße) ---
    const v = Math.min(speed, 8.5);
    const vAnim = Math.min(v, FWD_V[4]);
    let k = 0;
    while (k < FWD_V.length - 2 && vAnim > FWD_V[k + 1]) k++;
    const t = clamp((vAnim - FWD_V[k]) / (FWD_V[k + 1] - FWD_V[k]), 0, 1);
    const cA = FWD[k], cB = FWD[k + 1];
    const wBack = speed > 0.4 ? clamp((-fwd - 0.3) / 0.4, 0, 1) * clamp(1 - (v - 3) / 1.5, 0, 1) : 0;
    const wSide = speed > 0.4 ? clamp((Math.abs(side) - 0.55) / 0.3, 0, 1) * (1 - wBack) * clamp(1 - (v - 3.5) / 1.5, 0, 1) : 0;
    const wFwd = 1 - wBack - wSide;
    // Schrittlänge der aktiven Mischung (Sprint: längere Schritte als im Labor)
    let stride = lerp(cA.stride || 1.4, cB.stride, t);
    if (v > FWD_V[4]) stride *= 1 + 0.55 * (v - FWD_V[4]) / 4;
    stride = stride * wFwd + CLIP.back.stride * wBack + CLIP.side.stride * wSide;
    if (k === 0 && t < 0.5 && moved < 0.01) this.phase[i] += (dtReal || 0.016) / CLIP.idle.cycle * 0.8;
    else this.phase[i] += moved / Math.max(0.5, stride);
    const ph = this.phase[i];

    let hipY = 0;
    if (wFwd > 0.001) {
      hipY += samplePose(cA, ph, this.tmpPose) * (1 - t) * wFwd;
      accumulate(pose, this.tmpPose, (1 - t) * wFwd);
      hipY += samplePose(cB, ph, this.tmpPose) * t * wFwd;
      accumulate(pose, this.tmpPose, t * wFwd);
    }
    if (wBack > 0.001) { hipY += samplePose(CLIP.back, ph, this.tmpPose) * wBack; accumulate(pose, this.tmpPose, wBack); }
    if (wSide > 0.001) {
      const sc = side > 0 ? CLIP.side : CLIP.sideR;
      hipY += samplePose(sc, ph, this.tmpPose) * wSide; accumulate(pose, this.tmpPose, wSide);
    }

    // --- Pass/Schuss darüberlegen ---
    const kt = w.kickT[i] >= 0 ? w.kickT[i] : (w.pkickT[i] >= 0 ? w.pkickT[i] : -1);
    if (kt >= 0) {
      const kc = CLIP.kick;
      const clipT = (kt - 0.22 + kc.contact) / kc.cycle;
      const wk = clamp(kt / 0.1, 0, 1) * clamp((0.5 - kt) / 0.12, 0, 1);
      const hk = samplePose(kc, clipT, this.kickPose);
      normalizePose(pose);
      for (let q = 0; q < J * 4; q++) this.tmpPose[q] = pose[q];
      pose.fill(0);
      accumulate(pose, this.tmpPose, 1 - wk);
      accumulate(pose, this.kickPose, wk);
      hipY = hipY * (1 - wk) + hk * wk;
    }
    normalizePose(pose);

    // --- Grundtransformation: Position, Blickrichtung, Rig-Ausrichtung ---
    const base = this.base;
    base.makeRotationY(hd);
    base.setPosition(x, 0, -y);
    base.multiply(this.rigFix);

    // Vorlage bei Sprint (über das Rig hinaus), Torwart-Parade
    const lean = clamp((speed - 4.3) * 0.045, 0, 0.18) * Math.max(0, fwd);
    const worldM = this.world;
    const look = clamp(angleDiff(hd, Math.atan2(this.ballY - y, this.ballX - x)), -1.3, 1.3);
    for (let j = 0; j < J; j++) {
      const p = PARENT[j];
      tmpQ.set(pose[j * 4], pose[j * 4 + 1], pose[j * 4 + 2], pose[j * 4 + 3]);
      if (j === 0) {
        if (lean > 0) { tmpQ2.setFromAxisAngle(AXIS_X, lean); tmpQ.premultiply(tmpQ2); }
        if (this.dive[i] !== 0) {
          const d = this.dive[i];
          tmpQ2.setFromAxisAngle(AXIS_Z, -Math.sign(d) * 1.25 * Math.min(1, Math.abs(d)));
          tmpQ.premultiply(tmpQ2);
        }
        tmpV.set(0, hipY * (1 - 0.45 * Math.min(1, Math.abs(this.dive[i]))), 0);
        tmpM.compose(tmpV, tmpQ, ONE);
        worldM[0].multiplyMatrices(base, tmpM);
        continue;
      }
      if (j === JI.Neck1) {
        // Hals dreht ein Drittel der Blickwendung mit
        tmpQ2.setFromAxisAngle(AXIS_Y, look * 0.35);
        tmpQ.premultiply(tmpQ2);
      } else if (j === JI.Head) {
        // Kopf stabilisiert (wie beim echten Laufen): Blick waagerecht, leicht gesenkt, zum Ball gedreht
        tmpV.copy(this.offV[j]).applyMatrix4(worldM[p]);
        tmpQ.setFromAxisAngle(AXIS_Y, hd + Math.PI / 2 + look);
        tmpQ2.setFromAxisAngle(AXIS_X, 0.1 + lean * 0.4);
        tmpQ.multiply(tmpQ2);
        worldM[j].compose(tmpV, tmpQ, ONE);
        continue;
      }
      if (this.dive[i] !== 0 && (j === JI.LeftArm || j === JI.RightArm)) {
        const up = (j === JI.LeftArm ? 1 : -1) * 1.2 * Math.min(1, Math.abs(this.dive[i]));
        tmpQ2.setFromAxisAngle(AXIS_Z, up);
        tmpQ.premultiply(tmpQ2);
      }
      tmpM.compose(this.offV[j], tmpQ, ONE);
      worldM[j].multiplyMatrices(worldM[p], tmpM);
    }
    const bm = this.meshes[i].skeleton.boneMatrices;
    for (let j = 0; j < J; j++) {
      tmpM.multiplyMatrices(worldM[j], this.restInv[j]);
      tmpM.toArray(bm, j * 16);
    }
    this.meshes[i].skeleton.boneTexture.needsUpdate = true;
  }

  // Torwart-Parade: Richtung (+1 links / −1 rechts aus Sicht des Torwarts), Stärke 0..1
  setDive(i, v) { this.dive[i] = v; }
}

export { REST, JI, HIP_HEIGHT };
