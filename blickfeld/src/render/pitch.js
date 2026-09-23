// Spielfeld, Linien, Tore, Banden, Tribünen, Himmel.
// Maßstabsgetreu nach Regelwerk. Sim-Koordinaten (x, y) → Three (x, h, -y).

import * as THREE from 'three';
import { PITCH } from '../config.js';
import { mulberry32 } from '../core/rng.js';
import { mergeGeometries } from './geo.js';

const HALF_L = PITCH.length / 2;
const HALF_W = PITCH.width / 2;
const RUNOFF_SIDE = 6;
const RUNOFF_END = 7;

export const HAZE = new THREE.Color(0xc9d3d6);

// ---------- Rasen ----------

function makeNoiseTexture(size, seed, octaves) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const rng = mulberry32(seed);
  // tileable Value-Noise über mehrere Oktaven
  const acc = new Float32Array(size * size);
  let amp = 1, total = 0;
  for (let o = 0; o < octaves; o++) {
    const cells = 4 << o;
    const grid = new Float32Array(cells * cells);
    for (let i = 0; i < grid.length; i++) grid[i] = rng();
    for (let y = 0; y < size; y++) {
      const gy = (y / size) * cells, y0 = Math.floor(gy), fy = gy - y0;
      const sy = fy * fy * (3 - 2 * fy);
      for (let x = 0; x < size; x++) {
        const gx = (x / size) * cells, x0 = Math.floor(gx), fx = gx - x0;
        const sx = fx * fx * (3 - 2 * fx);
        const a = grid[(y0 % cells) * cells + (x0 % cells)];
        const b = grid[(y0 % cells) * cells + ((x0 + 1) % cells)];
        const c2 = grid[((y0 + 1) % cells) * cells + (x0 % cells)];
        const d = grid[((y0 + 1) % cells) * cells + ((x0 + 1) % cells)];
        acc[y * size + x] += amp * (a + (b - a) * sx + (c2 - a) * sy + (a - b - c2 + d) * sx * sy);
      }
    }
    total += amp;
    amp *= 0.55;
  }
  for (let i = 0; i < acc.length; i++) {
    const v = Math.round((acc[i] / total) * 255);
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

function makeGrass(renderer) {
  const w = PITCH.length + 2 * RUNOFF_END;
  const h = PITCH.width + 2 * RUNOFF_SIDE;
  const geo = new THREE.PlaneGeometry(w, h, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mottle = makeNoiseTexture(256, 7, 4);
  const grain = makeNoiseTexture(128, 11, 3);
  const aniso = renderer.capabilities.getMaxAnisotropy();
  mottle.anisotropy = Math.min(8, aniso);
  grain.anisotropy = Math.min(16, aniso);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uMottle: { value: mottle },
      uGrain: { value: grain },
      uBase: { value: new THREE.Color(0x4f7a37) },
      uDark: { value: new THREE.Color(0x3f6a2d) },
      uOut: { value: new THREE.Color(0x4a7033) },
      uHaze: { value: HAZE },
      uHalf: { value: new THREE.Vector2(HALF_L, HALF_W) },
      uStripe: { value: PITCH.stripeWidth },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMottle;
      uniform sampler2D uGrain;
      uniform vec3 uBase;
      uniform vec3 uDark;
      uniform vec3 uOut;
      uniform vec3 uHaze;
      uniform vec2 uHalf;
      uniform float uStripe;
      varying vec3 vWorld;
      void main() {
        vec2 p = vWorld.xz;
        vec3 toCam = vWorld - cameraPosition;
        float dist = length(toCam);
        vec2 view = normalize(toCam.xz);
        // gemähte Streifen quer zur Längsachse; Helligkeit hängt von der Blickrichtung ab
        float s = floor((p.x + uHalf.x) / uStripe);
        float sgn = mod(s, 2.0) < 0.5 ? 1.0 : -1.0;
        float fw = fwidth(p.x / uStripe) * 1.5;
        float edge = smoothstep(0.0, fw, fract((p.x + uHalf.x) / uStripe)) * smoothstep(0.0, fw, 1.0 - fract((p.x + uHalf.x) / uStripe));
        float inside = step(abs(p.x), uHalf.x + 0.1) * step(abs(p.y), uHalf.y + 0.1);
        float stripe = sgn * (0.035 + 0.075 * view.x) * mix(1.0, edge, 0.3) * inside;
        vec3 col = mix(uOut, mix(uDark, uBase, 0.6), inside);
        float m = texture2D(uMottle, p / 38.0).r;
        float m2 = texture2D(uMottle, p / 9.0 + 0.37).r;
        float g = texture2D(uGrain, p / 1.7).r;
        float g2 = texture2D(uGrain, p / 0.37 + 0.21).r;
        float near = smoothstep(16.0, 3.0, dist);
        col *= 1.0 + stripe;
        col *= 0.86 + 0.22 * m + 0.08 * (m2 - 0.5);
        col *= 0.93 + 0.14 * g;
        col *= 1.0 + near * 0.16 * (g2 - 0.5);
        // leichte Luftperspektive
        float haze = smoothstep(35.0, 320.0, dist) * 0.45;
        col = mix(col, uHaze, haze);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'grass';
  return mesh;
}

// ---------- Linien ----------

function addQuad(pos, x1, y1, x2, y2, w) {
  // Streifen von (x1,y1) nach (x2,y2) mit Breite w, Sim-Koordinaten
  const dx = x2 - x1, dy = y2 - y1;
  const l = Math.hypot(dx, dy) || 1;
  const nx = (-dy / l) * (w / 2), ny = (dx / l) * (w / 2);
  const h = 0.005;
  const a = [x1 + nx, h, -(y1 + ny)], b = [x1 - nx, h, -(y1 - ny)];
  const c = [x2 - nx, h, -(y2 - ny)], d = [x2 + nx, h, -(y2 + ny)];
  pos.push(...a, ...b, ...c, ...a, ...c, ...d);
}

function addArc(pos, cx, cy, r, a0, a1, w, seg) {
  const n = seg || Math.max(8, Math.ceil(Math.abs(a1 - a0) * r * 1.2));
  for (let i = 0; i < n; i++) {
    const t0 = a0 + ((a1 - a0) * i) / n, t1 = a0 + ((a1 - a0) * (i + 1)) / n;
    const ri = r - w / 2, ro = r + w / 2, h = 0.005;
    const p = (rr, t) => [cx + Math.cos(t) * rr, h, -(cy + Math.sin(t) * rr)];
    const A = p(ri, t0), B = p(ro, t0), C = p(ro, t1), D = p(ri, t1);
    pos.push(...A, ...B, ...C, ...A, ...C, ...D);
  }
}

function addDisc(pos, cx, cy, r) {
  const n = 12, h = 0.005;
  for (let i = 0; i < n; i++) {
    const t0 = (i / n) * Math.PI * 2, t1 = ((i + 1) / n) * Math.PI * 2;
    pos.push(cx, h, -cy, cx + Math.cos(t0) * r, h, -(cy + Math.sin(t0) * r), cx + Math.cos(t1) * r, h, -(cy + Math.sin(t1) * r));
  }
}

function makeLines() {
  const P = PITCH, w = P.lineWidth, pos = [];
  const hw = w / 2;
  // Außenlinien (Linie gehört zum Feld: nach innen versetzt)
  addQuad(pos, -HALF_L, HALF_W - hw, HALF_L, HALF_W - hw, w);
  addQuad(pos, -HALF_L, -HALF_W + hw, HALF_L, -HALF_W + hw, w);
  addQuad(pos, -HALF_L + hw, -HALF_W, -HALF_L + hw, HALF_W, w);
  addQuad(pos, HALF_L - hw, -HALF_W, HALF_L - hw, HALF_W, w);
  // Mittellinie, Mittelkreis, Anstoßpunkt
  addQuad(pos, 0, -HALF_W, 0, HALF_W, w);
  addArc(pos, 0, 0, P.centerCircle, 0, Math.PI * 2, w, 96);
  addDisc(pos, 0, 0, 0.15);
  for (const side of [-1, 1]) {
    const gx = side * HALF_L;
    const inX = -side;
    // Strafraum
    const pd = P.penaltyDepth, pw = P.penaltyWidth / 2;
    addQuad(pos, gx, pw, gx + inX * pd, pw, w);
    addQuad(pos, gx, -pw, gx + inX * pd, -pw, w);
    addQuad(pos, gx + inX * pd, -pw, gx + inX * pd, pw, w);
    // Torraum
    const gd = P.goalAreaDepth, gw = P.goalAreaWidth / 2;
    addQuad(pos, gx, gw, gx + inX * gd, gw, w);
    addQuad(pos, gx, -gw, gx + inX * gd, -gw, w);
    addQuad(pos, gx + inX * gd, -gw, gx + inX * gd, gw, w);
    // Elfmeterpunkt und Teilkreis außerhalb des Strafraums
    const sx = gx + inX * P.penaltySpot;
    addDisc(pos, sx, 0, 0.11);
    const cutoff = Math.acos((P.penaltyDepth - P.penaltySpot) / P.centerCircle);
    if (side === 1) addArc(pos, sx, 0, P.centerCircle, Math.PI - cutoff, Math.PI + cutoff, w, 32);
    else addArc(pos, sx, 0, P.centerCircle, -cutoff, cutoff, w, 32);
    // Eckviertelkreise
    for (const sy of [-1, 1]) {
      const cy = sy * HALF_W;
      const startA = sy === 1 ? (side === 1 ? Math.PI : 1.5 * Math.PI) : (side === 1 ? Math.PI / 2 : 0);
      addArc(pos, gx, cy, P.cornerArc, startA, startA + Math.PI / 2, w, 10);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const mat = new THREE.MeshBasicMaterial({
    color: 0xeef0ea, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, fog: true, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'lines';
  return mesh;
}

// ---------- Tore ----------

function makeGoals() {
  const P = PITCH, r = 0.06, gw = P.goalWidth / 2, gh = P.goalHeight;
  const parts = [];
  const netParts = [];
  for (const side of [-1, 1]) {
    const gx = side * (HALF_L + r);
    for (const sy of [-1, 1]) {
      const post = new THREE.CylinderGeometry(r, r, gh + r, 10);
      post.translate(gx, (gh + r) / 2, -sy * (gw + r));
      parts.push(post);
    }
    const bar = new THREE.CylinderGeometry(r, r, 2 * (gw + r), 10);
    bar.rotateX(Math.PI / 2);
    bar.translate(gx, gh + r / 2, 0);
    parts.push(bar);
    // Netz: Rückwand schräg, Seiten, Dach
    const depthTop = 0.9, depthBottom = 2.0, out = side;
    const x0 = gx, xt = gx + out * depthTop, xb = gx + out * depthBottom;
    const quad = (a, b, c, d) => {
      const g = new THREE.BufferGeometry();
      const v = new Float32Array([...a, ...b, ...c, ...a, ...c, ...d]);
      g.setAttribute('position', new THREE.BufferAttribute(v, 3));
      // UV in Metern, damit die Maschen gleich groß sind
      const len = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
      const U = len(a, b), V = len(b, c);
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, U, 0, U, V, 0, 0, U, V, 0, V]), 2));
      netParts.push(g);
    };
    quad([xt, gh, -gw], [xt, gh, gw], [xb, 0, gw], [xb, 0, -gw]);           // Rückwand
    quad([x0, gh, -gw], [x0, gh, gw], [xt, gh, gw], [xt, gh, -gw]);         // Dach
    for (const sy of [-1, 1]) quad([x0, 0, sy * gw], [x0, gh, sy * gw], [xt, gh, sy * gw], [xb, 0, sy * gw]); // Seiten
    // hintere Netzstangen
    const back = new THREE.CylinderGeometry(0.03, 0.03, Math.hypot(depthBottom - depthTop, gh), 6);
    const ang = Math.atan2(depthBottom - depthTop, gh);
    for (const sy of [-1, 1]) {
      const g = back.clone();
      g.rotateZ(-out * ang);
      g.translate((xt + xb) / 2, gh / 2, sy * gw);
      parts.push(g);
    }
  }
  const frame = new THREE.Mesh(mergeGeometries(parts, false), new THREE.MeshLambertMaterial({ color: 0xf4f4f2 }));
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(64, 64); ctx.moveTo(64, 0); ctx.lineTo(0, 64);
  ctx.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1 / 0.14, 1 / 0.14);
  tex.colorSpace = THREE.SRGBColorSpace;
  const net = new THREE.Mesh(mergeGeometries(netParts, true), new THREE.MeshBasicMaterial({
    map: tex, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide, color: 0xe8eae6,
  }));
  net.renderOrder = 2;
  const g = new THREE.Group();
  g.add(frame, net);
  return g;
}

// ---------- Umgebung: Banden, Tribünen, Himmel ----------

function makeCrowdTexture() {
  // 1024 px = 20 m Tribünenlänge, 40 Reihen auf der Schräge. Gedämpfte Farben,
  // damit das Publikum aus der Distanz als ruhige Fläche wirkt und nicht als Rauschen.
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 512;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#2a2f31';
  ctx.fillRect(0, 0, c.width, c.height);
  const rng = mulberry32(3);
  const palette = ['#3a4044', '#474c4f', '#565955', '#33405a', '#6d685e', '#4a3d35', '#5e5049', '#8c8a82', '#2e3650', '#6e5f4d', '#7a3b36', '#3c4a3e'];
  const skins = ['#a57c62', '#7d5a45', '#c49a7c', '#5a3f30'];
  const rows = 40, rowH = c.height / rows;
  for (let r = 0; r < rows; r++) {
    const y0 = r * rowH;
    ctx.fillStyle = r % 2 ? '#23282a' : '#282d2f';
    ctx.fillRect(0, y0 + rowH * 0.78, c.width, rowH * 0.22);
    let x = rng() * 10;
    while (x < c.width) {
      const w = 16 + rng() * 10;
      if (rng() < 0.86) {
        ctx.fillStyle = palette[Math.floor(rng() * palette.length)];
        ctx.fillRect(x, y0 + rowH * 0.34, w, rowH * 0.46);
        ctx.fillStyle = skins[Math.floor(rng() * skins.length)];
        ctx.fillRect(x + w * 0.28, y0 + rowH * 0.08, w * 0.44, rowH * 0.28);
      }
      x += w + 3 + rng() * 6;
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeStands(renderer) {
  const tex = makeCrowdTexture();
  tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const standGeos = [];
  const wallGeos = [];
  const roofGeos = [];
  const sides = [
    { len: PITCH.length + 2 * RUNOFF_END + 30, dist: HALF_W + RUNOFF_SIDE + 4, rot: 0 },
    { len: PITCH.length + 2 * RUNOFF_END + 30, dist: HALF_W + RUNOFF_SIDE + 4, rot: Math.PI },
    { len: PITCH.width + 2 * RUNOFF_SIDE + 30, dist: HALF_L + RUNOFF_END + 4, rot: Math.PI / 2 },
    { len: PITCH.width + 2 * RUNOFF_SIDE + 30, dist: HALF_L + RUNOFF_END + 4, rot: -Math.PI / 2 },
  ];
  const depth = 30, rise = 14, front = 1.6;
  for (const s of sides) {
    // Tribüne: schräge Fläche, Blick zur Mitte
    const g = new THREE.PlaneGeometry(s.len, Math.hypot(depth, rise), 1, 1);
    g.rotateX(-Math.PI / 2 + Math.atan2(rise, depth));
    g.translate(0, front + rise / 2, -(s.dist + depth / 2));
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (s.len / 20), uv.getY(i));
    g.rotateY(s.rot);
    standGeos.push(g);
    // Stirnwand unter der ersten Reihe
    const wall = new THREE.PlaneGeometry(s.len, front, 1, 1);
    wall.translate(0, front / 2, -s.dist);
    wall.rotateY(s.rot);
    wallGeos.push(wall);
    // schmale Dachkante über der obersten Reihe
    const roof = new THREE.BoxGeometry(s.len, 0.35, 5);
    roof.translate(0, front + rise + 4.5, -(s.dist + depth - 1));
    roof.rotateY(s.rot);
    roofGeos.push(roof);
  }
  const group = new THREE.Group();
  group.add(new THREE.Mesh(mergeGeometries(standGeos, true), new THREE.MeshBasicMaterial({ map: tex, color: 0xc4c8c4, fog: true })));
  group.add(new THREE.Mesh(mergeGeometries(wallGeos, false), new THREE.MeshBasicMaterial({ color: 0x2b3134, fog: true })));
  group.add(new THREE.Mesh(mergeGeometries(roofGeos, false), new THREE.MeshLambertMaterial({ color: 0x5d6468 })));
  return group;
}

function makeBoards() {
  const geos = [];
  const h = 0.9, t = 0.08;
  const bx = HALF_L + RUNOFF_END - 1.5, by = HALF_W + RUNOFF_SIDE - 1;
  const panel = 6;
  const addRun = (x1, y1, x2, y2) => {
    const len = Math.hypot(x2 - x1, y2 - y1);
    const n = Math.max(1, Math.round(len / panel));
    for (let i = 0; i < n; i++) {
      const a = i / n, b = (i + 1) / n;
      const cx = x1 + (x2 - x1) * (a + b) / 2, cy = y1 + (y2 - y1) * (a + b) / 2;
      const g = new THREE.BoxGeometry(len / n - 0.05, h, t);
      g.rotateY(Math.atan2(y2 - y1, x2 - x1) * -1 + 0);
      // Sim → Three: Rotation um -Winkel, da y gespiegelt
      g.translate(cx, h / 2, -cy);
      const col = new THREE.Color(i % 3 === 0 ? 0x2f4a5c : i % 3 === 1 ? 0x3c4e44 : 0x4d4f57);
      const cols = new Float32Array(g.attributes.position.count * 3);
      for (let k = 0; k < cols.length; k += 3) { cols[k] = col.r; cols[k + 1] = col.g; cols[k + 2] = col.b; }
      g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      geos.push(g);
    }
  };
  addRun(-bx, by, bx, by);
  addRun(-bx, -by, bx, -by);
  addRun(bx, -by + 4, bx, by - 4);
  addRun(-bx, -by + 4, -bx, by - 4);
  return new THREE.Mesh(mergeGeometries(geos, false), new THREE.MeshLambertMaterial({ vertexColors: true }));
}

function makeSurround() {
  // Laufbahn/Beton zwischen Bande und Tribüne
  const g = new THREE.PlaneGeometry(PITCH.length + 2 * RUNOFF_END + 60, PITCH.width + 2 * RUNOFF_SIDE + 60);
  g.rotateX(-Math.PI / 2);
  g.translate(0, -0.02, 0);
  return new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0x3a3f3c, fog: true }));
}

function makeSky() {
  const geo = new THREE.SphereGeometry(600, 24, 12);
  const top = new THREE.Color(0x86a9c6), mid = new THREE.Color(0xc2d2dd), low = new THREE.Color(0xd9dfe0);
  const cols = new Float32Array(geo.attributes.position.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < geo.attributes.position.count; i++) {
    const y = geo.attributes.position.getY(i) / 600;
    if (y > 0.15) c.copy(mid).lerp(top, Math.min(1, (y - 0.15) / 0.7));
    else c.copy(low).lerp(mid, Math.max(0, y / 0.15));
    cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false });
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = -1;
  return m;
}

export function buildPitch(renderer) {
  const group = new THREE.Group();
  const grass = makeGrass(renderer);
  group.add(makeSky(), makeSurround(), grass, makeLines(), makeGoals(), makeBoards(), makeStands(renderer));
  return group;
}
