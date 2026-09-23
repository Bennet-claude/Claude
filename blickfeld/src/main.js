// Blickfeld – Einstieg: laufendes Spiel aus echten Situationen.
// Simulation in festen 60-Hz-Schritten, Rendering entkoppelt und interpoliert.
// Ablauf: Situation → Entscheidung → kurze Rückmeldung → nächste Situation, ohne Menü dazwischen.

import * as THREE from 'three';
import { STEP, TEMPI } from './config.js';
import { lerp, DEG } from './core/math.js';
import { mulberry32 } from './core/rng.js';
import { World } from './sim/world.js';
import { FixedClock } from './sim/clock.js';
import { Renderer } from './render/renderer.js';
import { Figures } from './render/figures.js';
import { Props } from './render/props.js';
import { FirstPersonCamera } from './render/fpcamera.js';
import { Gestures } from './ui/input.js';
import { UI, PHASE_NAMES, fmt } from './ui/screens.js';
import { DebugPanel } from './ui/debug.js';
import * as store from './ui/storage.js';
import { gradeDecision, evaluateOptions } from './eval/evaluate.js';
import { pickNext, PHASES } from './generator/scheduler.js';
import { SITUATIONS, buildRealScene } from '../scenes/real/loader.js';

const RESULT_DELAY = 0.9;   // s Spielzeit nach dem Ergebnis, bevor die Rückmeldung kommt
const FEEDBACK_TIME = 3.6;  // s Echtzeit, dann automatisch weiter
const UNIT = 12;            // Szenen pro Einheit

const canvas = document.getElementById('view');
const renderer = new Renderer(canvas);
const world = new World();
const clock = new FixedClock();
const figures = new Figures();
const props = new Props();
renderer.scene.add(figures.group, props.group);
renderer.camera.add(props.edge);
const fp = new FirstPersonCamera(renderer.camera);
renderer.onResize = (aspect) => fp.applyAspect(aspect);

const defaults = { tempo: 1, headMode: 'stay', invert: 'false', fov: 95, debug: false, pos: 'mix' };
const settings = Object.assign({}, defaults, store.load('settings', {}));
if (/[?&]debug=1/.test(location.search) || location.hash === '#debug') settings.debug = true;
const progress = Object.assign(
  { history: [], phases: [], stats: {}, totals: { scenes: 0, points: 0, bestStreak: 0 } },
  store.load('progress', {}),
);
const rng = mulberry32((Date.now() ^ (Math.random() * 1e9)) >>> 0);

let state = 'start'; // start | play | feedback | fadeout
let paused = false;
let menuOpen = false;
let lastPhase = '';
let last = 0;
let raf = 0;
let wakeLock = null;
let fbT = 0, fbDuration = FEEDBACK_TIME, fadeT = 0;
let session = newSession();

function newSession() {
  return { scenes: 0, points: 0, streak: 0, bestStreak: 0, gradeSum: {}, times: [], scans: 0, phase: {} };
}

const debug = new DebugPanel(document.getElementById('debug'));
const ui = new UI({
  start: () => startGame(),
  menu: () => toMenu(),
  pause: () => setPaused(!(paused || menuOpen)),
  resume: () => setPaused(false),
  skip: () => { setPaused(false); goNext(); },
  next: () => { if (state === 'feedback' && !paused) goNext(); },
  secure: () => {
    if (state === 'play' && !paused && world.phase === 'decide' && !world.shielding) {
      world.input({ type: 'shield' });
      ui.hint('Ball gesichert – Mitspieler bieten sich an. Abspielen, bevor der Balken voll ist.', 2200);
    }
  },
  tempo: (t) => setTempo(t),
  setting: (k, v) => applySetting(k, v),
  position: (p) => { settings.pos = p; ui.setPosition(p); store.save('settings', settings); },
  fullscreen: () => requestFullscreen(),
});

