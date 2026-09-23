// Simulationszustand in typisierten Arrays. Feste Schrittweite, keine Allokationen im Schritt.
// Spieler werden entweder aus echten Laufwegen nachgespielt ("replay") oder von Skripten
// gesteuert (ai.js). Der Wechsel ist nahtlos, weil beide Position und Geschwindigkeit teilen.

import { PLAYER, LANE, BALL, CAMERA } from '../config.js';
import { angleDiff, clamp, DEG, TAU } from '../core/math.js';
import { createPath, pathPos, pathDistance } from './ball.js';
import { computeTarget, createTarget, holdScript, LOOK_BALL, LOOK_MOVE, LOOK_POINT, LOOK_HEADING } from './ai.js';
import { sampleTrack } from './replay.js';
import * as director from './director.js';

const MAX = 22;
const MAX_TICKS = 60 * 120;

export class World {
  constructor() {
    this.n = 0;
    this.team = new Uint8Array(MAX);
    this.gk = new Uint8Array(MAX);
    this.num = new Uint8Array(MAX);
    this.skin = new Uint8Array(MAX);
    this.px = new Float64Array(MAX); this.py = new Float64Array(MAX);
    this.vx = new Float64Array(MAX); this.vy = new Float64Array(MAX);
    this.hd = new Float64Array(MAX); this.gait = new Float64Array(MAX);
    this.ppx = new Float64Array(MAX); this.ppy = new Float64Array(MAX);
    this.phd = new Float64Array(MAX); this.pgait = new Float64Array(MAX);
    this.ax = new Float64Array(MAX); this.ay = new Float64Array(MAX);
    this.kx = new Float64Array(MAX); this.ky = new Float64Array(MAX);
    this.kickT = new Float64Array(MAX);
    this.pkickT = new Float64Array(MAX);
    this.seen = new Float32Array(MAX);   // Zeitpunkt, wann der Spieler zuletzt im Blick war (-1 = nie)
    this.scripts = new Array(MAX);
    this.ids = new Array(MAX);
    this.tg = createTarget();
    this.ball = {
      holder: -1, x: 0, y: 0, z: BALL.radius, px: 0, py: 0, pz: BALL.radius,
      path: createPath(), inFlight: false, target: -1, replay: false,
    };
    this.tmp3 = new Float64Array(3);
    this.tmp4 = new Float64Array(4);
    this.gaze = 0;
    this.viewHalf = (CAMERA.hfovDeg / 2) * 0.92 * DEG;
    this.gazeLog = new Float32Array(MAX_TICKS);
    this.pending = [];
    this.inputs = [];
    this.replay = null;
    this.t = 0; this.tick = 0;
  }

