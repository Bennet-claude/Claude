// Verhalten der Spieler: jedes Skript liefert pro Schritt Zielpunkt, Tempo und Blickrichtung.
// Wie der Spieler dorthin kommt (Beschleunigung, Kurven, Drehrate), regelt world.js.

import { PLAYER, PITCH } from '../config.js';
import { clamp } from '../core/math.js';
import { offsideLineX } from '../eval/lanes.js';

export const LOOK_BALL = 0;
export const LOOK_MOVE = 1;
export const LOOK_POINT = 2;
export const LOOK_HEADING = 3;

export function createTarget() {
  return { x: 0, y: 0, speed: 0, look: LOOK_BALL, lx: 0, ly: 0, hd: 0, arrive: true };
}

function triggered(w, s) {
  let t0;
  if (s.trigger === 'pass') t0 = w.ev.passKick;
  else if (s.trigger === 'reception') t0 = w.ev.reception;
  else if (s.trigger === 'action') t0 = w.ev.action;
  else t0 = s.at || 0;
  if (t0 < 0) return false;
  return w.t >= t0 + (s.delay || 0);
}

// Ballorientiertes Verschieben um den Ankerpunkt (eigener Anker im Skript oder aus der Szene).
function zonal(w, i, tg, speed, s) {
  const kx = w.kx[i], ky = w.ky[i];
  const bx = w.ball.x, by = w.ball.y;
  const own = s && s.ax !== undefined;
  const ax = own ? s.ax : w.ax[i], ay = own ? s.ay : w.ay[i];
  const rx = own ? s.rx : w.refX, ry = own ? s.ry : w.refY;
  const kxx = s && s.kx !== undefined ? s.kx : kx;
  tg.x = clamp(ax + kxx * (bx - rx), -PITCH.length / 2 + 1, PITCH.length / 2 - 1);
  tg.y = clamp(ay + ky * (by - ry), -PITCH.width / 2 + 1, PITCH.width / 2 - 1);
  if (s && s.goalSide) {
    // Verteidiger bleiben zwischen Ball und eigenem Tor
    const g = w.team[i] === 1 ? 1 : -1;
    if ((tg.x - bx) * g < 1.5) tg.x = bx + g * 1.5;
  }
  tg.speed = speed;
  tg.look = LOOK_BALL;
}

// Übergang in KI: halten, leicht in Laufrichtung weiter, ballorientiert verschieben.
export function holdScript(w, i, drift) {
  if (w.gk[i]) return { type: 'gk' }; // Torwart geht immer in seine Grundposition
  const h = {
    type: 'zonal', speed: 4.5,
    ax: w.px[i] + w.vx[i] * drift, ay: w.py[i] + w.vy[i] * drift,
    rx: w.ball.x, ry: w.ball.y,
  };
  if (w.continuous && w.user >= 0 && w.team[i] !== w.team[w.user]) {
    // im weitergeführten Spielzug: wer torseitig steht, bleibt torseitig und schiebt schneller nach
    const g = w.team[i] === 1 ? 1 : -1;
    if ((w.px[i] - w.ball.x) * g > 0) h.goalSide = true;
    h.speed = 5.5;
  }
  return h;
}

// Mit Ball auf die Linie zu: rechtzeitig abbremsen (1 = frei, 0 = an der Linie)
function edgeBrake(x, y, dx, dy) {
  let d = Infinity;
  if (dx > 0.2) d = Math.min(d, (PITCH.length / 2 - x) / dx);
  if (dx < -0.2) d = Math.min(d, (-PITCH.length / 2 - x) / dx);
  if (dy > 0.2) d = Math.min(d, (PITCH.width / 2 - y) / dy);
  if (dy < -0.2) d = Math.min(d, (-PITCH.width / 2 - y) / dy);
  return clamp((d - 1.2) / 3, 0, 1);
}

// Abstand des Torwarts von der Torlinie je nach Ballentfernung
export function gkOut(dist) {
  return clamp(0.07 * dist + (dist > 40 ? (dist - 40) * 0.25 : 0), 0.8, 14);
}

