// Spielerfiguren: pro Körperteil ein InstancedMesh → alle 22 Spieler in 10 Draw Calls.
// Lokales Koordinatensystem einer Figur: vorne = +X, oben = +Y, rechts = +Z.
// Die Animation ist prozedural (Schrittzyklus aus der Simulation), ohne Skelett.

import * as THREE from 'three';
import { COLORS } from '../config.js';
import { angleDiff, clamp, lerp, lerpAngle } from '../core/math.js';
import { mergeGeometries } from './geo.js';

const HIP_Y = 0.96;
const THIGH = 0.45;
const SHIN = 0.43;
const TORSO = 0.52;
const UPPER_ARM = 0.29;

function limb(r1, r2, len, seg) {
  const g = new THREE.CylinderGeometry(r1, r2, len, seg, 1);
  g.translate(0, -len / 2, 0);
  return g;
}

function buildGeometries() {
  const torso = new THREE.CylinderGeometry(0.205, 0.165, TORSO, 8, 2);
  torso.scale(0.62, 1, 1);
  torso.translate(0, TORSO / 2, 0);
  const shoulders = new THREE.SphereGeometry(0.2, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2);
  shoulders.scale(0.62, 0.32, 1.02);
  shoulders.translate(0, TORSO - 0.005, 0);
  const torsoGeo = mergeGeometries([torso, shoulders], false);

  const shorts = new THREE.CylinderGeometry(0.175, 0.19, 0.26, 8, 1);
  shorts.scale(0.72, 1, 1);
  shorts.translate(0, HIP_Y - 0.08, 0);

  const neck = new THREE.CylinderGeometry(0.052, 0.058, 0.12, 7);
  neck.translate(0, 0.05, 0);
  const skull = new THREE.IcosahedronGeometry(0.108, 1);
  skull.scale(1.0, 1.13, 0.94);
  skull.translate(0.005, 0.2, 0);
  const nose = new THREE.ConeGeometry(0.022, 0.05, 4);
  nose.rotateZ(-Math.PI / 2);
  nose.translate(0.11, 0.19, 0);
  const headGeo = mergeGeometries([neck, skull, nose], false);

  const hair = new THREE.SphereGeometry(0.116, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.52);
  hair.scale(1.02, 1.08, 0.97);
  hair.rotateZ(0.42); // Haaransatz vorne höher, hinten tiefer
  hair.translate(-0.012, 0.215, 0);

  const upperArm = limb(0.058, 0.047, UPPER_ARM, 6);
  const foreArm = limb(0.043, 0.034, 0.25, 6);
  const hand = new THREE.SphereGeometry(0.045, 6, 4);
  hand.scale(0.8, 1.1, 0.6);
  hand.translate(0, -0.27, 0);
  const foreGeo = mergeGeometries([foreArm, hand], false);

  const thigh = limb(0.085, 0.062, THIGH, 7);
  const shin = limb(0.06, 0.043, SHIN, 7);
  const boot = new THREE.BoxGeometry(0.25, 0.075, 0.095);
  boot.translate(0.055, -0.04, 0);

  const number = new THREE.PlaneGeometry(0.2, 0.2);
  number.rotateY(-Math.PI / 2);
  number.translate(-0.128, TORSO * 0.6, 0);

  return { torsoGeo, shorts, headGeo, hair, upperArm, foreGeo, thigh, shin, boot, number };
}