  load(scene) {
    this.scene = scene;
    const idx = {};
    scene.players.forEach((p, i) => { idx[p.id] = i; });
    this.idx = idx;
    this.n = scene.players.length;
    this.replay = scene.replay || null;
    this.refX = scene.ballRef[0]; this.refY = scene.ballRef[1];
    this.t = 0; this.tick = 0;
    this.pending.length = 0; this.inputs.length = 0;
    this.user = -1; this.passer = idx[scene.pass.from];
    scene.players.forEach((p, i) => {
      this.ids[i] = p.id;
      this.team[i] = p.team;
      this.gk[i] = p.role === 'TW' ? 1 : 0;
      this.num[i] = p.num;
      this.skin[i] = p.skin || 0;
      let x = p.pos[0], y = p.pos[1], vx = p.vel ? p.vel[0] : 0, vy = p.vel ? p.vel[1] : 0;
      if (p.script && p.script.type === 'replay') {
        sampleTrack(this.replay, p.script.k, 0, this.tmp4);
        x = this.tmp4[0]; y = this.tmp4[1]; vx = this.tmp4[2]; vy = this.tmp4[3];
      }
      this.px[i] = this.ppx[i] = this.ax[i] = x;
      this.py[i] = this.ppy[i] = this.ay[i] = y;
      this.vx[i] = vx; this.vy[i] = vy;
      this.hd[i] = this.phd[i] = p.heading !== undefined ? p.heading * DEG : Math.atan2(vy, vx);
      this.gait[i] = this.pgait[i] = (i * 1.7) % TAU;
      this.kx[i] = p.kx ?? (p.team === 1 ? 0.18 : 0.2);
      this.ky[i] = p.ky ?? (p.team === 1 ? 0.55 : 0.25);
      this.kickT[i] = this.pkickT[i] = -1;
      this.seen[i] = -1;
      if (p.user) this.user = i;
      this.scripts[i] = resolveScript(p.script || { type: 'zonal' }, idx);
    });
    this.receiveX = scene.receive[0]; this.receiveY = scene.receive[1];
    this.ev = { passKick: -1, reception: -1, action: -1, kickAt: -1 };
    this.phase = 'pre';
    this.outcome = null; this.outcomeT = -1;
    this.action = null; this.directTarget = -1;
    this.passInfo = null; this.dribbleInfo = null; this.shieldInfo = null;
    this.contactT = 0; this.shieldT = 0; this.shielding = false; this.shieldStart = -1;
    this.released = false; this.passerAnim = false;
    this.scans = 0; this.lookingAway = false;
    this.evalAtReception = null; this.evalAtAction = null;
    const b = this.ball;
    b.holder = -1; b.inFlight = false; b.target = -1; b.replay = false;
    if (this.replay) {
      b.replay = true;
      sampleTrack(this.replay, 22, 0, this.tmp4);
      b.x = this.tmp4[0]; b.y = this.tmp4[1]; b.z = BALL.radius;
    } else {
      b.holder = this.passer;
      this.placeBallAtFeet(this.passer, 0.45);
    }
    b.px = b.x; b.py = b.y; b.pz = b.z;
    director.onLoad(this);
  }

  placeBallAtFeet(i, off) {
    const b = this.ball;
    b.x = this.px[i] + Math.cos(this.hd[i]) * off;
    b.y = this.py[i] + Math.sin(this.hd[i]) * off;
    b.z = BALL.radius;
  }

  savePrev() {
    for (let i = 0; i < this.n; i++) {
      this.ppx[i] = this.px[i]; this.ppy[i] = this.py[i];
      this.phd[i] = this.hd[i]; this.pgait[i] = this.gait[i];
      this.pkickT[i] = this.kickT[i];
    }
    const b = this.ball;
    b.px = b.x; b.py = b.y; b.pz = b.z;
  }

  step(dt) {
    this.savePrev();
    director.preStep(this, dt);
    for (let i = 0; i < this.n; i++) this.integrate(i, dt);
    this.updateBall(dt);
    this.trackGaze();
    director.postStep(this, dt);
    if (this.tick < this.gazeLog.length) this.gazeLog[this.tick] = this.gaze;
    this.t += dt;
    this.tick++;
  }

  // Wahrnehmung vor der Annahme: wer war im Blickfeld, wie oft wurde weggeschaut?
  trackGaze() {
    if (this.phase !== 'pre' && this.phase !== 'toUser') return;
    const u = this.user, ux = this.px[u], uy = this.py[u];
    for (let j = 0; j < this.n; j++) {
      if (j === u) continue;
      const a = Math.atan2(this.py[j] - uy, this.px[j] - ux);
      if (Math.abs(angleDiff(this.gaze, a)) < this.viewHalf) this.seen[j] = this.t;
    }
    const toBall = Math.atan2(this.ball.y - uy, this.ball.x - ux);
    const away = Math.abs(angleDiff(this.gaze, toBall)) > 40 * DEG;
    if (away && !this.lookingAway) this.scans++;
    this.lookingAway = away;
  }

