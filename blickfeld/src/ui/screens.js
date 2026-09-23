// DOM-Oberfläche: Start, Kontext, Ergebnis, Pause, Hinweise. Zurückhaltend, kein Gamer-HUD.
// Aktualisiert wird nur bei Zustandswechseln, nicht pro Frame.

const $ = (id) => document.getElementById(id);

function fmt(n, digits = 1) {
  return n.toFixed(digits).replace('.', ',');
}

const PHASE_NAMES = {
  aufbau_mittelfeldblock: 'Aufbau gegen Mittelfeldblock',
  aufbau_hohes_pressing: 'Aufbau gegen hohes Pressing',
  letztes_drittel: 'Ballbesitz im letzten Drittel',
  umschalten: 'Umschalten nach Ballgewinn',
  gegenpressing: 'Befreien aus dem Gegenpressing',
};

export class UI {
  constructor(handlers) {
    this.h = handlers;
    this.el = {
      start: $('start'), context: $('context'), result: $('result'), pause: $('pause'),
      hint: $('hint'), secure: $('btn-secure'), scorebug: $('scorebug'), debug: $('debug'),
      ctxRole: $('ctx-role'), ctxScore: $('ctx-score'), ctxMin: $('ctx-min'), ctxSub: $('ctx-sub'),
      resTitle: $('res-title'), resDetail: $('res-detail'), resMeta: $('res-meta'), resTag: $('res-tag'),
      fullscreen: $('btn-fullscreen'),
    };
    $('btn-start').addEventListener('click', () => this.h.start());
    $('btn-again').addEventListener('click', () => this.h.again());
    $('btn-menu').addEventListener('click', () => this.h.menu());
    $('btn-pause').addEventListener('click', () => this.h.pause());
    $('btn-resume').addEventListener('click', () => this.h.resume());
    $('btn-restart').addEventListener('click', () => this.h.again());
    this.el.secure.addEventListener('click', () => this.h.secure());
    for (const b of document.querySelectorAll('[data-tempo]')) {
      b.addEventListener('click', () => this.h.tempo(parseFloat(b.dataset.tempo)));
    }
    for (const b of document.querySelectorAll('[data-setting]')) {
      b.addEventListener('click', () => this.h.setting(b.dataset.setting, b.dataset.value));
    }
    const fsOk = document.fullscreenEnabled || document.webkitFullscreenEnabled;
    if (!fsOk) this.el.fullscreen.hidden = true;
    this.el.fullscreen.addEventListener('click', () => this.h.fullscreen());
    this.hintTimer = 0;
  }

  showOnly(which) {
    for (const k of ['start', 'context', 'result', 'pause']) this.el[k].hidden = k !== which;
  }

  setTempo(t) {
    for (const b of document.querySelectorAll('[data-tempo]')) {
      b.setAttribute('aria-pressed', String(parseFloat(b.dataset.tempo) === t));
    }
  }

  setSettings(s) {
    for (const b of document.querySelectorAll('[data-setting]')) {
      const v = s[b.dataset.setting];
      b.setAttribute('aria-pressed', String(String(v) === b.dataset.value));
    }
    this.el.debug.hidden = !s.debug;
  }

  sceneMeta(meta) {
    const c = meta.context;
    this.el.ctxRole.textContent = `${meta.position}er`;
    this.el.ctxScore.textContent = `${c.own}:${c.opp}`;
    this.el.ctxMin.textContent = `${c.minute}.`;
    this.el.ctxSub.textContent = PHASE_NAMES[meta.phase] || '';
    this.el.scorebug.textContent = `${meta.position}er · ${c.own}:${c.opp} · ${c.minute}.`;
  }

  showContext() {
    this.showOnly('context');
    this.el.scorebug.hidden = true;
    this.setSecure(false);
    this.hint('');
  }

  play() {
    this.showOnly(null);
    this.el.scorebug.hidden = false;
  }

  setSecure(enabled) {
    this.el.secure.disabled = !enabled;
  }

