// Ich-Perspektive: Augenhöhe 1,75 m, horizontales Sichtfeld fest (vertikal je nach
// Seitenverhältnis), kein Kopfwackeln. Blickrichtung ("gaze") liegt im Weltraum und wird
// relativ zum Körper auf ±150° begrenzt. Läuft in Echtzeit, unabhängig vom Tempo-Regler.

import { CAMERA, PLAYER } from '../config.js';
import { angleDiff, clamp, DEG, lerp, lerpAngle, wrapAngle } from '../core/math.js';

export class FirstPersonCamera {
  constructor(camera) {
    this.camera = camera;
    camera.rotation.order = 'YXZ';
    this.hfov = CAMERA.hfovDeg;
    this.gaze = 0;          // Sim-Winkel der Blickrichtung
    this.target = 0;
    this.pitch = CAMERA.basePitchDeg * DEG;
    this.dragging = false;
    this.dragStartGaze = 0;
    this.releaseT = 0;
    this.headMode = 'stay'; // 'stay' | 'return'
    this.invert = false;
    this.follow = false;    // Auflösung: Blick folgt dem Ball automatisch
    this.bodyHd = 0;
    this.eyeX = 0; this.eyeY = 0;
  }

  setFov(hfovDeg) {
    this.hfov = hfovDeg;
    this.applyAspect(this.camera.aspect);
  }

  applyAspect(aspect) {
    const c = this.camera;
    c.aspect = aspect;
    const hf = (this.hfov * Math.PI) / 180;
    c.fov = (2 * Math.atan(Math.tan(hf / 2) / aspect) * 180) / Math.PI;
    c.updateProjectionMatrix();
  }

  reset(w, lookAtIndex) {
    const u = w.user;
    this.bodyHd = w.hd[u];
    const lx = lookAtIndex >= 0 ? w.px[lookAtIndex] : w.ball.x;
    const ly = lookAtIndex >= 0 ? w.py[lookAtIndex] : w.ball.y;
    const tx = lx - w.px[u], ty = ly - w.py[u];
    this.gaze = this.target = this.clampToBody(Math.atan2(ty, tx));
    this.pitch = CAMERA.basePitchDeg * DEG;
    this.follow = false;
    this.dragging = false;
  }

  clampToBody(a) {
    const lim = CAMERA.headLimitDeg * DEG;
    const rel = clamp(angleDiff(this.bodyHd, a), -lim, lim);
    return this.bodyHd + rel;
  }

  beginDrag() {
    this.dragging = true;
    this.dragStartGaze = this.target;
  }

  drag(dxPx, widthPx) {
    const sign = this.invert ? 1 : -1; // Finger nach rechts → Blick nach rechts
    const delta = sign * (dxPx / widthPx) * CAMERA.swipeDegPerWidth * DEG;
    this.target = this.clampToBody(this.dragStartGaze + delta);
  }

  endDrag() {
    this.dragging = false;
    this.releaseT = 0;
  }

  update(w, alpha, dt) {
    const u = w.user;
    this.bodyHd = lerpAngle(w.phd[u], w.hd[u], alpha);
    this.eyeX = lerp(w.ppx[u], w.px[u], alpha);
    this.eyeY = lerp(w.ppy[u], w.py[u], alpha);
    const b = w.ball;
    const bx = lerp(b.px, b.x, alpha), by = lerp(b.py, b.y, alpha), bz = lerp(b.pz, b.z, alpha);
    const dx = bx - this.eyeX, dy = by - this.eyeY;
    const distBall = Math.sqrt(dx * dx + dy * dy);
    const toBall = Math.atan2(dy, dx);

    let tau = CAMERA.headTau;
    if (this.follow && !this.dragging) {
      // nach dem Pass schaut der Spieler dem Ball nach – außer er dreht gerade selbst den Kopf
      if (distBall > 0.8) this.target = this.clampToBody(toBall);
      tau = 0.18;
    } else if (!this.dragging) {
      this.releaseT += dt;
      if (this.headMode === 'return' && this.releaseT > 0.18 && distBall > 0.8) {
        this.target = this.clampToBody(toBall);
        tau = CAMERA.returnTau;
      }
    }
    // Grenze auch halten, wenn sich der Körper dreht
    this.target = this.clampToBody(this.target);

    // weich nachführen, mit maximaler Drehgeschwindigkeit
    let d = angleDiff(this.gaze, this.target) * (1 - Math.exp(-dt / tau));
    const maxStep = CAMERA.maxHeadRateDeg * DEG * dt;
    d = clamp(d, -maxStep, maxStep);
    this.gaze = wrapAngle(this.gaze + d);
    w.gaze = this.gaze;

    // Neigung: kurz vor der Annahme leicht nach unten, damit der Ball sichtbar bleibt
    const base = CAMERA.basePitchDeg * DEG;
    let wantPitch = base;
    const halfV = (this.camera.fov * DEG) / 2;
    const inView = Math.abs(angleDiff(this.gaze, toBall)) < (this.hfov * DEG) / 2 * 0.9;
    const incoming = w.phase === 'toUser' && w.arrivalEstimate - w.t < 0.9;
    if ((incoming || this.follow) && inView && distBall > 1.2) {
      const el = Math.atan2(bz - PLAYER.eyeHeight, distBall);
      wantPitch = clamp(Math.min(base, el + halfV - 7 * DEG), -32 * DEG, base);
    }
    this.pitch += (wantPitch - this.pitch) * (1 - Math.exp(-dt / 0.14));

    const c = this.camera;
    c.position.set(this.eyeX, PLAYER.eyeHeight, -this.eyeY);
    c.rotation.set(this.pitch, this.gaze - Math.PI / 2, 0);
    c.updateMatrixWorld();
  }
}