// Freie Anspielstation für Spieler i rund um den Ball
export function freeSpot(w, i, out) {
  const g = w.team[i] === 0 ? 1 : -1;
  const line = offsideLineX(w, w.team[i]) * g;
  const bx = w.ball.x, by = w.ball.y;
  let best = -Infinity;
  out.tx = w.px[i]; out.ty = w.py[i];
  for (let a = -80; a <= 80; a += 20) {
    const ang = (a * Math.PI) / 180;
    for (let r = 9; r <= 19; r += 5) {
      const cx = bx + Math.cos(ang) * r * g, cy = by + Math.sin(ang) * r;
      if (Math.abs(cy) > PITCH.width / 2 - 2 || Math.abs(cx) > PITCH.length / 2 - 2) continue;
      if (cx * g > line - 0.8) continue;
      let dMin = 8, lane = 4;
      for (let j = 0; j < w.n; j++) {
        if (w.team[j] === w.team[i]) continue;
        dMin = Math.min(dMin, Math.hypot(w.px[j] - cx, w.py[j] - cy));
        // Abstand des Gegners zum Passweg Ball → Punkt
        const vx = cx - bx, vy = cy - by, l2 = vx * vx + vy * vy;
        const t = clamp(((w.px[j] - bx) * vx + (w.py[j] - by) * vy) / l2, 0, 1);
        lane = Math.min(lane, Math.hypot(w.px[j] - bx - vx * t, w.py[j] - by - vy * t));
      }
      let mateGap = 8;
      for (let j = 0; j < w.n; j++) if (j !== i && w.team[j] === w.team[i]) mateGap = Math.min(mateGap, Math.hypot(w.px[j] - cx, w.py[j] - cy));
      const reach = Math.hypot(cx - w.px[i], cy - w.py[i]);
      const score = dMin * 1.0 + lane * 0.8 + (cx - bx) * g * 0.12 + Math.min(mateGap, 6) * 0.3 - reach * 0.12;
      if (score > best) { best = score; out.tx = cx; out.ty = cy; }
    }
  }
}