function applySetting(k, v) {
  if (k === 'fov') settings.fov = Number(v);
  else if (k === 'debug') settings.debug = v === 'true';
  else settings[k] = v;
  fp.headMode = settings.headMode;
  fp.invert = settings.invert === 'true';
  fp.setFov(settings.fov);
  world.viewHalf = (settings.fov / 2) * 0.92 * DEG;
  ui.setSettings(settings);
  store.save('settings', settings);
}

function setTempo(t) {
  if (TEMPI.indexOf(t) < 0) return;
  settings.tempo = t;
  clock.tempo = t;
  ui.setTempo(t);
  store.save('settings', settings);
}

function sessionStats() {
  if (session.scenes === 0) return null;
  const avgTime = session.times.length ? session.times.reduce((a, b) => a + b, 0) / session.times.length : 0;
  let best = null, worst = null;
  for (const p of PHASES) {
    const s = session.phase[p];
    if (!s || s.n < 2) continue;
    const avg = s.sum / s.n;
    if (!best || avg > best[1]) best = [p, avg];
    if (!worst || avg < worst[1]) worst = [p, avg];
  }
  const rows = [
    ['Situationen', String(session.scenes)],
    ['Punkte', session.points.toLocaleString('de-DE')],
    ['Ø pro Situation', String(Math.round(session.points / session.scenes))],
    ['Ø Entscheidungszeit', session.times.length ? `${fmt(avgTime)} s` : '–'],
    ['Scans pro Situation', fmt(session.scans / session.scenes)],
    ['Beste Serie', String(session.bestStreak)],
  ];
  if (best && worst && best[0] !== worst[0]) {
    rows.push(['Stärkste Phase', PHASE_NAMES[best[0]]]);
    rows.push(['Schwächste Phase', PHASE_NAMES[worst[0]]]);
  }
  return rows;
}

function setPaused(p) {
  if (state === 'start') {
    // ohne laufende Szene dient das Pausemenü als Einstellungen
    menuOpen = p;
    if (p) { ui.el.start.hidden = true; ui.showPause(null); } else { ui.hidePause(); ui.el.start.hidden = false; }
    return;
  }
  paused = p;
  clock.paused = p;
  if (p) ui.showPause(sessionStats()); else ui.hidePause();
}

// ---------- Szenen ----------

function loadScene(scene) {
  world.load(scene);
  figures.setup(world);
  props.setup(world);
  fp.reset(world, -1);
  clock.reset();
  lastPhase = '';
}

function nextScene() {
  const pick = pickNext(SITUATIONS, settings.pos, progress, rng);
  const scene = buildRealScene(pick.index, pick.mirror);
  loadScene(scene);
  progress.history.push(scene.baseId);
  if (progress.history.length > 300) progress.history.splice(0, progress.history.length - 300);
  progress.phases.push(scene.meta.phase);
  if (progress.phases.length > 10) progress.phases.splice(0, progress.phases.length - 10);
  ui.sceneMeta(scene.meta);
  ui.setSession(session);
  state = 'play';
  ui.fade(false);
}

function startGame() {
  paused = false; menuOpen = false; clock.paused = false;
  session = newSession();
  ui.hidePause();
  ui.showPlay();
  nextScene();
  requestWakeLock();
}

function toMenu() {
  paused = false; menuOpen = false; clock.paused = false;
  state = 'start';
  ui.hideFeedback();
  ui.fade(false);
  loadBackdrop();
  ui.showStart(progress.totals);
}

