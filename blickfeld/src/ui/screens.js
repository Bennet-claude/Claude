// DOM-Oberfläche: Vorspann, Menü, Karriere, HUD, Spielzug-Analyse, Dialoge.
// Auftritte über Klassen ("in"/"out") mit CSS-Übergängen – nur transform/opacity, unterbrechbar.
// Pro Frame werden höchstens Fortschrittsbalken und Zähler geschrieben.

import { CHAPTERS, LEVELS, OBJECTIVES, isUnlocked, totalStars } from '../game/career.js';

const $ = (id) => document.getElementById(id);

export function fmt(n, digits = 1) {
  return n.toFixed(digits).replace('.', ',');
}
const num = (n) => Math.round(n).toLocaleString('de-DE');

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

const ICON = {
  heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-9.2-9.3C1.6 7.8 3.8 4.5 7.2 4.5c2 0 3.6 1.1 4.8 2.7 1.2-1.6 2.8-2.7 4.8-2.7 3.4 0 5.6 3.3 4.4 6.7-1.7 4.7-9.2 9.3-9.2 9.3Z"/></svg>',
  heartEmpty: '<svg class="empty" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-9.2-9.3C1.6 7.8 3.8 4.5 7.2 4.5c2 0 3.6 1.1 4.8 2.7 1.2-1.6 2.8-2.7 4.8-2.7 3.4 0 5.6 3.3 4.4 6.7-1.7 4.7-9.2 9.3-9.2 9.3Z"/></svg>',
  timer: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13" r="7.5"/><path d="M12 9.5V13l2.2 1.6M9.5 2.8h5"/></svg>',
  speed: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 16a8 8 0 1 1 16 0"/><path d="M12 16l4.5-5.5"/></svg>',
  target: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/></svg>',
};

function stars(n, of = 3) {
  let s = '';
  for (let i = 0; i < of; i++) s += `<span class="star${i < n ? ' on' : ''}"></span>`;
  return s;
}

// ein Element mit Auftritt zeigen / mit Abgang verstecken
function show(el) {
  if (!el) return;
  clearTimeout(el._t);
  el.hidden = false;
  el.classList.remove('out');
  void el.offsetWidth; // Übergang sicher starten
  el.classList.add('in');
}
function hide(el, ms = 220) {
  if (!el || el.hidden) return;
  clearTimeout(el._t);
  el.classList.remove('in');
  el.classList.add('out');
  el._t = setTimeout(() => { el.hidden = true; el.classList.remove('out'); }, ms);
}