  integrate(i, dt) {
    const s = this.scripts[i];
    if (this.kickT[i] >= 0) { this.kickT[i] += dt; if (this.kickT[i] > 0.5) this.kickT[i] = -1; }
    if (s.type === 'replay') {
      if (this.t + dt <= this.replay.tEnd) { this.integrateReplay(i, s, dt); return; }
      this.scripts[i] = holdScript(this, i, 0.6);
    }
    if (s.type === 'intercept') { this.integrateIntercept(i, s, dt); return; }

    const tg = this.tg;
    computeTarget(this, i, tg);
    const dx = tg.x - this.px[i], dy = tg.y - this.py[i];
    const dist = Math.sqrt(dx * dx + dy * dy);
    let dvx = 0, dvy = 0;
    if (dist > 0.12 && tg.speed > 0) {
      let sp = tg.speed;
      if (tg.arrive) sp = Math.min(sp, Math.sqrt(2 * PLAYER.decel * 0.55 * Math.max(0, dist - 0.1)));
      dvx = (dx / dist) * sp; dvy = (dy / dist) * sp;
    }
    // Abstand halten: niemand läuft durch einen anderen hindurch (Gegner dürfen näher, für Zweikämpfe)
    for (let j = 0; j < this.n; j++) {
      if (j === i) continue;
      const ox = this.px[i] - this.px[j], oy = this.py[i] - this.py[j];
      const R = this.team[j] === this.team[i] ? 1.3 : 0.75;
      const d2 = ox * ox + oy * oy;
      if (d2 < R * R && d2 > 1e-6) {
        const d = Math.sqrt(d2), push = (R - d) * 4.5;
        dvx += (ox / d) * push; dvy += (oy / d) * push;
      }
    }
    let ax = dvx - this.vx[i], ay = dvy - this.vy[i];
    const al = Math.sqrt(ax * ax + ay * ay);
    const cur = Math.sqrt(this.vx[i] * this.vx[i] + this.vy[i] * this.vy[i]);
    const des = Math.sqrt(dvx * dvx + dvy * dvy);
    const lim = (des > cur ? PLAYER.accel : PLAYER.decel) * dt;
    if (al > lim) { ax *= lim / al; ay *= lim / al; }
    this.vx[i] += ax; this.vy[i] += ay;
    this.moveAndTurn(i, tg, dt);
  }

  // Echter Laufweg: Position und Tempo aus der Spline, Blick/Körper wie bei allen anderen.
  integrateReplay(i, s, dt) {
    sampleTrack(this.replay, s.k, this.t + dt, this.tmp4);
    const x = this.tmp4[0], y = this.tmp4[1];
    this.vx[i] = (x - this.px[i]) / dt; this.vy[i] = (y - this.py[i]) / dt;
    const tg = this.tg;
    tg.look = LOOK_BALL;
    if (i === this.passer && this.ev.passKick < 0) { tg.look = LOOK_POINT; tg.lx = this.px[this.user]; tg.ly = this.py[this.user]; }
    this.moveAndTurn(i, tg, dt);
    // exakt auf die Spline setzen (moveAndTurn hat mit vx·dt bewegt)
    this.px[i] = x; this.py[i] = y;
    this.vx[i] = this.tmp4[2]; this.vy[i] = this.tmp4[3];
  }

  moveAndTurn(i, tg, dt) {
    const vx = this.vx[i], vy = this.vy[i];
    this.px[i] += vx * dt; this.py[i] += vy * dt;
    const speed = Math.sqrt(vx * vx + vy * vy);

    let want;
    if (tg.look === LOOK_BALL) want = Math.atan2(this.ball.y - this.py[i], this.ball.x - this.px[i]);
    else if (tg.look === LOOK_POINT) want = Math.atan2(tg.ly - this.py[i], tg.lx - this.px[i]);
    else if (tg.look === LOOK_HEADING) want = tg.hd;
    else want = speed > 0.3 ? Math.atan2(vy, vx) : this.hd[i];

    // Bei hohem Tempo zeigt der Körper in Laufrichtung (Rückwärtssprint gibt es nicht).
    if (speed > 3.2 && tg.look !== LOOK_MOVE) {
      const mv = Math.atan2(vy, vx);
      const maxDev = Math.max(0.3, 1.65 - (speed - 3.2) * 0.3);
      const dev = angleDiff(mv, want);
      if (dev > maxDev) want = mv + maxDev; else if (dev < -maxDev) want = mv - maxDev;
    }
    const rate = PLAYER.turnRateStand + (PLAYER.turnRateSprint - PLAYER.turnRateStand) * clamp(speed / PLAYER.sprint, 0, 1);
    let d = angleDiff(this.hd[i], want) * Math.min(1, 10 * dt);
    const maxStep = rate * dt;
    if (d > maxStep) d = maxStep; else if (d < -maxStep) d = -maxStep;
    this.hd[i] += d;

    // Schrittzyklus an die zurückgelegte Strecke gekoppelt
    const cycle = 1.2 + 0.35 * speed;
    this.gait[i] += ((speed * dt) / cycle) * TAU;
  }

