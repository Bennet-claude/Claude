// DOM-Oberfläche: Start, Rückmeldung, Pause, Hinweise. Zurückhaltend, kein Gamer-HUD.
// Aktualisiert wird bei Zustandswechseln; pro Frame nur die zwei Fortschrittsbalken.

const $ = (id) => document.getElementById(id);

export function fmt(n, digits = 1) {
  return n.toFixed(digits).replace('.', ',');
}

export const PHASE_NAMES = {
  aufbau_hohes_pressing: 'Aufbau gegen hohes Pressing',
  aufbau_mittelfeldblock: 'Aufbau gegen Mittelfeldblock',
  letztes_drittel: 'Ballbesitz im letzten Drittel',
  umschalten: 'Umschalten nach Ballgewinn',
  gegenpressing: 'Befreien aus dem Gegenpressing',
};

const PRESSURE_NAMES = { keiner: '', seitlich: 'Druck von der Seite', hinten: 'Druck im Rücken', doppeln: 'Doppeln droht' };

export function minuteLabel(c) {
  if (c.half === 1 && c.minute > 45) return `45+${c.minute - 45}.`;
  if (c.half === 2 && c.minute > 90) return `90+${c.minute - 90}.`;
  return `${c.minute}.`;
}

export class UI {
  constructor(handlers) {
    this.h = handlers;
    this.el = {
      start: $('start'), pause: $('pause'), feedback: $('feedback'),
      hint: $('hint'), secure: $('btn-secure'), scorebug: $('scorebug'), session: $('session'),
      phaseLabel: $('phase-label'), debug: $('debug'), fade: $('fade'),
      fbGrade: $('fb-grade'), fbPoints: $('fb-points'), fbPattern: $('fb-pattern'),
      fbText: $('fb-text'), fbScan: $('fb-scan'), fbMeta: $('fb-meta'), fbProgress: $('fb-progress'),
      fullscreen: $('btn-fullscreen'), stats: $('session-stats'), startStats: $('start-stats'),
      meter: document.querySelector('.secure-meter'),
    };
    $('btn-start').addEventListener('click', () => this.h.start());
    $('btn-menu').addEventListener('click', () => this.h.menu());
    $('btn-pause').addEventListener('click', () => this.h.pause());
    $('btn-resume').addEventListener('click', () => this.h.resume());
    $('btn-skip').addEventListener('click', () => this.h.skip());
    this.el.feedback.addEventListener('click', () => this.h.next());
    this.el.secure.addEventListener('click', () => this.h.secure());
    for (const b of document.querySelectorAll('[data-tempo]')) {
      b.addEventListener('click', () => this.h.tempo(parseFloat(b.dataset.tempo)));
    }
    for (const b of document.querySelectorAll('[data-setting]')) {
      b.addEventListener('click', () => this.h.setting(b.dataset.setting, b.dataset.value));
    }
    for (const b of document.querySelectorAll('[data-pos]')) {
      b.addEventListener('click', () => this.h.position(b.dataset.pos));
    }
    const fsOk = document.fullscreenEnabled || document.webkitFullscreenEnabled;
    if (!fsOk) this.el.fullscreen.hidden = true;
    this.el.fullscreen.addEventListener('click', () => this.h.fullscreen());
    this.hintTimer = 0;
    this.phaseTimer = 0;
    this.lastMeter = -1;
  }

  setTempo(t) {
    for (const b of document.querySelectorAll('[data-tempo]')) {
      b.setAttribute('aria-pressed', String(parseFloat(b.dataset.tempo) === t));
    }
  }

  setPosition(p) {
    for (const b of document.querySelectorAll('[data-pos]')) b.setAttribute('aria-pressed', String(b.dataset.pos === String(p)));
  }

  setSettings(s) {
    for (const b of document.querySelectorAll('[data-setting]')) {
      const v = s[b.dataset.setting];
      b.setAttribute('aria-pressed', String(String(v) === b.dataset.value));
    }
    this.el.debug.hidden = !s.debug;
  }