export class UI {
  constructor(h) {
    this.h = h;
    this.el = {
      shade: $('shade'), intro: $('intro'), menu: $('menu'), career: $('career'), levelCard: $('level-card'),
      hud: $('hud'), chips: $('hud-chips'), tempo: $('tempo'), phaseLabel: $('phase-label'),
      hint: $('hint'), context: $('btn-context'), flash: $('flash'),
      result: $('result'), pause: $('pause'), gameover: $('gameover'),
      settings: $('settings'), stats: $('stats'), howto: $('howto'),
      debug: $('debug'), fade: $('fade'),
    };
    this.meter = this.el.context.querySelector('.context-meter');
    this.contextLabel = this.el.context.querySelector('.context-label');
    this.rProgress = $('r-progress');
    this.chapter = 1;
    this.lastMeter = -1;
    this.hintTimer = 0;
    this.phaseTimer = 0;

    // Menü
    $('card-career').addEventListener('click', () => h.openCareer());
    $('card-training').addEventListener('click', () => h.startMode('training'));
    $('card-tempo').addEventListener('click', () => h.startMode('tempo'));
    $('card-blitz').addEventListener('click', () => h.startMode('blitz'));
    $('btn-settings').addEventListener('click', () => this.openSheet('settings'));
    $('btn-howto').addEventListener('click', () => this.openSheet('howto'));
    $('btn-stats').addEventListener('click', () => h.openStats());
    for (const b of document.querySelectorAll('[data-close]')) b.addEventListener('click', () => this.closeSheet(b.dataset.close));
    // Karriere
    $('career-back').addEventListener('click', () => h.closeCareer());
    $('lc-start').addEventListener('click', () => h.startLevel());
    $('lc-back').addEventListener('click', () => h.closeLevelCard());
    // Spiel
    $('btn-pause').addEventListener('click', () => h.pause());
    $('btn-resume').addEventListener('click', () => h.resume());
    $('btn-restart').addEventListener('click', () => h.restart());
    $('btn-menu').addEventListener('click', () => h.menu());
    $('btn-pause-settings').addEventListener('click', () => this.openSheet('settings'));
    $('go-again').addEventListener('click', () => h.again());
    $('go-menu').addEventListener('click', () => h.menu());
    this.el.result.addEventListener('click', (e) => { if (!e.target.closest('button')) h.next(); });
    this.el.context.addEventListener('click', () => h.context());
    $('intro-skip').addEventListener('click', (e) => { e.stopPropagation(); h.skipIntro(); });
    this.el.intro.addEventListener('click', () => h.skipIntro());
    for (const b of document.querySelectorAll('[data-tempo]')) b.addEventListener('click', () => h.tempo(parseFloat(b.dataset.tempo)));
    for (const b of document.querySelectorAll('[data-setting]')) b.addEventListener('click', () => h.setting(b.dataset.setting, b.dataset.value));
    for (const b of document.querySelectorAll('[data-pos]')) b.addEventListener('click', () => h.position(b.dataset.pos));
    const fsOk = document.fullscreenEnabled || document.webkitFullscreenEnabled;
    if (!fsOk) $('btn-fullscreen').hidden = true;
    $('btn-fullscreen').addEventListener('click', () => h.fullscreen());

    // Wortmarke des Vorspanns in Buchstaben zerlegen (für den gestaffelten Auftritt)
    const word = this.el.intro.querySelector('.intro-word');
    word.innerHTML = [...'BLICKFELD'].map((c, i) => `<span style="--i:${i}">${c}</span>`).join('');
    this.el.intro.querySelectorAll('.intro-tag span').forEach((s, i) => s.style.setProperty('--i', i));
  }

  shade(mode) {
    const s = this.el.shade;
    s.classList.toggle('on', mode !== 'off');
    s.classList.toggle('full', mode === 'full');
  }

  // ---------- Vorspann ----------
  // Stufen: s1 Wortmarke, s2 Slogan, s3 Linie + Unterzeile. Die 3D-Kamerafahrt läuft darunter.
  intro(full) {
    const el = this.el.intro;
    el.hidden = false;
    el.className = 'intro';
    const steps = full
      ? [[250, 's1'], [900, 'scene'], [2300, 's2'], [3900, 's3'], [6300, 'leave']]
      : [[100, 's1'], [200, 'scene'], [700, 's2'], [1200, 's3'], [2300, 'leave']];
    this.introTimers = steps.map(([t, c]) => setTimeout(() => el.classList.add(c), t));
    return full ? 6900 : 2800;
  }

  endIntro() {
    const el = this.el.intro;
    for (const t of this.introTimers || []) clearTimeout(t);
    el.classList.add('s1', 's2', 's3', 'leave');
    setTimeout(() => { el.hidden = true; }, 620);
  }

