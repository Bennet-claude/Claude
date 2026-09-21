
/* ===================== M2 — Möbel ===================== */
const M = {
  gloss:  new THREE.MeshStandardMaterial({ color: '#f7f6f3', roughness: 0.16, metalness: 0.02 }),
  white:  new THREE.MeshStandardMaterial({ color: '#eeece7', roughness: 0.5 }),
  bright: new THREE.MeshStandardMaterial({ color: '#f4f2ee', roughness: 0.42 }),
  wood:   new THREE.MeshStandardMaterial({ color: '#e6e0d3', roughness: 0.62 }),
  ledge:  new THREE.MeshStandardMaterial({ color: '#c6a87e', roughness: 0.55 }),
  fabric: new THREE.MeshStandardMaterial({ color: '#3b3e43', roughness: 0.95 }),
  mesh:   new THREE.MeshStandardMaterial({ color: '#2b2e33', roughness: 0.85 }),
  duvet:  new THREE.MeshStandardMaterial({ color: '#5d6166', roughness: 0.96 }),
  duvet2: new THREE.MeshStandardMaterial({ color: '#33363a', roughness: 0.96 }),
  pillow: new THREE.MeshStandardMaterial({ color: '#2a2c30', roughness: 0.95 }),
  red:    new THREE.MeshStandardMaterial({ color: '#9e2b2f', roughness: 0.85 }),
  black:  new THREE.MeshStandardMaterial({ color: '#17191c', roughness: 0.38 }),
  screen: new THREE.MeshStandardMaterial({ color: '#0b0d0f', roughness: 0.14, metalness: 0.25 }),
  box:    new THREE.MeshStandardMaterial({ color: '#25272a', roughness: 0.96 }),
  rug:    new THREE.MeshStandardMaterial({ color: '#c6c4bf', roughness: 1.0 }),
  metal:  new THREE.MeshStandardMaterial({ color: '#8d9298', metalness: 0.7, roughness: 0.35 }),
  plastic:new THREE.MeshStandardMaterial({ color: '#2a2d31', roughness: 0.6 }),
  paper:  new THREE.MeshStandardMaterial({ color: '#d9d4c8', roughness: 0.9 }),
};

function put(geo, mat, x, y, z, ry = 0, shadow = true) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.y = ry;
  m.castShadow = shadow; m.receiveShadow = true;
  scene.add(m);
  return m;
}
const B_ = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const CY = (r, h, s = 20) => new THREE.CylinderGeometry(r, r, h, s);

/* --- Bilder an den Wänden: echte Ausschnitte aus den Referenzfotos --- */
const texLoader = new THREE.TextureLoader();
function picture(key, w, h, x, y, z, ry, frame = 0.018) {
  const tex = texLoader.load(ART[key], () => requestRender());
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const g = new THREE.Group();
  const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.72 }));
  face.position.z = frame / 2 + 0.001;
  const body = new THREE.Mesh(B_(w, h, frame), new THREE.MeshStandardMaterial({ color: '#1a1c1e', roughness: 0.8 }));
  body.castShadow = true;
  g.add(body, face);
  g.position.set(x, y, z); g.rotation.y = ry;
  scene.add(g);
  return g;
}

