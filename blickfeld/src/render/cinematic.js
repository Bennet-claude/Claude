// Kamerafahrten für Vorspann und Menü: ruhig, weich, ohne Wackeln (wie eine Kran- oder
// Drohnenkamera im Fernsehen). Sim-Koordinaten (x, y) → Three.js (x, Höhe, −y).

import * as THREE from 'three';
import { clamp, lerp } from '../core/math.js';

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2); // easeInOutCubic

// Vorspann: tief an der Eckfahne beginnen, dann steigend und schwenkend über den Platz
const INTRO = {
  from: { x: 50, y: -31, h: 1.4, lx: 30, ly: -8, lh: 1.2 },
  to: { x: 18, y: -38, h: 15, lx: -2, ly: 2, lh: 0 },
  T: 7.2,
};

export class CinematicCamera {
  constructor(camera) {
    this.camera = camera;
    this.mode = 'menu';
    this.t = 0;
    this.ang = -0.9;
    this.look = new THREE.Vector3();
    this.lookSm = new THREE.Vector3(0, 0, 0);
    this.pos = new THREE.Vector3();
    this.first = true;
  }

  start(mode) {
    this.mode = mode;
    this.t = 0;
    this.first = true;
  }

  update(w, dt) {
    this.t += dt;
    const c = this.camera;
    if (this.mode === 'intro') {
      const k = ease(clamp(this.t / INTRO.T, 0, 1));
      const a = INTRO.from, b = INTRO.to;
      this.pos.set(lerp(a.x, b.x, k), lerp(a.h, b.h, k), -lerp(a.y, b.y, k));
      this.look.set(lerp(a.lx, b.lx, k), lerp(a.lh, b.lh, k), -lerp(a.ly, b.ly, k));
      this.lookSm.copy(this.look);
      // danach nahtlos in die Menüfahrt übergehen
      this.ang = Math.atan2(-this.pos.z - 0, this.pos.x - 0);
    } else {
      // Menü: langsame Kreisfahrt um das Spielgeschehen, Blick weich auf den Ball
      this.ang += dt * 0.045;
      const bx = w && w.n ? w.ball.x : 0, by = w && w.n ? w.ball.y : 0;
      const cx = clamp(bx * 0.6, -30, 30), cy = clamp(by * 0.5, -14, 14);
      const R = 38, H = 16 + 2.5 * Math.sin(this.t * 0.07);
      const tx = cx + Math.cos(this.ang) * R, ty = cy + Math.sin(this.ang) * R;
      const target = this.look.set(bx, 0.8, -by);
      if (this.first) { this.pos.set(tx, H, -ty); this.lookSm.copy(target); this.first = false; }
      const kp = 1 - Math.exp(-dt / 2.5), kl = 1 - Math.exp(-dt / 1.6);
      this.pos.x += (tx - this.pos.x) * kp;
      this.pos.y += (H - this.pos.y) * kp;
      this.pos.z += (-ty - this.pos.z) * kp;
      this.lookSm.lerp(target, kl);
    }
    c.position.copy(this.pos);
    c.lookAt(this.mode === 'intro' ? this.look : this.lookSm);
    c.updateMatrixWorld();
  }
}