  // ---------- Menü ----------
  showMenu(d) {
    this.hideHud();
    this.shade('menu');
    const lv = d.level;
    $('hero-level').textContent = `Level ${lv.n} · ${lv.name}`;
    $('hero-goal').textContent = OBJECTIVES[lv.goal].text;
    const total = totalStars(d.stars), max = LEVELS.length * 3;
    $('hero-progress').innerHTML = `<span><span class="star on" style="width:13px;height:13px;vertical-align:-1px"></span> ${total} von ${max} Sternen · Kapitel ${lv.chapter}</span><span class="progress-track"><span data-v="${(total / max).toFixed(3)}"></span></span>`;
    $('best-training').textContent = d.totals.scenes ? `${num(d.totals.scenes)} ${d.totals.scenes === 1 ? 'Spielzug' : 'Spielzüge'}` : '';
    $('best-tempo').textContent = d.best.tempo ? `Rekord ${num(d.best.tempo)}` : '';
    $('best-blitz').textContent = d.best.blitz ? `Rekord ${num(d.best.blitz)}` : '';
    const t = d.totals;
    $('menu-stats').textContent = t.scenes
      ? `${num(t.scenes)} Spielzüge · ${num(t.goals || 0)} Tore · Ø ${Math.round(t.points / t.scenes)} Punkte  ›`
      : 'Deine Entwicklung  ›';
    show(this.el.menu);
    // Fortschrittsbalken nach dem Auftritt füllen
    const bar = this.el.menu.querySelector('.progress-track span');
    if (bar) requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.transform = `scaleX(${bar.dataset.v})`; }));
  }

  hideMenu() { hide(this.el.menu, 260); }

  // ---------- Karriere ----------
  showCareer(starsMap, chapter, currentId) {
    this.hideMenu();
    this.shade('full');
    this.chapter = chapter;
    this.starsMap = starsMap;
    this.currentId = currentId;
    $('career-stars').innerHTML = `<span class="star on"></span> ${totalStars(starsMap)} / ${LEVELS.length * 3}`;
    const tabs = $('chapter-tabs');
    tabs.innerHTML = '';
    for (const ch of CHAPTERS) {
      const got = ch.levels.reduce((s, l) => s + (starsMap[l.id] || 0), 0);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tab';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(ch.id === chapter));
      b.innerHTML = `${ch.id} · ${ch.title}<span class="tab-stars">${got}/${ch.levels.length * 3}</span>`;
      b.addEventListener('click', () => { this.chapter = ch.id; this.renderLevels(); for (const t of tabs.children) t.setAttribute('aria-selected', String(t === b)); });
      tabs.append(b);
    }
    this.renderLevels();
    show(this.el.career);
  }

  renderLevels() {
    const ch = CHAPTERS.find((c) => c.id === this.chapter);
    $('chapter-sub').textContent = ch.sub;
    const grid = $('level-grid');
    grid.innerHTML = '';
    ch.levels.forEach((lv, i) => {
      const open = isUnlocked(this.starsMap, lv.id);
      const got = this.starsMap[lv.id] || 0;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `level rise${open ? '' : ' locked'}${lv.id === this.currentId ? ' current' : ''}`;
      b.style.setProperty('--i', i);
      b.innerHTML = `<span class="level-n">Level ${lv.n}</span><span class="level-name">${lv.name}</span><span class="level-goal">${OBJECTIVES[lv.goal].short}</span><span class="stars">${stars(got)}</span>`;
      b.addEventListener('click', () => { if (open) this.h.pickLevel(lv.id); else this.hint('Erst das Level davor mit mindestens einem Stern schaffen.', 1800); });
      grid.append(b);
    });
    // gestaffelter Auftritt der Kacheln
    grid.classList.remove('in');
    void grid.offsetWidth;
    grid.classList.add('in');
  }

  hideCareer() { hide(this.el.career, 260); }

  showLevelCard(lv, got) {
    const ch = CHAPTERS.find((c) => c.id === lv.chapter);
    $('lc-eyebrow').textContent = `Kapitel ${ch.id} · ${ch.title} · Level ${lv.n}`;
    $('lc-title').textContent = lv.name;
    $('lc-goal').textContent = OBJECTIVES[lv.goal].text;
    $('lc-start').textContent = got > 0 ? 'Nochmal spielen' : 'Los';
    show(this.el.levelCard);
  }

  hideLevelCard() { hide(this.el.levelCard); }

  // ---------- Dialoge ----------
  openSheet(name) { show(this.el[name]); }
  closeSheet(name) { hide(this.el[name]); }

  showStats(rows, phases) {
    const list = $('stats-list');
    list.replaceChildren();
    for (const [k, v] of rows) list.append(row(k, v));
    const bars = $('phase-bars');
    bars.replaceChildren();
    for (const [name, avg, n] of phases) {
      const d = document.createElement('div');
      d.className = 'phase-bar';
      d.innerHTML = `<div class="phase-bar-top"><span></span><b>${n ? Math.round(avg) : '–'}</b></div><div class="phase-track"><span style="--v:${n ? Math.max(0.02, avg / 110).toFixed(3) : 0}"></span></div>`;
      d.querySelector('span').textContent = name;
      bars.append(d);
    }
    this.openSheet('stats');
  }

  showPause(rows, canRestart) {
    const list = $('session-stats');
    list.replaceChildren();
    for (const [k, v] of rows || []) list.append(row(k, v));
    $('btn-restart').hidden = !canRestart;
    this.shade('full');
    show(this.el.pause);
  }

  hidePause() { hide(this.el.pause); this.shade('off'); }

  showGameOver(d) {
    $('go-eyebrow').textContent = d.mode;
    $('go-title').textContent = d.title;
    $('go-score').textContent = num(d.score);
    const best = $('go-best');
    best.textContent = d.record ? 'Neuer Rekord' : `Rekord ${num(d.best)}`;
    best.classList.toggle('record', !!d.record);
    const list = $('go-stats');
    list.replaceChildren();
    for (const [k, v] of d.rows) list.append(row(k, v));
    this.hideHud();
    this.shade('full');
    show(this.el.gameover);
  }

  hideGameOver() { hide(this.el.gameover); }

  // ---------- HUD ----------
  showHud(showTempo) {
    this.el.hud.hidden = false;
    this.el.tempo.hidden = !showTempo;
    this.lastChips = '';
    this.shade('off');
  }

  hideHud() {
    this.el.hud.hidden = true;
    this.el.context.hidden = true;
    this.el.phaseLabel.hidden = true;
    this.hint('');
  }

  // Chips oben in der Mitte (Modus-abhängig)
  chips(list) {
    const html = list.map((c) => {
      if (c.type === 'lives') {
        let s = '';
        for (let i = 0; i < c.max; i++) s += i < c.value ? ICON.heart : ICON.heartEmpty;
        return `<span class="hud-chip heart${c.bump ? ' bump' : ''}">${s}</span>`;
      }
      const icon = c.icon ? ICON[c.icon] : '';
      return `<span class="hud-chip ${c.cls || ''}${c.bump ? ' bump' : ''}">${icon}${c.label ? `<span class="muted">${c.label}</span>` : ''}${c.text}</span>`;
    }).join('');
    if (html !== this.lastChips) { this.el.chips.innerHTML = html; this.lastChips = html; }
  }

  setTempo(t) {
    for (const b of document.querySelectorAll('[data-tempo]')) b.setAttribute('aria-pressed', String(parseFloat(b.dataset.tempo) === t));
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

  sceneMeta(meta) {
    const c = meta.context;
    const p = [PHASE_NAMES[meta.phase] || '', PRESSURE_NAMES[meta.pressure] || '', `${c.own}:${c.opp} · ${minuteLabel(c)}`].filter(Boolean).join(' · ');
    clearTimeout(this.phaseTimer);
    this.el.phaseLabel.textContent = p;
    this.el.phaseLabel.hidden = false;
    this.phaseTimer = setTimeout(() => { this.el.phaseLabel.hidden = true; }, 2600);
  }

  // Kontextknopf: Sichern (mit Ball) / Fordern (Mitspieler hat den Ball)
  // mode: shield | demand | shield-off | demand-off | hidden
  setContext(mode) {
    const b = this.el.context;
    b.hidden = mode === 'hidden' || this.el.hud.hidden;
    b.dataset.mode = mode;
    this.contextLabel.textContent = mode.startsWith('demand') ? 'Fordern' : 'Sichern';
    b.disabled = mode !== 'shield' && mode !== 'demand';
    b.dataset.active = 'false';
    this.setMeter(0);
  }

  setShieldActive(on) { this.el.context.dataset.active = String(on); }

  setMeter(v) {
    const q = Math.round(v * 50) / 50;
    if (q === this.lastMeter) return;
    this.lastMeter = q;
    this.meter.style.transform = `scaleX(${q})`;
  }

  hint(text, ms = 0) {
    clearTimeout(this.hintTimer);
    const el = this.el.hint;
    if (!text) { el.hidden = true; return; }
    if (el.textContent !== text || el.hidden) {
      el.textContent = text;
      el.hidden = false;
      el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
    }
    if (ms) this.hintTimer = setTimeout(() => { el.hidden = true; }, ms);
  }

  flash(text, kind) {
    const f = this.el.flash;
    f.textContent = text;
    f.dataset.kind = kind;
    f.hidden = false;
    f.classList.remove('on');
    void f.offsetWidth;
    f.classList.add('on');
    clearTimeout(this.flashTimer);
    this.flashTimer = setTimeout(() => { f.hidden = true; f.classList.remove('on'); }, 1950);
  }

  // ---------- Spielzug-Analyse ----------
  // extra: { eyebrow, stars, objective: {text, met}, actions: [{label, primary, onClick}] }
  showResult(m, points, meta, extra = {}) {
    const r = this.el.result;
    r.dataset.kind = m.type === 'goal' ? 'goal' : m.lostByUser ? 'lost' : 'other';
    $('r-eyebrow').textContent = extra.eyebrow || 'Spielzug-Analyse';
    $('r-title').textContent = m.head;
    $('r-stars').innerHTML = stars(extra.stars ?? m.stars);
    $('r-points').textContent = `+${num(points)}`;
    const obj = $('r-objective');
    if (extra.objective) {
      obj.hidden = false;
      obj.className = `objective ${extra.objective.met ? 'met' : 'missed'}`;
      obj.textContent = `${extra.objective.met ? 'Ziel erreicht' : 'Ziel verfehlt'} · ${extra.objective.text}`;
    } else obj.hidden = true;
    const items = $('r-items');
    items.replaceChildren();
    m.items.forEach((it, i) => {
      const li = document.createElement('li');
      li.style.setProperty('--i', i);
      const label = document.createElement('span');
      label.className = 'item-label';
      label.textContent = it.label + (it.kind === 'offball' ? ` · ${it.text}` : '');
      const pill = document.createElement('span');
      pill.className = 'grade-pill';
      pill.dataset.g = it.grade;
      pill.textContent = it.gradeLabel || 'Stark';
      const pts = document.createElement('span');
      pts.className = 'item-pts';
      pts.textContent = it.points ? `+${it.points}` : '';
      li.append(label, pill, pts);
      items.append(li);
    });
    $('r-key').textContent = m.key;
    $('r-tip').textContent = m.tip || '';
    $('r-meta').textContent = meta;
    const act = $('r-actions');
    act.replaceChildren();
    for (const a of extra.actions || []) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `btn${a.primary ? ' primary' : ''}`;
      b.textContent = a.label;
      b.addEventListener('click', (e) => { e.stopPropagation(); a.onClick(); });
      act.append(b);
    }
    this.rProgress.parentElement.hidden = !!(extra.actions && extra.actions.length);
    this.rProgress.style.transform = 'scaleX(0)';
    this.setContext('hidden');
    this.hint('');
    show(r);
  }

  resultProgress(v) {
    this.rProgress.style.transform = `scaleX(${Math.min(1, v).toFixed(3)})`;
  }

  hideResult() { hide(this.el.result, 200); }

  fade(on) {
    this.el.fade.classList.toggle('on', on);
  }
}

function row(k, v) {
  const d = document.createElement('div');
  const dt = document.createElement('dt');
  const dd = document.createElement('dd');
  dt.textContent = k; dd.textContent = v;
  d.append(dt, dd);
  return d;
}

export { stars };