  hint(text, ms = 0) {
    clearTimeout(this.hintTimer);
    this.el.hint.textContent = text;
    this.el.hint.hidden = !text;
    if (text && ms) this.hintTimer = setTimeout(() => { this.el.hint.hidden = true; }, ms);
  }

  showStart() {
    this.showOnly('start');
    this.el.scorebug.hidden = true;
    this.setSecure(false);
    this.hint('');
  }

  showPause() {
    this.el.pause.hidden = false;
  }

  hidePause() {
    this.el.pause.hidden = true;
  }

  // Ergebnis in Fußballsprache. Die volle Analyse (Noten, Passwege, Scan) kommt mit M2.
  showResult(w, tempo) {
    const o = w.outcome;
    const a = w.action;
    const nr = (i) => (i >= 0 ? w.num[i] : '?');
    let title = '', detail = '', tag = 'neutral';
    const pi = w.passInfo;
    const lane = pi ? { frei: 'frei', eng: 'eng', zu: 'zu' }[pi.status] : '';
    switch (o.type) {
      case 'received':
        title = 'Pass angekommen';
        tag = pi.status === 'frei' ? 'good' : 'warn';
        detail = `${pi.direct ? 'Direktpass' : 'Pass'}${pi.lofted ? ' (halbhoch)' : ''} auf die ${nr(pi.target)}. Passweg ${lane}`;
        if (pi.status === 'eng' && pi.critical >= 0) detail += ` – ihre ${nr(pi.critical)} war nur ${fmt(pi.margin, 2)} s zu spät.`;
        else detail += pi.margin < 10 ? ` (Puffer ${fmt(pi.margin, 2)} s).` : '.';
        break;
      case 'intercepted':
        title = 'Abgefangen';
        tag = 'bad';
        detail = `${pi.direct ? 'Direktpass' : 'Pass'} auf die ${nr(pi.target)}: Ihre ${nr(pi.interceptor)} war vor dem Ball am Passweg.`;
        break;
      case 'offside':
        title = 'Abseits';
        tag = 'bad';
        detail = `Die ${nr(pi.target)} stand beim Pass hinter der letzten Linie.`;
        break;
      case 'tackled': {
        title = 'Ball verloren';
        tag = 'bad';
        const t = w.ball.holder;
        detail = `Zu lange gewartet – ihre ${nr(t)} ist angelaufen und hat den Ball erobert.`;
        break;
      }
      case 'dribbleOk':
        title = 'Raum gewonnen';
        tag = 'good';
        detail = `Angedribbelt: ${fmt(w.dribbleInfo.gain, 0)} m, ohne dass dich jemand stellen konnte.`;
        break;
      case 'dribbleLost':
        title = 'Im Dribbling gestellt';
        tag = 'bad';
        detail = `Ihre ${nr(w.dribbleInfo.tackler)} war schneller am Ball.`;
        break;
      case 'shielded':
        title = 'Ball gesichert';
        tag = 'good';
        detail = 'Körper zwischen Ball und Gegner, Tempo rausgenommen. Ein Mitspieler kommt zur Unterstützung.';
        break;
      case 'shieldLost':
        title = 'Gedoppelt';
        tag = 'bad';
        detail = 'Zwei Gegenspieler am Mann – der Ball ist weg.';
        break;
      default:
        title = o.type;
    }
    let meta;
    if (a && a.type === 'pass' && a.direct) meta = 'Entscheidung vor der Annahme (Direktpass)';
    else if (a) meta = `Entscheidung ${fmt(Math.max(0, w.decisionTime), 1)} s nach der Annahme`;
    else meta = 'Keine Entscheidung getroffen';
    meta += ` · Tempo ${String(tempo).replace('.', ',')}×`;
    this.el.resTitle.textContent = title;
    this.el.resDetail.textContent = detail;
    this.el.resMeta.textContent = meta;
    this.el.result.dataset.tag = tag;
    this.showOnly('result');
    this.setSecure(false);
    this.hint('');
  }
}
