// Verhalten der Spieler: jedes Skript liefert pro Schritt Zielpunkt, Tempo und Blickrichtung.
// Wie der Spieler dorthin kommt (Beschleunigung, Kurven, Drehrate), regelt world.js.

import { PLAYER, PITCH } from '../config.js';
import { clamp } from '../core/math.js';

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
  tg.x = clamp(ax + kx * (bx - rx), -PITCH.length / 2 + 1, PITCH.length / 2 - 1);
  tg.y = clamp(ay + ky * (by - ry), -PITCH.width / 2 + 1, PITCH.width / 2 - 1);
  tg.speed = speed;
  tg.look = LOOK_BALL;
}

// Übergang in KI: halten, leicht in Laufrichtung weiter, ballorientiert verschieben.
export function holdScript(w, i, drift) {
  return {
    type: 'zonal', speed: 4.5,
    ax: w.px[i] + w.vx[i] * drift, ay: w.py[i] + w.vy[i] * drift,
    rx: w.ball.x, ry: w.ball.y,
  };
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
      const gx = w.team[i] === 1 ? PITCH.length / 2 : -PITCH.length / 2;
      const dx = w.ball.x - gx, dy = w.ball.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const out = clamp(dist * 0.18, 1.5, 14);
      tg.x = gx + (dx / dist) * out;
      tg.y = (dy / dist) * out * 0.8;
      tg.speed = 3.5;
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
      tg.speed = PLAYER.dribble; tg.arrive = false;
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
      const sp = Math.max(s.vMin, s.v0 * Math.exp(-el / 0.8));
      tg.x = w.px[i] + s.dx * 10; tg.y = w.py[i] + s.dy * 10;
      tg.speed = sp; tg.arrive = false;
      tg.look = sp > 1.6 ? LOOK_MOVE : LOOK_HEADING; tg.hd = w.hd[i];
      return;
    }

    case 'chase':
      tg.x = w.ball.x; tg.y = w.ball.y; tg.speed = s.speed || PLAYER.run;
      return;

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