/* --- Bett: Tagesbett mit 3 Schubladen, Rückenlehne, Ablage oben --- */
function bett() {
  const zA = 0.06, len = 2.05, dep = 1.02, x0 = W - dep;
  const cz = zA + len / 2, cx = x0 + dep / 2;
  const baseH = 0.30, mattY = 0.50, backH = 0.86;

  put(B_(dep, baseH, len), M.wood, cx, baseH / 2, cz);                    // Sockel mit Schubladen
  for (let i = 0; i < 3; i++) {
    const sz = zA + 0.06 + (len - 0.12) * (i + 0.5) / 3;
    put(B_(0.02, baseH - 0.07, (len - 0.14) / 3 - 0.02), M.bright, x0 - 0.011, baseH / 2, sz);
    const k = new THREE.Mesh(new THREE.SphereGeometry(0.016, 12, 10), M.black);
    k.position.set(x0 - 0.026, baseH / 2, sz); scene.add(k);
  }
  put(B_(dep - 0.08, 0.14, len - 0.08), M.paper, cx, baseH + 0.07, cz);   // Matratze
  put(B_(0.07, backH, len), M.wood, W - 0.035, backH / 2, cz);            // Rückenwange
  put(B_(dep, backH, 0.06), M.wood, cx, backH / 2, zA + 0.03);            // Kopf- und Fußteil
  put(B_(dep, backH, 0.06), M.wood, cx, backH / 2, zA + len - 0.03);
  put(B_(0.11, 0.035, len + 0.04), M.ledge, W - 0.055, backH + 0.02, cz); // Holzablage oben
  put(B_(0.10, 0.34, len - 0.30), M.red, W - 0.115, 0.68, cz);            // rotes Rückenpolster

  // Bettzeug
  put(B_(dep - 0.14, 0.12, len - 0.55), M.duvet, cx - 0.02, mattY + 0.06, cz + 0.16);
  put(B_(dep - 0.20, 0.07, 0.42), M.duvet2, cx - 0.03, mattY + 0.15, cz + 0.30);
  put(B_(dep - 0.26, 0.09, 0.30), M.duvet2, cx - 0.04, mattY + 0.12, cz - 0.42);
  for (const [dz, dx] of [[-0.02, -0.10], [0.28, -0.08]]) {
    put(B_(0.42, 0.13, 0.40), M.pillow, cx + dx, mattY + 0.14, cz + dz - 0.55);
  }
  // Wasserflaschen auf der Ablage
  for (const dz of [-0.42, -0.24, 0.30, 0.48]) {
    put(CY(0.035, 0.24, 12), new THREE.MeshPhysicalMaterial({ color: '#dfe8ea', roughness: 0.15, transparent: true, opacity: 0.45 }), W - 0.055, backH + 0.155, cz + dz, 0, false);
  }
}

/* --- Sofa: dunkelgrauer 2-Sitzer --- */
function sofa() {
  const len = 1.45, dep = 0.85, x0 = W - dep, z0 = 2.25;
  const cx = x0 + dep / 2, cz = z0 + len / 2;
  put(B_(dep, 0.30, len), M.fabric, cx, 0.19, cz);
  put(B_(0.20, 0.50, len), M.fabric, W - 0.10, 0.44, cz);
  for (const s of [-1, 1]) put(B_(dep - 0.18, 0.28, 0.18), M.fabric, cx - 0.06, 0.48, cz + s * (len / 2 - 0.09));
  for (const s of [-1, 1]) put(B_(dep - 0.28, 0.16, len / 2 - 0.14), M.fabric, cx - 0.10, 0.42, cz + s * len / 4);
  for (const s of [-1, 1]) for (const q of [-1, 1])
    put(B_(0.05, 0.10, 0.05), M.plastic, cx + s * (dep / 2 - 0.08), 0.05, cz + q * (len / 2 - 0.08), 0, false);
  put(B_(0.30, 0.10, 0.34), M.pillow, cx - 0.10, 0.39, cz - 0.22);
}

/* --- Runder Beistelltisch --- */
function beistelltisch() {
  const x = 2.30, z = 3.92;
  put(new THREE.CylinderGeometry(0.225, 0.225, 0.035, 28), M.black, x, 0.52, z);
  put(new THREE.TorusGeometry(0.225, 0.012, 8, 28), M.black, x, 0.545, z).rotation.x = Math.PI / 2;
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + Math.PI / 4;
    const leg = put(CY(0.008, 0.52, 8), M.black, x + Math.cos(a) * 0.17, 0.26, z + Math.sin(a) * 0.17);
    leg.rotation.set(Math.sin(a) * 0.08, 0, -Math.cos(a) * 0.08);
  }
}