function finishScene() {
  const g = gradeDecision(world);
  const phase = world.scene.meta.phase;
  let points = g.points;
  const good = g.grade === 'top' || g.grade === 'good';
  session.streak = good ? session.streak + 1 : 0;
  if (good && session.streak >= 3) points += 10 * Math.min(5, session.streak - 2); // Serienbonus
  session.scenes++;
  session.points += points;
  session.bestStreak = Math.max(session.bestStreak, session.streak);
  session.scans += world.scans;
  if (g.decisionTime !== null) session.times.push(g.decisionTime);
  const sp = session.phase[phase] || (session.phase[phase] = { n: 0, sum: 0 });
  sp.n++; sp.sum += g.points;
  // dauerhaft: Verlauf und Stärken/Schwächen je Phase
  const ps = progress.stats[phase] || (progress.stats[phase] = { n: 0, avg: 60 });
  ps.n++;
  ps.avg += (g.points - ps.avg) / Math.min(ps.n, 20);
  progress.totals.scenes++;
  progress.totals.points += points;
  progress.totals.bestStreak = Math.max(progress.totals.bestStreak, session.bestStreak);
  store.save('progress', progress);

  let meta = [];
  if (g.decisionTime !== null) meta.push(world.action && world.action.direct ? 'Direktpass' : `Entscheidung nach ${fmt(g.decisionTime)} s`);
  meta.push(`${world.scans} ${world.scans === 1 ? 'Scan' : 'Scans'} vor der Annahme`);
  fbDuration = FEEDBACK_TIME;
  if (session.scenes % UNIT === 0) {
    const avg = Math.round(session.points / session.scenes);
    meta.push(`Einheit ${session.scenes / UNIT} geschafft: Ø ${avg} Punkte`);
    fbDuration = FEEDBACK_TIME + 2;
  }
  ui.showFeedback(g, points, meta.join(' · '));
  ui.setSession(session);
  fbT = 0;
  state = 'feedback';
}

function goNext() {
  if (state !== 'feedback' && state !== 'play') return;
  ui.hideFeedback();
  ui.fade(true);
  fadeT = 0;
  state = 'fadeout';
}

function loadBackdrop() {
  const pick = pickNext(SITUATIONS, settings.pos, { history: [], phases: [], stats: {} }, rng);
  loadScene(buildRealScene(pick.index, pick.mirror));
}

// ---------- Eingaben ----------

const v3 = new THREE.Vector3();
function pickTeammate(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const px = clientX - rect.left, py = clientY - rect.top;
  const W = rect.width, H = rect.height;
  const cam = renderer.camera;
  const a = clock.alpha;
  let best = -1, bestScore = Infinity;
  for (let i = 0; i < world.n; i++) {
    if (i === world.user || world.team[i] !== world.team[world.user]) continue;
    const x = lerp(world.ppx[i], world.px[i], a), y = lerp(world.ppy[i], world.py[i], a);
    v3.set(x, 0.9, -y).applyMatrix4(cam.matrixWorldInverse);
    if (v3.z > -0.5) continue; // hinter der Kamera
    v3.set(x, 0, -y).project(cam);
    const fx = ((v3.x + 1) / 2) * W, fy = ((1 - v3.y) / 2) * H;
    v3.set(x, 1.85, -y).project(cam);
    const hx = ((v3.x + 1) / 2) * W, hy = ((1 - v3.y) / 2) * H;
    const height = Math.max(1, fy - hy);
    const cx = (fx + hx) / 2, cy = (fy + hy) / 2;
    const halfW = Math.max(26, height * 0.32), halfH = Math.max(36, height * 0.5 + 12);
    const dx = Math.abs(px - cx), dy = Math.abs(py - cy);
    let score;
    if (dx <= halfW && dy <= halfH) score = Math.hypot(dx / halfW, dy / halfH);
    else {
      const d = Math.hypot(px - cx, py - cy);
      if (d > 72) continue;
      score = 2 + d / 72;
    }
    if (score < bestScore) { bestScore = score; best = i; }
  }
  return best;
}

new Gestures(canvas, {
  canDribble: () => state === 'play' && !paused && world.phase === 'decide',
  headStart: () => { if (!paused && (state === 'play' || state === 'feedback')) fp.beginDrag(); },
  headMove: (dx) => { if (fp.dragging) fp.drag(dx, renderer.width); },
  headEnd: () => fp.endDrag(),
  tap: (x, y) => {
    if (paused) return;
    if (state === 'feedback') { goNext(); return; }
    if (state !== 'play') return;
    const ph = world.phase;
    if (ph !== 'pre' && ph !== 'toUser' && ph !== 'decide') return;
    const t = pickTeammate(x, y);
    if (t < 0) return;
    world.input({ type: 'pass', target: t });
    if (ph !== 'decide') ui.hint(`Direktpass auf die ${world.num[t]} vorgemerkt`);
  },
  swipe: (dx, dy) => {
    if (state !== 'play' || paused || world.phase !== 'decide') return;
    // Bildschirmrichtung → Richtung auf dem Platz, relativ zur Blickrichtung
    const screenAng = Math.atan2(dx, -dy); // 0 = nach oben, positiv = nach rechts
    const dir = fp.gaze - screenAng;
    world.input({ type: 'dribble', dx: Math.cos(dir), dy: Math.sin(dir) });
  },
});