  showStart(totals) {
    this.el.start.hidden = false;
    this.el.pause.hidden = true;
    this.el.feedback.hidden = true;
    this.el.scorebug.hidden = true;
    this.el.session.hidden = true;
    this.el.phaseLabel.hidden = true;
    this.el.secure.hidden = true;
    this.setSecure(false);
    this.hint('');
    this.el.startStats.textContent = totals && totals.scenes > 0
      ? `Bisher auf diesem Gerät: ${totals.scenes} Situationen, Ø ${Math.round(totals.points / totals.scenes)} Punkte, Bestserie ${totals.bestStreak}.`
      : '';
  }

  showPlay() {
    this.el.start.hidden = true;
    this.el.pause.hidden = true;
    this.el.scorebug.hidden = false;
    this.el.session.hidden = false;
    this.el.secure.hidden = false;
  }

  sceneMeta(meta) {
    const c = meta.context;
    this.el.scorebug.textContent = `${meta.position}er · ${c.own}:${c.opp} · ${minuteLabel(c)}`;
    const p = [PHASE_NAMES[meta.phase] || '', PRESSURE_NAMES[meta.pressure] || ''].filter(Boolean).join(' · ');
    clearTimeout(this.phaseTimer);
    this.el.phaseLabel.textContent = p;
    this.el.phaseLabel.hidden = !p;
    if (p) this.phaseTimer = setTimeout(() => { this.el.phaseLabel.hidden = true; }, 2200);
  }

  setSession(s) {
    this.el.session.textContent = `${s.points.toLocaleString('de-DE')} Pkt${s.streak >= 2 ? ` · Serie ${s.streak}` : ''}`;
  }

  setSecure(enabled, active = false) {
    this.el.secure.disabled = !enabled;
    this.el.secure.dataset.active = String(active);
    if (!active) this.setMeter(0);
  }

  // Haltezeit beim Sichern (0..1); nur schreiben, wenn sich sichtbar etwas ändert
  setMeter(v) {
    const q = Math.round(v * 50) / 50;
    if (q === this.lastMeter) return;
    this.lastMeter = q;
    this.el.meter.style.transform = `scaleX(${q})`;
  }

  hint(text, ms = 0) {
    clearTimeout(this.hintTimer);
    this.el.hint.textContent = text;
    this.el.hint.hidden = !text;
    if (text && ms) this.hintTimer = setTimeout(() => { this.el.hint.hidden = true; }, ms);
  }

  showPause(stats) {
    this.el.pause.hidden = false;
    this.el.stats.replaceChildren();
    if (stats) {
      for (const [k, v] of stats) {
        const d = document.createElement('div');
        const dt = document.createElement('dt'); dt.textContent = k;
        const dd = document.createElement('dd'); dd.textContent = v;
        d.append(dt, dd);
        this.el.stats.append(d);
      }
    }
  }

  hidePause() {
    this.el.pause.hidden = true;
  }

  showFeedback(g, points, meta) {
    const f = this.el.feedback;
    f.dataset.grade = g.grade;
    this.el.fbGrade.textContent = g.label;
    this.el.fbPoints.textContent = `+${points}`;
    this.el.fbPattern.textContent = g.pattern;
    this.el.fbText.textContent = g.text;
    this.el.fbScan.textContent = [g.lateNote, g.scanText].filter(Boolean).join(' ');
    this.el.fbMeta.textContent = meta;
    this.el.fbProgress.style.transform = 'scaleX(0)';
    f.hidden = false;
    this.setSecure(false);
    this.hint('');
  }

  feedbackProgress(v) {
    this.el.fbProgress.style.transform = `scaleX(${Math.min(1, v).toFixed(3)})`;
  }

  hideFeedback() {
    this.el.feedback.hidden = true;
  }

  fade(on) {
    this.el.fade.classList.toggle('on', on);
  }
}