/* --- Kallax-Regale --- */
function kallax(x, z, cols, rows, ry, boxesFrom) {
  const u = 0.33, t = 0.038, dep = 0.39;
  const w = cols * u + (cols + 1) * t, h = rows * u + (rows + 1) * t;
  const g = new THREE.Group();
  const add = (geo, mat, px, py, pz) => { const m = new THREE.Mesh(geo, mat); m.position.set(px, py, pz); m.castShadow = m.receiveShadow = true; g.add(m); };
  add(B_(w, h, t), M.white, 0, 0, -dep / 2 + t / 2);
  for (let i = 0; i <= cols; i++) add(B_(t, h, dep), M.white, -w / 2 + t / 2 + i * (u + t), 0, 0);
  for (let j = 0; j <= rows; j++) add(B_(w, t, dep), M.white, 0, -h / 2 + t / 2 + j * (u + t), 0);
  let idx = 0;
  for (let j = rows - 1; j >= 0; j--) for (let i = 0; i < cols; i++) {
    const cxp = -w / 2 + t + i * (u + t) + u / 2, cyp = -h / 2 + t + j * (u + t) + u / 2;
    if (idx >= boxesFrom) add(B_(u - 0.02, u - 0.02, dep - 0.05), M.box, cxp, cyp, 0.01);
    else { // Bücher
      let off = -u / 2 + 0.03;
      while (off < u / 2 - 0.05) {
        const bw = 0.018 + Math.random() * 0.022, bh = u * (0.62 + Math.random() * 0.3);
        add(B_(bw, bh, 0.17 + Math.random() * 0.06),
            new THREE.MeshStandardMaterial({ color: ['#2d4a6b', '#6b3030', '#2f5240', '#c9b48a', '#38393d', '#8a4a20'][Math.floor(Math.random() * 6)], roughness: 0.85 }),
            cxp + off + bw / 2, cyp - u / 2 + bh / 2 + 0.02, 0.06);
        off += bw + 0.002;
      }
    }
    idx++;
  }
  g.position.set(x, h / 2, z); g.rotation.y = ry;
  scene.add(g);
  return { w, h, dep };
}

/* --- Kommode mit zwei Schubladen --- */
function kommode(x, z, w, d, h, ry) {
  const g = new THREE.Group();
  const add = (geo, mat, px, py, pz) => { const m = new THREE.Mesh(geo, mat); m.position.set(px, py, pz); m.castShadow = m.receiveShadow = true; g.add(m); };
  add(B_(w, h, d), M.white, 0, 0, 0);
  for (const s of [-1, 1]) {
    add(B_(w - 0.03, h / 2 - 0.02, 0.02), M.bright, 0, s * h / 4, d / 2 + 0.011);
    const k = new THREE.Mesh(new THREE.SphereGeometry(0.017, 12, 10), M.black);
    k.position.set(0, s * h / 4, d / 2 + 0.032); g.add(k);
  }
  g.position.set(x, h / 2, z); g.rotation.y = ry;
  scene.add(g);
}

/* --- Schreibtisch mit leicht geneigter Platte --- */
function schreibtisch() {
  const z0 = 2.80, len = 1.25, dep = 0.70, h = 0.75;
  const cz = z0 + len / 2, cx = dep / 2;
  const top = put(B_(dep, 0.026, len), M.bright, cx, h, cz);
  top.rotation.z = -0.055;
  put(B_(0.05, 0.05, len + 0.02), M.plastic, dep - 0.015, h - 0.03, cz);   // vordere Kante
  for (const s of [-1, 1]) {
    put(B_(0.05, h - 0.06, 0.05), M.metal, cx, (h - 0.06) / 2 + 0.03, cz + s * (len / 2 - 0.09));
    put(B_(dep - 0.12, 0.035, 0.07), M.metal, cx, 0.035, cz + s * (len / 2 - 0.09));
  }
  put(B_(dep - 0.16, 0.004, len - 0.34), M.black, cx - 0.02, h + 0.035, cz + 0.02, 0, false); // Schreibunterlage
  // Monitor
  put(B_(0.06, 0.012, 0.22), M.black, 0.16, h + 0.05, cz + 0.16);
  put(CY(0.017, 0.11, 10), M.black, 0.16, h + 0.11, cz + 0.16);
  const scr = put(B_(0.022, 0.355, 0.615), M.screen, 0.155, h + 0.30, cz + 0.16);
  scr.rotation.z = 0.02;
  // Tastatur, Stiftebecher, Notizbuch, Flasche
  put(B_(0.13, 0.016, 0.36), M.bright, cx + 0.03, h + 0.047, cz + 0.12, 0, false);
  put(CY(0.036, 0.10, 12), M.black, 0.20, h + 0.09, cz - 0.30);
  put(B_(0.15, 0.018, 0.21), new THREE.MeshStandardMaterial({ color: '#27509a', roughness: 0.7 }), cx + 0.10, h + 0.05, cz - 0.46, 0, false);
  put(CY(0.039, 0.27, 14), new THREE.MeshPhysicalMaterial({ color: '#dfe8ea', roughness: 0.15, transparent: true, opacity: 0.45 }), 0.30, h + 0.17, cz - 0.52);
  // PS5 senkrecht neben dem Tisch
  put(B_(0.10, 0.39, 0.26), M.bright, 0.60, 0.195, 3.95);
  put(B_(0.036, 0.40, 0.27), M.black, 0.60, 0.20, 3.95);
  // Papierkorb
  put(new THREE.CylinderGeometry(0.115, 0.095, 0.27, 16), M.bright, 0.30, 0.135, cz + 0.30);
}

