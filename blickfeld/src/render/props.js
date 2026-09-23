// Ball, weiche Blob-Schatten, Markierung "Direktpass vorgemerkt", Ball-Hinweis am Bildrand.

import * as THREE from 'three';
import { BALL } from '../config.js';
import { lerp } from '../core/math.js';

function makeBallTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f3f3ef';
  ctx.fillRect(0, 0, 256, 128);
  ctx.fillStyle = '#2b2f36';
  const spots = [[20, 30], [84, 30], [148, 30], [212, 30], [52, 92], [116, 92], [180, 92], [244, 92], [0, 64], [128, 64]];
  for (const [x, y] of spots) {
    ctx.beginPath();
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 - Math.PI / 2;
      ctx.lineTo(x + Math.cos(a) * 13, y + Math.sin(a) * 11);
    }
    ctx.closePath();
    ctx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeBlobTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export class Props {
  constructor(maxPlayers = 22) {
    this.max = maxPlayers;
    this.ball = new THREE.Mesh(
      new THREE.SphereGeometry(BALL.radius, 16, 12),
      new THREE.MeshLambertMaterial({ map: makeBallTexture() }),
    );
    this.ball.name = 'ball';

    const blobGeo = new THREE.PlaneGeometry(1, 1);
    blobGeo.rotateX(-Math.PI / 2);
    this.shadows = new THREE.InstancedMesh(blobGeo, new THREE.MeshBasicMaterial({
      map: makeBlobTexture(), color: 0x0b1a08, transparent: true, opacity: 0.42, depthWrite: false,
    }), maxPlayers + 1);
    this.shadows.frustumCulled = false;
    this.shadows.renderOrder = 1;

    const ring = new THREE.RingGeometry(0.62, 0.78, 40);
    ring.rotateX(-Math.PI / 2);
    this.ring = new THREE.Mesh(ring, new THREE.MeshBasicMaterial({ color: 0xd8b85a, transparent: true, opacity: 0.9, depthWrite: false }));
    this.ring.position.y = 0.012;
    this.ring.visible = false;
    this.ring.renderOrder = 2;

    // Zielmarke für Pässe in den Raum (kurz sichtbar, wird größer und blasser)
    const mark = new THREE.RingGeometry(0.5, 0.62, 40);
    mark.rotateX(-Math.PI / 2);
    this.mark = new THREE.Mesh(mark, new THREE.MeshBasicMaterial({ color: 0xf1f0ea, transparent: true, opacity: 0, depthWrite: false }));
    this.mark.position.y = 0.013;
    this.mark.visible = false;
    this.mark.renderOrder = 2;
    this.markT = 9;

    // Pfeil am Bildrand, wenn der Ball außerhalb des Blickfelds ist (hängt an der Kamera)
    const shape = new THREE.Shape();
    shape.moveTo(0, 0.022); shape.lineTo(-0.018, -0.008); shape.lineTo(0, 0.0); shape.lineTo(0.018, -0.008); shape.closePath();
    this.edge = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({
      color: 0xf1f0ea, transparent: true, opacity: 0.85, depthTest: false, depthWrite: false,
    }));
    this.edge.renderOrder = 10;
    this.edge.visible = false;

    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.qStep = new THREE.Quaternion();
    this.axis = new THREE.Vector3();
    this.v = new THREE.Vector3();
    this.lastX = 0; this.lastY = 0;
    this.group = new THREE.Group();
    this.group.add(this.shadows, this.ball, this.ring, this.mark);
  }

  markSpace(x, y) {
    this.mark.position.x = x;
    this.mark.position.z = -y;
    this.markT = 0;
  }

  // Zielmarke ausblenden (Echtzeit)
  tick(dt) {
    this.markT += dt;
    const k = this.markT / 0.9;
    if (k >= 1) { this.mark.visible = false; return; }
    this.mark.visible = true;
    const e = 1 - Math.pow(1 - k, 3);
    this.mark.scale.setScalar(0.7 + 0.6 * e);
    this.mark.material.opacity = 0.95 * (1 - k);
  }

  setup(w) {
    this.markT = 9;
    this.mark.visible = false;
    this.shadows.count = w.n + 1;
    this.lastX = w.ball.x; this.lastY = w.ball.y;
  }

  update(w, alpha, hideIndex) {
    const b = w.ball;
    const x = lerp(b.px, b.x, alpha), y = lerp(b.py, b.y, alpha), z = lerp(b.pz, b.z, alpha);
    this.ball.position.set(x, z, -y);
    // Rollen: Drehung um die Achse quer zur Bewegung
    const dx = x - this.lastX, dy = y - this.lastY;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > 1e-5 && d < 3) {
      this.axis.set(-dy / d, 0, -dx / d);
      this.qStep.setFromAxisAngle(this.axis, d / BALL.radius);
      this.ball.quaternion.premultiply(this.qStep);
    }
    this.lastX = x; this.lastY = y;

    // Schatten (leicht versetzt zur Sonne)
    const m = this.m;
    for (let i = 0; i < w.n; i++) {
      if (i === hideIndex) { m.makeScale(0, 0, 0); this.shadows.setMatrixAt(i, m); continue; }
      const px = lerp(w.ppx[i], w.px[i], alpha), py = lerp(w.ppy[i], w.py[i], alpha);
      m.makeScale(1.05, 1, 0.85);
      m.setPosition(px + 0.12, 0.01, -py + 0.08);
      this.shadows.setMatrixAt(i, m);
    }
    const s = Math.max(0.12, 0.36 - z * 0.05);
    m.makeScale(s, 1, s);
    m.setPosition(x + 0.03, 0.011, -y + 0.02);
    this.shadows.setMatrixAt(w.n, m);
    this.shadows.instanceMatrix.needsUpdate = true;

    // vorgemerkter Direktpass
    if (w.directTarget >= 0 && !w.action) {
      const t = w.directTarget;
      this.ring.visible = true;
      this.ring.position.x = lerp(w.ppx[t], w.px[t], alpha);
      this.ring.position.z = -lerp(w.ppy[t], w.py[t], alpha);
    } else this.ring.visible = false;
  }

  // Ball-Hinweis: zeigt am Bildrand in Richtung Ball, wenn er nicht im Bild ist.
  updateEdge(camera, wanted) {
    const v = this.v;
    v.copy(this.ball.position);
    camera.worldToLocal(v); // Kameraraum: Blick entlang -z
    const hh = Math.tan((camera.fov * Math.PI) / 360);
    const hw = hh * camera.aspect;
    const inFront = v.z < -0.05;
    let onScreen = false;
    if (inFront) {
      const sx = v.x / -v.z / hw, sy = v.y / -v.z / hh;
      onScreen = Math.abs(sx) < 0.97 && Math.abs(sy) < 0.97;
    }
    if (!wanted || onScreen) { this.edge.visible = false; return; }
    const ang = Math.atan2(v.y, v.x === 0 ? 1e-4 : v.x);
    const ex = Math.cos(ang), ey = Math.sin(ang);
    const k = Math.min((hw * 0.9) / Math.max(1e-6, Math.abs(ex)), (hh * 0.84) / Math.max(1e-6, Math.abs(ey)));
    this.edge.position.set(ex * k, ey * k, -1);
    this.edge.rotation.set(0, 0, ang - Math.PI / 2);
    const sc = hh * 1.6;
    this.edge.scale.set(sc, sc, 1);
    this.edge.visible = true;
  }
}