// iOS: kein Zoom per Geste / Doppeltipp
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });

// ---------- Plattform ----------

function requestFullscreen() {
  const el = document.documentElement;
  const fn = el.requestFullscreen || el.webkitRequestFullscreen;
  if (!fn) return;
  try {
    const p = fn.call(el);
    if (p && p.catch) p.catch(() => {});
  } catch (_) { /* nicht verfügbar */ }
}

async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    }
  } catch (_) { wakeLock = null; }
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    cancelAnimationFrame(raf);
    raf = 0;
    if (state === 'play' || state === 'feedback') setPaused(true);
  } else if (!raf) {
    last = 0;
    raf = requestAnimationFrame(frame);
    if (state !== 'start') requestWakeLock();
  }
});

window.addEventListener('resize', () => renderer.resize());
if (window.visualViewport) window.visualViewport.addEventListener('resize', () => renderer.resize());

// ---------- Schleife ----------

function onPhaseChange(ph) {
  ui.setSecure(ph === 'decide');
  if (ph === 'action' || ph === 'done') ui.hint('');
}

function frame(now) {
  raf = requestAnimationFrame(frame);
  const dtMs = last ? now - last : 16.7;
  last = now;
  const dt = Math.min(dtMs / 1000, 0.1);
  renderer.track(dtMs);

  if (!paused) {
    if (state === 'play' || state === 'feedback') {
      const n = clock.advance(dt);
      for (let k = 0; k < n; k++) world.step(STEP);
    }
    if (state === 'play') {
      if (world.phase !== lastPhase) { lastPhase = world.phase; onPhaseChange(lastPhase); }
      if (world.shielding) { ui.setSecure(true, true); ui.setMeter(world.shieldT / (world.shieldLimit || 2.8)); }
      if (world.outcome && world.t - world.outcomeT >= RESULT_DELAY) finishScene();
    } else if (state === 'feedback') {
      fbT += dt;
      ui.feedbackProgress(fbT / fbDuration);
      if (fbT >= fbDuration) goNext();
    } else if (state === 'fadeout') {
      fadeT += dt;
      if (fadeT >= 0.26) nextScene();
    }
  }
  const a = world.action;
  fp.follow = world.phase === 'done' || (!!a && (a.type !== 'pass' || a.kicked));
  const alpha = state === 'start' ? 0 : clock.alpha;
  fp.update(world, alpha, dt);
  figures.update(world, alpha, world.user, fp.eyeX, fp.eyeY);
  props.update(world, alpha, world.user);
  props.updateEdge(renderer.camera, state === 'play' && world.phase !== 'done');
  renderer.render();
  debug.update(dt, renderer, world, fp, clock);
}

// ---------- Start ----------

loadBackdrop();
evaluateOptions(world, world.user); // Bewertung einmal vorab durchlaufen (JIT aufwärmen, kein Ruckler bei der ersten Annahme)
applySetting('fov', settings.fov);
setTempo(settings.tempo);
ui.setPosition(settings.pos);
renderer.resize();
// alle Shader vorab kompilieren, auch für gerade unsichtbare Objekte
props.ring.visible = props.edge.visible = true;
renderer.compile();
props.ring.visible = props.edge.visible = false;
ui.showStart(progress.totals);
raf = requestAnimationFrame(frame);
window.__blickfeld = { world, renderer, fp, clock, get state() { return state; }, next: () => goNext() };