/* --- Bürostuhl --- */
function stuhl(x, z, ry) {
  const g = new THREE.Group();
  const add = (geo, mat, px, py, pz, rx = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(px, py, pz); m.rotation.x = rx; m.castShadow = m.receiveShadow = true; g.add(m); };
  for (let i = 0; i < 5; i++) {
    const a = i * Math.PI * 2 / 5;
    const arm = new THREE.Mesh(B_(0.30, 0.028, 0.05), M.plastic);
    arm.position.set(Math.cos(a) * 0.15, 0.055, Math.sin(a) * 0.15);
    arm.rotation.y = -a; arm.castShadow = true; g.add(arm);
    const c = new THREE.Mesh(CY(0.026, 0.03, 10), M.plastic);
    c.rotation.z = Math.PI / 2;
    c.position.set(Math.cos(a) * 0.29, 0.028, Math.sin(a) * 0.29); g.add(c);
  }
  add(CY(0.032, 0.26, 12), M.metal, 0, 0.20, 0);
  add(B_(0.46, 0.085, 0.44), M.mesh, 0, 0.40, 0);
  add(B_(0.44, 0.52, 0.07), M.mesh, 0, 0.70, -0.20, -0.12);
  add(B_(0.30, 0.16, 0.06), M.mesh, 0, 1.00, -0.255, -0.2);
  for (const s of [-1, 1]) {
    add(B_(0.07, 0.03, 0.30), M.plastic, s * 0.26, 0.60, -0.02);
    add(B_(0.04, 0.18, 0.04), M.plastic, s * 0.26, 0.50, -0.14);
  }
  g.position.set(x, 0, z); g.rotation.y = ry;
  scene.add(g);
}

/* --- Wandfernseher --- */
function tv(x, y, z, w, ry) {
  const h = w * 0.575;
  const g = new THREE.Group();
  const panel = new THREE.Mesh(B_(w, h, 0.048), M.black); panel.castShadow = true; g.add(panel);
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.02, h - 0.02), M.screen); scr.position.z = 0.025; g.add(scr);
  const arm = new THREE.Mesh(B_(0.22, 0.22, 0.05), M.plastic); arm.position.z = -0.045; g.add(arm);
  g.position.set(x, y, z); g.rotation.y = ry;
  scene.add(g);
  // Kabelkanal nach unten
  put(B_(0.012, y - h / 2 - 0.80, 0.028), M.bright, 0.012, (y - h / 2 + 0.80) / 2, z + 0.34, 0, false);
}