function makeNumberAtlas() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let n = 1; n <= 32; n++) {
    const col = (n - 1) % 8, row = Math.floor((n - 1) / 8);
    ctx.font = `700 ${n > 9 ? 44 : 52}px "Barlow Condensed", "Arial Narrow", system-ui, sans-serif`;
    ctx.fillText(String(n), col * 64 + 32, row * 64 + 35);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export class Figures {
  constructor(maxPlayers = 22) {
    this.max = maxPlayers;
    const g = buildGeometries();
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const mk = (geo, count, name) => {
      const m = new THREE.InstancedMesh(geo, mat, count);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      m.name = name;
      return m;
    };
    this.torso = mk(g.torsoGeo, maxPlayers, 'torso');
    this.shorts = mk(g.shorts, maxPlayers, 'shorts');
    this.head = mk(g.headGeo, maxPlayers, 'head');
    this.hair = mk(g.hair, maxPlayers, 'hair');
    this.upperArm = mk(g.upperArm, maxPlayers * 2, 'upperArm');
    this.foreArm = mk(g.foreGeo, maxPlayers * 2, 'foreArm');
    this.thigh = mk(g.thigh, maxPlayers * 2, 'thigh');
    this.shin = mk(g.shin, maxPlayers * 2, 'shin');
    this.boot = mk(g.boot, maxPlayers * 2, 'boot');

    // Rückennummern: Atlas + Instanz-UV-Offset
    const numUv = new THREE.InstancedBufferAttribute(new Float32Array(maxPlayers * 2), 2);
    g.number.setAttribute('aNumUv', numUv);
    const numMat = new THREE.MeshLambertMaterial({ map: makeNumberAtlas(), alphaTest: 0.5, color: 0xffffff });
    numMat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec2 aNumUv;')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv = vMapUv * vec2(0.125, 0.25) + aNumUv;\n#endif');
    };
    this.numUv = numUv;
    this.number = mk(g.number, maxPlayers, 'number');
    this.number.material = numMat;

    this.meshes = [this.torso, this.shorts, this.head, this.hair, this.upperArm, this.foreArm, this.thigh, this.shin, this.boot, this.number];
    this.group = new THREE.Group();
    for (const m of this.meshes) this.group.add(m);

    // vorab angelegte Arbeitsobjekte – keine Allokationen pro Frame
    this.mBase = new THREE.Matrix4();
    this.mPelvis = new THREE.Matrix4();
    this.mTorso = new THREE.Matrix4();
    this.mA = new THREE.Matrix4();
    this.mB = new THREE.Matrix4();
    this.mL = new THREE.Matrix4();
    this.euler = new THREE.Euler(0, 0, 0, 'ZXY');
    this.hidden = new THREE.Matrix4().makeScale(0, 0, 0);
    this.visible = new Uint8Array(maxPlayers).fill(1);
    this.ballX = 0; this.ballY = 0;
  }

  // Farben, Nummern, Hauttöne einmal pro Szene setzen
  setup(w) {
    const c = new THREE.Color();
    for (let i = 0; i < w.n; i++) {
      const kit = w.gk[i] ? (w.team[i] === 0 ? COLORS.ownGk : COLORS.oppGk) : (w.team[i] === 0 ? COLORS.own : COLORS.opp);
      const skin = COLORS.skin[w.skin[i] % COLORS.skin.length];
      const hair = COLORS.hair[(i * 7 + w.skin[i]) % COLORS.hair.length];
      const boot = COLORS.boots[(i * 3) % COLORS.boots.length];
      this.torso.setColorAt(i, c.setHex(kit.shirt));
      this.shorts.setColorAt(i, c.setHex(kit.shorts));
      this.head.setColorAt(i, c.setHex(skin));
      this.hair.setColorAt(i, c.setHex(hair));
      this.number.setColorAt(i, c.setHex(kit.number));
      for (let s = 0; s < 2; s++) {
        const k = i * 2 + s;
        this.upperArm.setColorAt(k, c.setHex(kit.shirt));
        this.foreArm.setColorAt(k, c.setHex(skin));
        this.thigh.setColorAt(k, c.setHex(skin));
        this.shin.setColorAt(k, c.setHex(kit.socks));
        this.boot.setColorAt(k, c.setHex(boot));
      }
      const n = Math.max(1, Math.min(32, w.num[i]));
      this.numUv.setXY(i, ((n - 1) % 8) / 8, 1 - (Math.floor((n - 1) / 8) + 1) / 4);
    }
    for (const m of this.meshes) {
      m.count = (m === this.upperArm || m === this.foreArm || m === this.thigh || m === this.shin || m === this.boot) ? w.n * 2 : w.n;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    this.numUv.needsUpdate = true;
  }

  // Lokale Transformation: Translation + Rotation (Euler ZXY), rechts an parent multipliziert
  link(out, parent, tx, ty, tz, rz, rx, ry) {
    this.euler.set(rx, ry, rz, 'ZXY');
    this.mL.makeRotationFromEuler(this.euler);
    this.mL.setPosition(tx, ty, tz);
    out.multiplyMatrices(parent, this.mL);
    return out;
  }

  update(w, alpha, hideIndex) {
    const b = w.ball;
    this.ballX = lerp(b.px, b.x, alpha);
    this.ballY = lerp(b.py, b.y, alpha);
    for (let i = 0; i < w.n; i++) {
      if (i === hideIndex) { this.hide(i); continue; }
      this.pose(w, i, alpha);
    }
    for (const m of this.meshes) m.instanceMatrix.needsUpdate = true;
  }

  hide(i) {
    const h = this.hidden;
    this.torso.setMatrixAt(i, h); this.shorts.setMatrixAt(i, h); this.head.setMatrixAt(i, h);
    this.hair.setMatrixAt(i, h); this.number.setMatrixAt(i, h);
    for (let s = 0; s < 2; s++) {
      const k = i * 2 + s;
      this.upperArm.setMatrixAt(k, h); this.foreArm.setMatrixAt(k, h);
      this.thigh.setMatrixAt(k, h); this.shin.setMatrixAt(k, h); this.boot.setMatrixAt(k, h);
    }
  }

  pose(w, i, alpha) {
    const x = lerp(w.ppx[i], w.px[i], alpha);
    const y = lerp(w.ppy[i], w.py[i], alpha);
    const hd = lerpAngle(w.phd[i], w.hd[i], alpha);
    const gait = lerp(w.pgait[i], w.gait[i], alpha);
    const vx = w.vx[i], vy = w.vy[i];
    const speed = Math.sqrt(vx * vx + vy * vy);

    // Laufrichtung relativ zum Körper: vorwärts / seitlich / rückwärts
    const rel = speed > 0.2 ? angleDiff(hd, Math.atan2(vy, vx)) : 0;
    const fwd = Math.cos(rel);
    const moving = clamp(speed / 0.6, 0, 1);
    let amp = clamp(0.18 + 0.075 * speed, 0, 0.78) * moving * (0.45 + 0.55 * Math.abs(fwd));
    if (fwd < -0.3) amp = -amp; // rückwärts: Beine schwingen umgekehrt

    const sg = Math.sin(gait), cg = Math.cos(gait);
    let thighL = amp * sg, thighR = -amp * sg;
    const kneeK = (0.18 + 0.16 * speed) * moving;
    let kneeL = -Math.min(1.7, kneeK * Math.pow(0.5 + 0.5 * cg, 1.4)) - 0.08;
    let kneeR = -Math.min(1.7, kneeK * Math.pow(0.5 - 0.5 * cg, 1.4)) - 0.08;
    let armSwingL = -thighL * 0.85, armSwingR = -thighR * 0.85;
    const elbow = 0.35 + 0.12 * speed * moving;
    const bob = (0.008 + 0.005 * speed) * moving * (1 - Math.abs(cg));
    const lean = -0.018 * speed * Math.max(0, fwd);
    const side = Math.sin(rel) * moving;

    // Schuss / Tackling: rechtes Bein holt aus und schwingt durch
    const kt = lerpKick(w.pkickT[i], w.kickT[i], alpha);
    if (kt >= 0) {
      const p = kt / 0.45;
      const swing = p < 0.4 ? lerp(0, -0.75, p / 0.4) : p < 0.62 ? lerp(-0.75, 1.15, (p - 0.4) / 0.22) : lerp(1.15, 0.1, Math.min(1, (p - 0.62) / 0.38));
      const kneeKick = p < 0.4 ? lerp(-0.2, -1.25, p / 0.4) : p < 0.62 ? lerp(-1.25, -0.08, (p - 0.4) / 0.22) : -0.15;
      thighR = swing; kneeR = kneeKick;
      thighL = -0.05; kneeL = -0.25;
      armSwingL = 0.55; armSwingR = -0.35;
    }

    // Kopf schaut zum Ball (begrenzt)
    const toBall = Math.atan2(this.ballY - y, this.ballX - x);
    const headYaw = clamp(angleDiff(hd, toBall), -1.1, 1.1) * 0.85;

    const B = this.mBase;
    B.makeRotationY(hd);
    B.setPosition(x, bob, -y);
    this.link(this.mPelvis, B, 0, HIP_Y, 0, 0, side * -0.05, 0);
    this.link(this.mTorso, this.mPelvis, 0, 0, 0, lean, side * 0.04, 0);
    this.torso.setMatrixAt(i, this.mTorso);
    this.number.setMatrixAt(i, this.mTorso);
    this.link(this.mA, B, 0, bob * 0.3, 0, 0, 0, 0);
    this.shorts.setMatrixAt(i, this.mA);
    this.link(this.mA, this.mTorso, 0, TORSO - 0.02, 0, -lean * 0.6, 0, headYaw);
    this.head.setMatrixAt(i, this.mA);
    this.hair.setMatrixAt(i, this.mA);

    // Arme (links = -Z)
    for (let s = 0; s < 2; s++) {
      const zs = s === 0 ? -1 : 1;
      const k = i * 2 + s;
      const swing = s === 0 ? armSwingL : armSwingR;
      this.link(this.mA, this.mTorso, 0, TORSO - 0.06, zs * 0.225, swing, zs * -0.13, 0);
      this.upperArm.setMatrixAt(k, this.mA);
      this.link(this.mB, this.mA, 0, -UPPER_ARM + 0.01, 0, elbow, 0, 0);
      this.foreArm.setMatrixAt(k, this.mB);
    }
    // Beine
    for (let s = 0; s < 2; s++) {
      const zs = s === 0 ? -1 : 1;
      const k = i * 2 + s;
      const th = s === 0 ? thighL : thighR;
      const kn = s === 0 ? kneeL : kneeR;
      this.link(this.mA, this.mPelvis, 0, 0, zs * 0.095, th, zs * -0.03 * Math.abs(side), 0);
      this.thigh.setMatrixAt(k, this.mA);
      this.link(this.mB, this.mA, 0, -THIGH, 0, kn, 0, 0);
      this.shin.setMatrixAt(k, this.mB);
      this.link(this.mA, this.mB, 0, -SHIN, 0, -(th + kn) * 0.75, 0, 0);
      this.boot.setMatrixAt(k, this.mA);
    }
  }
}

function lerpKick(a, b, t) {
  if (b < 0) return a >= 0 ? a : -1;
  if (a < 0) return b * t;
  return lerp(a, b, t);
}