export function computeTarget(w, i, tg) {
  const s = w.scripts[i];
  tg.arrive = true;
  tg.look = LOOK_BALL;
  switch (s.type) {
    case 'hold':
    case 'zonal':
      zonal(w, i, tg, s.speed || 4, s);
      return;

    case 'move': {
      if (!triggered(w, s)) { zonal(w, i, tg, 3); return; }
      tg.x = s.to[0]; tg.y = s.to[1]; tg.speed = s.speed || PLAYER.run;
      tg.look = s.lookMove ? LOOK_MOVE : LOOK_BALL;
      return;
    }

    case 'run': {
      if (!triggered(w, s)) { zonal(w, i, tg, 3); return; }
      tg.x = s.to[0]; tg.y = s.to[1]; tg.speed = s.speed || PLAYER.sprint;
      tg.look = LOOK_MOVE;
      return;
    }

    case 'shadow': {
      // Position im Passweg zwischen A (Ball) und B: Deckungsschatten
      if (s.trigger && !triggered(w, s)) { zonal(w, i, tg, 3); return; }
      const ax = w.ball.x, ay = w.ball.y;
      const b = s.b;
      tg.x = ax + (w.px[b] - ax) * s.f;
      tg.y = ay + (w.py[b] - ay) * s.f;
      tg.speed = s.speed || 4.5;
      return;
    }

    case 'press': {
      if (!triggered(w, s)) { zonal(w, i, tg, 3); return; }
      const v = s.victim;
      const vx = w.px[v], vy = w.py[v];
      const dx = w.px[i] - vx, dy = w.py[i] - vy;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      // direkt anlaufen, auf die Stelle, an der der Ballführer gleich sein wird …
      const lead = Math.min(0.5, d / 12);
      let ax = vx + w.vx[v] * lead, ay = vy + w.vy[v] * lead;
      if (d > 2.5) { ax += (dx / d) * 0.6; ay += (dy / d) * 0.6; }
      if (s.shadow >= 0 && d > 2.5) {
        // … und auf den letzten Metern im Bogen in den Passweg zum abgeschirmten Mitspieler
        const sx = w.px[s.shadow] - vx, sy = w.py[s.shadow] - vy;
        const sl = Math.sqrt(sx * sx + sy * sy) || 1;
        const r = clamp(0.5 * d, 1.0, 5.0);
        const k = clamp((s.curveFrom - d) / (s.curveFrom - 2.5), 0, 1);
        ax += (vx + (sx / sl) * r - ax) * k;
        ay += (vy + (sy / sl) * r - ay) * k;
      }
      tg.x = ax; tg.y = ay;
      tg.arrive = d < 1.8; // im Zweikampf abbremsen statt durchzulaufen
      tg.speed = s.speed || 6.5;
      return;
    }

    case 'mark': {
      if (s.trigger && !triggered(w, s)) { zonal(w, i, tg, 3); return; }
      if (s.until !== undefined && w.t > s.until) { w.scripts[i] = holdScript(w, i, 0.3); computeTarget(w, i, tg); return; }
      const m = s.target;
      const gx = w.team[i] === 1 ? PITCH.length / 2 : -PITCH.length / 2;
      const dx = gx - w.px[m], dy = -w.py[m];
      const l = Math.sqrt(dx * dx + dy * dy) || 1;
      tg.x = w.px[m] + (dx / l) * (s.dist || 2);
      tg.y = w.py[m] + (dy / l) * (s.dist || 2);
      tg.speed = s.speed || PLAYER.sprint;
      return;
    }

    case 'gk': {
      // Torwart auf der Linie Ball – Tormitte: nah am Tor, wenn der Ball nah ist; weit vorn nur bei Ball weit weg
      const gx = w.team[i] === 1 ? PITCH.length / 2 : -PITCH.length / 2;
      const dx = w.ball.x - gx, dy = w.ball.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const out = gkOut(dist);
      tg.x = gx + (dx / dist) * out;
      tg.y = (dy / dist) * out * 0.8;
      tg.speed = dist < 40 ? 5 : 3.5;
      return;
    }

    case 'passer': {
      if (w.ev.passKick < 0) {
        tg.x = w.px[i]; tg.y = w.py[i]; tg.speed = 0;
        tg.look = LOOK_POINT; tg.lx = w.px[w.user]; tg.ly = w.py[w.user];
      } else {
        tg.x = s.after[0]; tg.y = s.after[1]; tg.speed = 3.5;
      }
      return;
    }

    case 'user': {
      tg.x = w.receiveX; tg.y = w.receiveY;
      const remain = Math.max(0.2, w.arrivalEstimate - w.t);
      const dx = tg.x - w.px[i], dy = tg.y - w.py[i];
      tg.speed = Math.min(3.5, Math.sqrt(dx * dx + dy * dy) / remain + 0.3);
      tg.look = LOOK_HEADING; tg.hd = s.stance;
      return;
    }

    case 'still':
      tg.x = w.px[i]; tg.y = w.py[i]; tg.speed = 0;
      tg.look = LOOK_HEADING; tg.hd = w.hd[i];
      return;

    case 'receive': {
      tg.x = s.x; tg.y = s.y;
      const remain = s.tArr - w.t;
      const dx = s.x - w.px[i], dy = s.y - w.py[i];
      const d = Math.sqrt(dx * dx + dy * dy);
      tg.speed = remain > 0.05 ? Math.min(PLAYER.sprint, d / remain + 0.5) : PLAYER.run;
      return;
    }

    case 'dribble':
      tg.x = w.px[i] + s.dx * 20; tg.y = w.py[i] + s.dy * 20;
      tg.speed = PLAYER.dribble * edgeBrake(w.px[i], w.py[i], s.dx, s.dy); tg.arrive = false;
      tg.look = LOOK_MOVE;
      return;

    case 'shield': {
      // Rücken zum nächsten Gegner, Körper zwischen Ball und Gegner, langsam wegdrehen
      let best = -1, bd = Infinity;
      for (let j = 0; j < w.n; j++) {
        if (w.team[j] === w.team[i]) continue;
        const dx = w.px[j] - w.px[i], dy = w.py[j] - w.py[i];
        const d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = j; }
      }
      tg.look = LOOK_HEADING;
      if (best >= 0) {
        const away = Math.atan2(w.py[i] - w.py[best], w.px[i] - w.px[best]);
        tg.hd = away;
        tg.x = w.px[i] + Math.cos(away) * 3; tg.y = w.py[i] + Math.sin(away) * 3;
        tg.speed = Math.sqrt(bd) < 2.5 ? 0.9 : 0.5;
      } else {
        tg.hd = w.hd[i]; tg.x = w.px[i]; tg.y = w.py[i]; tg.speed = 0;
      }
      return;
    }

    case 'support': {
      // bietet sich an: im Winkel s.ang zur Linie Gegner → Mitspieler, auf Abstand s.dist
      const m = s.mate;
      let bx = -1, by = 0;
      if (s.from >= 0) {
        const dx = w.px[m] - w.px[s.from], dy = w.py[m] - w.py[s.from];
        const l = Math.sqrt(dx * dx + dy * dy) || 1;
        bx = dx / l; by = dy / l;
      }
      const c = Math.cos(s.ang), sn = Math.sin(s.ang);
      tg.x = clamp(w.px[m] + (bx * c - by * sn) * s.dist, -PITCH.length / 2 + 1, PITCH.length / 2 - 1);
      tg.y = clamp(w.py[m] + (bx * sn + by * c) * s.dist, -PITCH.width / 2 + 1, PITCH.width / 2 - 1);
      tg.speed = PLAYER.run;
      return;
    }

    case 'ucarry': {
      // eigener Spieler nach der Annahme: nimmt den Ball in der Bewegung mit, wird langsamer
      const el = w.t - s.t0;
      const sp = Math.max(s.vMin, s.v0 * Math.exp(-el / 0.8)) * edgeBrake(w.px[i], w.py[i], s.dx, s.dy);
      tg.x = w.px[i] + s.dx * 10; tg.y = w.py[i] + s.dy * 10;
      tg.speed = sp; tg.arrive = false;
      tg.look = sp > 1.6 ? LOOK_MOVE : LOOK_HEADING; tg.hd = w.hd[i];
      return;
    }

    case 'chase':
      tg.x = w.ball.x; tg.y = w.ball.y; tg.speed = s.speed || PLAYER.run;
      return;

    case 'urun': {
      // eigener Spieler ohne Ball: sucht alle 0,6 s eine freie Anspielstation (Abstand zu Gegnern,
      // offener Passweg, Raumgewinn, knapp onside) und läuft dorthin
      if (s.next === undefined || w.t >= s.next) { freeSpot(w, i, s); s.next = w.t + 0.6; }
      tg.x = s.tx; tg.y = s.ty;
      const d = Math.hypot(tg.x - w.px[i], tg.y - w.py[i]);
      tg.speed = d > 5 ? PLAYER.run : d > 1.5 ? 4.2 : 2.5;
      tg.look = LOOK_BALL;
      return;
    }

    case 'usprint': {
      if (w.t >= s.until) { w.scripts[i] = { type: 'urun', t0: w.t }; computeTarget(w, i, tg); return; }
      let dx = s.dx, dy = s.dy;
      // wie ein guter Stürmer: an der Abseitslinie abdrehen, bis der Ball gespielt ist
      const g = w.team[i] === 0 ? 1 : -1;
      const line = offsideLineX(w, w.team[i]) * g;
      const free = w.ball.inFlight && w.ball.target === i;
      if (!free && dx * g > 0 && w.px[i] * g > line - 1.2 && w.px[i] * g > w.ball.x * g) {
        dx = 0; dy = Math.abs(dy) > 0.2 ? Math.sign(dy) : (w.py[i] > 0 ? -1 : 1);
      }
      tg.x = w.px[i] + dx * 20; tg.y = w.py[i] + dy * 20;
      tg.speed = PLAYER.sprint; tg.arrive = false;
      tg.look = LOOK_MOVE;
      return;
    }

    case 'attack': {
      // Tiefenlauf eines Mitspielers: Richtung Tor, auf der Abseitslinie wartend
      const g = w.team[i] === 0 ? 1 : -1;
      const line = offsideLineX(w, w.team[i]) * g;
      const ballComing = w.ball.inFlight && w.ball.target === i;
      const want = w.ball.x * g + s.depth + 8;
      const x = ballComing ? want : Math.min(want, line - 0.6);
      tg.x = clamp(x * g, -PITCH.length / 2 + 2, PITCH.length / 2 - 2);
      tg.y = w.py[i] + clamp(s.lane - w.py[i], -4, 4) * 0.5;
      tg.speed = PLAYER.run + 1;
      tg.look = LOOK_BALL;
      return;
    }

    case 'dive': {
      // Torwart: Hechtsprung zur Stelle (die Körperlage macht die Darstellung)
      if (w.t < s.t0) { tg.x = w.px[i]; tg.y = w.py[i]; tg.speed = 0; return; }
      tg.x = s.x; tg.y = s.y; tg.speed = s.step ? 3.5 : 6.5; tg.arrive = true;
      return;
    }

    case 'carry': {
      // mit Ball weiter: aus der Laufrichtung Richtung gegnerisches Tor eindrehen
      const gx = w.team[i] === 1 ? -PITCH.length / 2 : PITCH.length / 2;
      const dx = gx - w.px[i], dy = -w.py[i] * 0.5;
      const l = Math.sqrt(dx * dx + dy * dy) || 1;
      tg.x = w.px[i] + (dx / l) * 8 + w.vx[i] * 0.8; tg.y = w.py[i] + (dy / l) * 8 + w.vy[i] * 0.8;
      tg.speed = s.speed || 5.2; tg.arrive = false;
      tg.look = LOOK_MOVE;
      return;
    }

    default:
      tg.x = w.px[i]; tg.y = w.py[i]; tg.speed = 0;
  }
}