  // Abfanglauf: exakt das Profil aus eval/lanes.js (Reaktion, Bremsen, Beschleunigen).
  integrateIntercept(i, s, dt) {
    const tt = this.t + dt - s.t0;
    let x, y;
    if (tt <= LANE.reaction) {
      x = this.px[i] + this.vx[i] * dt; y = this.py[i] + this.vy[i] * dt;
    } else {
      const tr = tt - LANE.reaction;
      let sAlong;
      if (tr < s.tb) {
        sAlong = s.u0 * tr + 0.5 * PLAYER.decel * tr * tr;
      } else {
        const t2 = tr - s.tb;
        const u = s.uStart, a = PLAYER.accel, vmax = s.vmax;
        const tAcc = (vmax - u) / a;
        if (t2 <= tAcc) sAlong = s.sB + u * t2 + 0.5 * a * t2 * t2;
        else sAlong = s.sB + u * tAcc + 0.5 * a * tAcc * tAcc + vmax * (t2 - tAcc);
      }
      if (sAlong >= s.D) { sAlong = s.D; s.arrived = true; }
      x = s.rx + s.ux * sAlong; y = s.ry + s.uy * sAlong;
    }
    this.vx[i] = (x - this.px[i]) / dt; this.vy[i] = (y - this.py[i]) / dt;
    this.px[i] = x - this.vx[i] * dt; this.py[i] = y - this.vy[i] * dt; // moveAndTurn addiert wieder
    const tg = this.tg;
    tg.look = LOOK_BALL;
    this.moveAndTurn(i, tg, dt);
    if (s.arrived) { this.vx[i] *= 0.85; this.vy[i] *= 0.85; }
  }

  updateBall(dt) {
    const b = this.ball;
    if (b.replay) {
      sampleTrack(this.replay, 22, this.t + dt, this.tmp4);
      b.x = this.tmp4[0]; b.y = this.tmp4[1]; b.z = BALL.radius;
      return;
    }
    if (b.holder >= 0) {
      const h = b.holder;
      let off = 0.45;
      const sc = this.scripts[h];
      const vx = this.vx[h], vy = this.vy[h];
      const sp = Math.sqrt(vx * vx + vy * vy);
      if (sc.type === 'dribble' || sc.type === 'carry' || (sc.type === 'ucarry' && sp > 1.2)) {
        // Ball wird mit kurzen Kontakten vorgelegt, Abstand wächst mit dem Tempo
        const ph = (this.gait[h] / TAU) % 1;
        off = 0.5 + (0.25 + 0.06 * sp) * ph;
      }
      this.placeBallAtFeet(h, off);
      return;
    }
    if (b.inFlight) {
      pathPos(b.path, this.t + dt - b.path.tKick, this.tmp3);
      b.x = this.tmp3[0]; b.y = this.tmp3[1]; b.z = this.tmp3[2];
    }
  }

  ballTau() {
    return this.t - this.ball.path.tKick;
  }

  ballTravel() {
    return pathDistance(this.ball.path, this.ballTau());
  }

  input(action) {
    this.inputs.push({ tick: this.tick, ...action });
    director.onInput(this, action);
  }
}

// Skriptreferenzen (IDs) → Indizes
function resolveScript(s, idx) {
  const r = { ...s };
  for (const k of ['victim', 'shadow', 'target', 'b', 'mate']) {
    if (typeof r[k] === 'string') r[k] = idx[r[k]];
  }
  if (r.type === 'press' && r.shadow === undefined) r.shadow = -1;
  if (r.type === 'press' && r.curveFrom === undefined) r.curveFrom = 7;
  if (r.stance !== undefined) r.stance *= DEG;
  return r;
}

export function nearestOpponent(w, i) {
  let best = -1, bd = Infinity;
  for (let j = 0; j < w.n; j++) {
    if (w.team[j] === w.team[i]) continue;
    const dx = w.px[j] - w.px[i], dy = w.py[j] - w.py[i];
    const d = dx * dx + dy * dy;
    if (d < bd) { bd = d; best = j; }
  }
  return best;
}
