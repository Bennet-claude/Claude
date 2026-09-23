// Blickfeld – Einstieg: Spielschleife, Szenenablauf, Eingaben.
// Simulation in festen 60-Hz-Schritten, Rendering entkoppelt und interpoliert.

import * as THREE from 'three';
import { STEP, TIMING, TEMPI } from './config.js';
import { lerp } from './core/math.js';
import { World } from './sim/world.js';
import { FixedClock } from './sim/clock.js';
import { Renderer } from './render/renderer.js';
import { Figures } from './render/figures.js';
import { Props } from './render/props.js';
import { FirstPersonCamera } from './render/fpcamera.js';
import { Gestures } from './ui/input.js';
import { UI } from './ui/screens.js';
import { DebugPanel } from './ui/debug.js';
import * as store from './ui/storage.js';
import { M1_SCENE } from '../scenes/handmade.js';

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

const defaults = { tempo: 1, headMode: 'stay', invert: 'false', fov: 95, debug: false };
const settings = Object.assign({}, defaults, store.load('settings', {}));
if (/[?&]debug=1/.test(location.search) || location.hash === '#debug') settings.debug = true;

let state = 'start'; // start | context | play | result
let paused = false;
let menuOpen = false; // Einstellungen ohne laufende Szene (Start/Ergebnis)
let contextT = 0;
let lastPhase = '';
let last = 0;
let raf = 0;
let wakeLock = null;

const debug = new DebugPanel(document.getElementById('debug'));
const ui = new UI({
  start: () => startScene(),
  again: () => startScene(),
  menu: () => { paused = false; menuOpen = false; ui.hidePause(); loadScene(); state = 'start'; ui.showStart(); },
  pause: () => setPaused(!(paused || menuOpen)),
  resume: () => setPaused(false),
  secure: () => { if (state === 'play' && !paused && world.phase === 'decide') world.input({ type: 'shield' }); },
  tempo: (t) => setTempo(t),
  setting: (k, v) => applySetting(k, v),
  fullscreen: () => requestFullscreen(),
});

function applySetting(k, v) {
  if (k === 'fov') settings.fov = Number(v);
  else if (k === 'debug') settings.debug = v === 'true';
  else settings[k] = v;
  fp.headMode = settings.headMode;
  fp.invert = settings.invert === 'true';
  fp.setFov(settings.fov);
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

function setPaused(p) {
  if (state === 'start' || state === 'result') {
    // ohne laufende Szene: Pausemenü dient als Einstellungen
    menuOpen = p;
    if (p) ui.showOnly('pause');
    else if (state === 'start') ui.showStart();
    else ui.showOnly('result');
    return;
  }
  paused = p;
  clock.paused = p;
  if (p) ui.showPause(); else ui.hidePause();
}

function loadScene() {
  world.load(M1_SCENE);
  figures.setup(world);
  props.setup(world);
  fp.reset(world, world.passer);
  clock.reset();
  lastPhase = '';
  ui.sceneMeta(M1_SCENE.meta);
}

function startScene() {
  paused = false; menuOpen = false; clock.paused = false;
  ui.hidePause();
  loadScene();
  state = 'context';
  contextT = 0;
  ui.showContext();
  requestWakeLock();
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
  headStart: () => { if (!paused && (state === 'play' || state === 'context')) fp.beginDrag(); },
  headMove: (dx) => { if (fp.dragging) fp.drag(dx, renderer.width); },
  headEnd: () => fp.endDrag(),
  tap: (x, y) => {
    if (state !== 'play' || paused) return;
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
    if (state === 'play' || state === 'context') setPaused(true);
  } else if (!raf) {
    last = 0;
    raf = requestAnimationFrame(frame);
    if (state === 'play') requestWakeLock();
  }
});

function resize() {
  renderer.resize();
}
window.addEventListener('resize', resize);
if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);

// ---------- Schleife ----------

function onPhaseChange(ph) {
  if (ph === 'decide') ui.setSecure(true);
  else ui.setSecure(false);
  if (ph === 'action' || ph === 'done') ui.hint('');
}

function frame(now) {
  raf = requestAnimationFrame(frame);
  const dtMs = last ? now - last : 16.7;
  last = now;
  const dt = Math.min(dtMs / 1000, 0.1);
  renderer.track(dtMs);

  if (!paused) {
    if (state === 'context') {
      contextT += dt;
      if (contextT >= TIMING.contextCard) { state = 'play'; ui.play(); }
    } else if (state === 'play') {
      const n = clock.advance(dt);
      for (let k = 0; k < n; k++) world.step(STEP);
      if (world.phase !== lastPhase) { lastPhase = world.phase; onPhaseChange(lastPhase); }
      const a = world.action;
      fp.follow = world.phase === 'done' || (!!a && (a.type !== 'pass' || a.kicked));
      if (world.outcome && world.t - world.outcomeT >= TIMING.resolveTail) {
        state = 'result';
        ui.showResult(world, clock.tempo);
      }
    }
  }

  const alpha = state === 'play' ? clock.alpha : 0;
  fp.update(world, alpha, dt);
  figures.update(world, alpha, world.user);
  props.update(world, alpha, world.user);
  props.updateEdge(renderer.camera, state === 'play' && (world.phase === 'pre' || world.phase === 'toUser' || world.phase === 'decide' || fp.follow));
  renderer.render();
  debug.update(dt, renderer, world, fp, clock);
}

// ---------- Start ----------

loadScene();
applySetting('fov', settings.fov);
setTempo(settings.tempo);
resize();
// alle Shader vorab kompilieren, auch für gerade unsichtbare Objekte
props.ring.visible = props.edge.visible = true;
renderer.compile();
props.ring.visible = props.edge.visible = false;
ui.showStart();
raf = requestAnimationFrame(frame);
window.__blickfeld = { world, renderer, fp, clock, get state() { return state; } };
