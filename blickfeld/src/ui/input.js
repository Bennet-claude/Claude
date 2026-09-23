// Gesten über Pointer Events (ein Satz Handler für Touch, Stift und Maus).
// Tippen: kurze Berührung ohne Bewegung. Wischen waagerecht: Kopf drehen.
// Nach der Annahme senkrecht wischen: Andribbeln.

const TAP_MOVE = 10;     // px
const TAP_TIME = 350;    // ms
const DECIDE_MOVE = 12;  // px, ab hier steht die Gestenart fest
const SWIPE_MIN = 36;    // px für ein Dribbling

export class Gestures {
  constructor(el, handlers) {
    this.el = el;
    this.h = handlers;
    this.id = -1;
    this.mode = null; // null | 'head' | 'swipe'
    this.enabled = true;
    el.addEventListener('pointerdown', (e) => this.down(e));
    el.addEventListener('pointermove', (e) => this.move(e));
    el.addEventListener('pointerup', (e) => this.up(e));
    el.addEventListener('pointercancel', (e) => this.cancel(e));
    el.addEventListener('lostpointercapture', (e) => this.cancel(e));
  }

  down(e) {
    if (!this.enabled || this.id !== -1) return;
    e.preventDefault();
    this.id = e.pointerId;
    try { this.el.setPointerCapture(e.pointerId); } catch (_) { /* egal */ }
    this.x0 = e.clientX; this.y0 = e.clientY; this.t0 = performance.now();
    this.mode = null;
  }

  move(e) {
    if (e.pointerId !== this.id) return;
    e.preventDefault();
    const dx = e.clientX - this.x0, dy = e.clientY - this.y0;
    if (!this.mode) {
      if (Math.abs(dx) < DECIDE_MOVE && Math.abs(dy) < DECIDE_MOVE) return;
      const vertical = Math.abs(dy) > Math.abs(dx) * 1.1;
      if (vertical && this.h.canDribble()) this.mode = 'swipe';
      else { this.mode = 'head'; this.h.headStart(); }
    }
    if (this.mode === 'head') this.h.headMove(dx);
  }

  up(e) {
    if (e.pointerId !== this.id) return;
    e.preventDefault();
    const dx = e.clientX - this.x0, dy = e.clientY - this.y0;
    const dt = performance.now() - this.t0;
    if (!this.mode) {
      if (Math.abs(dx) < TAP_MOVE && Math.abs(dy) < TAP_MOVE && dt < TAP_TIME) this.h.tap(e.clientX, e.clientY);
    } else if (this.mode === 'head') {
      this.h.headEnd();
    } else if (this.mode === 'swipe') {
      if (Math.hypot(dx, dy) >= SWIPE_MIN) this.h.swipe(dx, dy);
    }
    this.reset();
  }

  cancel(e) {
    if (e.pointerId !== this.id) return;
    if (this.mode === 'head') this.h.headEnd();
    this.reset();
  }

  reset() {
    try { if (this.id !== -1) this.el.releasePointerCapture(this.id); } catch (_) { /* egal */ }
    this.id = -1;
    this.mode = null;
  }
}