/* --- Ballhalter mit Fußball --- */
function ball(x, y, z, ry, col) {
  const g = new THREE.Group();
  const b = new THREE.Mesh(new THREE.SphereGeometry(0.11, 24, 18), new THREE.MeshStandardMaterial({ color: col, roughness: 0.55 }));
  b.castShadow = true; b.position.z = 0.13; g.add(b);
  for (let i = 0; i < 5; i++) {
    const a = i * Math.PI * 2 / 5;
    const f = new THREE.Mesh(B_(0.035, 0.10, 0.09), M.bright);
    f.position.set(Math.cos(a) * 0.09, Math.sin(a) * 0.09, 0.055);
    f.rotation.z = a; g.add(f);
  }
  g.position.set(x, y, z); g.rotation.y = ry; scene.add(g);
}

/* --- Turmventilator --- */
function ventilator(x, z) {
  put(new THREE.CylinderGeometry(0.17, 0.19, 0.045, 20), M.metal, x, 0.022, z);
  put(new THREE.CylinderGeometry(0.115, 0.135, 0.92, 20), M.bright, x, 0.50, z);
  put(new THREE.CylinderGeometry(0.115, 0.115, 0.60, 20, 1, true), M.plastic, x, 0.42, z);
  put(new THREE.SphereGeometry(0.115, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), M.metal, x, 0.96, z);
}

/* ===== Aufstellung ===== */
bett();
sofa();
beistelltisch();
schreibtisch();
stuhl(0.95, 3.38, -1.15);

// Wand B: TV-Bank, Kommode, Fernseher
const bank = kallax(0.195, 1.83, 2, 2, Math.PI / 2, 0);
kommode(0.24, 1.00, 0.80, 0.48, 0.55, Math.PI / 2);
tv(0.075, 1.52, 1.90, 0.97, Math.PI / 2);
// Deko auf der TV-Bank
put(B_(0.17, 0.09, 0.22), M.plastic, 0.20, bank.h + 0.045, 1.60);
put(B_(0.06, 0.11, 0.17), M.bright, 0.22, bank.h + 0.055, 1.95);
put(B_(0.10, 0.06, 0.15), M.black, 0.20, bank.h + 0.03, 2.12, 0.3);
// Deko auf der Kommode
put(B_(0.26, 0.022, 0.33), M.black, 0.24, 0.562, 1.02);
put(B_(0.07, 0.10, 0.09), M.black, 0.24, 0.61, 0.78);

// Wand C: Kallax zwischen den Fenstern
kallax(1.36, 4.10 - 0.195, 1, 4, Math.PI, 2);

// Teppich
put(B_(1.10, 0.014, 1.90), M.rug, 1.05, 0.007, 2.20, 0, false);

// Ventilator in der Ecke neben der Nische
ventilator(1.05, 0.30);

/* --- Bilder, Poster, Bälle --- */
picture('grizzlies', 0.46, 0.35, DOOR.x + DOOR.w / 2 - 0.03, 1.62, -T / 2 + 0.044, 0, 0.004);
picture('kobe',      0.24, 0.30, W - 0.012, 1.58, 1.12, -Math.PI / 2);
picture('ny',        1.20, 0.40, W - 0.012, 1.72, 3.05, -Math.PI / 2);
picture('caps',      0.34, 0.22, 0.012, 1.46, 0.42, Math.PI / 2);
picture('kaka',      0.38, 0.55, 0.012, 1.80, 3.72, Math.PI / 2);
picture('neymar',    0.38, 0.55, 0.012, 1.80, 3.28, Math.PI / 2);
picture('ronaldo',   0.38, 0.55, 0.012, 1.80, 2.84, Math.PI / 2);
picture('leben',     0.22, 0.26, 1.36, 1.86, L - 0.012, Math.PI);

ball(W - 0.135, 1.92, 0.80, -Math.PI / 2, '#e8e3d6');
ball(W - 0.135, 1.86, 1.62, -Math.PI / 2, '#dcd8cc');
put(new THREE.SphereGeometry(0.11, 20, 14), new THREE.MeshStandardMaterial({ color: '#e3ded2', roughness: 0.55 }), 1.95, 2.12, -0.31);
put(new THREE.SphereGeometry(0.11, 20, 14), new THREE.MeshStandardMaterial({ color: '#c8524b', roughness: 0.55 }), 1.72, 0.11, 3.62);
