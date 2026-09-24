// Blickfeld – Einstieg: Vorspann, Menü, Spielmodi und der laufende Spielzug.
// Simulation in festen 60-Hz-Schritten, Rendering entkoppelt und interpoliert.
// Im Menü läuft im Hintergrund eine echte Situation, gefilmt wie im Fernsehen.

import * as THREE from 'three';
import { STEP } from './config.js';
import { lerp, clamp, DEG } from './core/math.js';
import { mulberry32 } from './core/rng.js';
import { World } from './sim/world.js';
import { FixedClock } from './sim/clock.js';
import { Renderer } from './render/renderer.js';
import { Players } from './render/players.js';
import { Props } from './render/props.js';
import { FirstPersonCamera } from './render/fpcamera.js';
import { CinematicCamera } from './render/cinematic.js';
import { Gestures } from './ui/input.js';
import { UI, PHASE_NAMES, fmt } from './ui/screens.js';
import { DebugPanel } from './ui/debug.js';
import * as store from './ui/storage.js';
import { evaluateOptions } from './eval/evaluate.js';
import { evaluateMove, RESULT } from './eval/move.js';
import { pickNext, PHASES } from './generator/scheduler.js';
import { SITUATIONS, buildRealScene } from '../scenes/real/loader.js';
import {
  LEVELS, OBJECTIVES, levelById, nextLevel, currentLevel, levelPool, objectiveMet, levelStars, totalStars,
} from './game/career.js';

const RESULT_DELAY = { goal: 2.2, saved: 1.4, post: 1.4, wide: 1.3, blocked: 1.2 }; // s Spielzeit nach dem Ende
const RESULT_DELAY_DEFAULT = 0.9;
const FEEDBACK_TIME = 7;    // s Echtzeit bis automatisch weiter (Training/Tempo)
const FEEDBACK_BLITZ = 2.6;
const UNIT = 12;            // Spielzüge pro Trainingseinheit
const TEMPO = { start: 0.8, step: 0.05, max: 1.35, lives: 3 };
const BLITZ_TIME = 90;
const CINE_VFOV = 36;

const canvas = document.getElementById('view');
const renderer = new Renderer(canvas);
const world = new World();
const clock = new FixedClock();
const figures = new Players();
const props = new Props();
renderer.scene.add(figures.group, props.group);
renderer.camera.add(props.edge);
const fp = new FirstPersonCamera(renderer.camera);
const cine = new CinematicCamera(renderer.camera);
renderer.onResize = (aspect) => applyCameraMode(aspect);

const defaults = { tempo: 1, headMode: 'stay', invert: 'false', fov: 95, debug: false, pos: 'mix', intro: 'full' };
const settings = Object.assign({}, defaults, store.load('settings', {}));
if ([0.5, 0.75, 1].indexOf(settings.tempo) < 0) settings.tempo = 1;
if (/[?&]debug=1/.test(location.search) || location.hash === '#debug') settings.debug = true;
const progress = Object.assign(
  {
    history: [], phases: [], stats: {},
    totals: { scenes: 0, points: 0, bestStreak: 0, goals: 0, scans: 0, decT: 0, decN: 0 },
    career: { stars: {} }, best: { tempo: 0, blitz: 0 }, introSeen: 0,
  },
  store.load('progress', {}),
);
progress.career = Object.assign({ stars: {} }, progress.career);
progress.best = Object.assign({ tempo: 0, blitz: 0 }, progress.best);
const rng = mulberry32((Date.now() ^ (Math.random() * 1e9)) >>> 0);

// state: intro | menu | play | feedback | fadeout | over
let state = 'intro';
let paused = false;
let lastPhase = '';
let last = 0;
let raf = 0;
let wakeLock = null;
let fbT = 0, fbDuration = FEEDBACK_TIME, fadeT = 0, introTimer = 0;
let bdFade = 0;             // Menü-Hintergrund: Überblendung zur nächsten Situation
let pendingLevel = null;
let session = newSession();
let run = null;
let lastMove = null;

function newSession() {
  return { scenes: 0, points: 0, streak: 0, bestStreak: 0, times: [], scans: 0, stars: 0, goals: 0 };
}

window.addEventListener('resize', () => renderer.resize());
if (window.visualViewport) window.visualViewport.addEventListener('resize', () => renderer.resize());

const debug = new DebugPanel(document.getElementById('debug'));

// ---------- Kamera: Ich-Perspektive im Spiel, Kamerafahrt in Vorspann und Menü ----------

const cinematic = () => state === 'intro' || state === 'menu' || state === 'over';

function applyCameraMode(aspect = renderer.camera.aspect) {
  const c = renderer.camera;
  if (cinematic()) {
    c.aspect = aspect;
    c.fov = CINE_VFOV;
    c.updateProjectionMatrix();
  } else fp.applyAspect(aspect);
}

// ---------- Oberfläche ----------

const ui = new UI({
  openCareer: () => openCareer(),
  closeCareer: () => { ui.hideCareer(); showMenu(); },
  pickLevel: (id) => { pendingLevel = levelById(id); ui.showLevelCard(pendingLevel, progress.career.stars[id] || 0); },
  closeLevelCard: () => ui.hideLevelCard(),
  startLevel: () => { ui.hideLevelCard(); ui.hideCareer(); startRun('career', pendingLevel); },
  startMode: (m) => startRun(m),
  openStats: () => openStats(),
  pause: () => setPaused(!paused),
  resume: () => setPaused(false),
  restart: () => { if (run) { const r = run; startRun(r.mode, r.level); } },
  menu: () => toMenu(),
  again: () => { ui.hideGameOver(); startRun(run ? run.mode : 'training'); },
  next: () => { if (state === 'feedback' && !paused && !(lastMove && lastMove.actions)) goNext(); },
  context: () => onContext(),
  skipIntro: () => endIntro(),
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
  fp.hfov = settings.fov;
  if (!cinematic()) fp.setFov(settings.fov);
  world.viewHalf = (settings.fov / 2) * 0.92 * DEG;
  ui.setSettings(settings);
  store.save('settings', settings);
}

function setTempo(t) {
  if ([0.5, 0.75, 1].indexOf(t) < 0) return;
  settings.tempo = t;
  if (run && run.mode === 'training') clock.tempo = t;
  ui.setTempo(t);
  store.save('settings', settings);
}

function showMenu() {
  ui.showMenu({ level: currentLevel(progress.career.stars), stars: progress.career.stars, totals: progress.totals, best: progress.best });
}

function openCareer() {
  const cur = currentLevel(progress.career.stars);
  ui.showCareer(progress.career.stars, cur.chapter, cur.id);
}

function openStats() {
  const t = progress.totals;
  const rows = [
    ['Spielzüge', t.scenes.toLocaleString('de-DE')],
    ['Tore', String(t.goals || 0)],
    ['Ø Punkte', t.scenes ? String(Math.round(t.points / t.scenes)) : '–'],
    ['Beste Serie', String(t.bestStreak || 0)],
    ['Ø Entscheidung', t.decN ? `${fmt(t.decT / t.decN)} s` : '–'],
    ['Scans vor der Annahme', t.scenes ? fmt((t.scans || 0) / t.scenes) : '–'],
    ['Karriere-Sterne', `${totalStars(progress.career.stars)} / ${LEVELS.length * 3}`],
    ['Rekorde', `Tempo ${progress.best.tempo || '–'} · Blitz ${progress.best.blitz || '–'}`],
  ];
  const phases = PHASES.map((p) => {
    const s = progress.stats[p];
    return [PHASE_NAMES[p], s ? s.avg : 0, s ? s.n : 0];
  });
  ui.showStats(rows, phases);
}

// ---------- Schleife ----------

function onPhaseChange(ph) {
  ui.setContext(ph === 'decide' ? 'shield' : ph === 'team' ? 'demand' : ph === 'flight' ? 'demand-off' : 'shield-off');
  if (ph === 'action' || ph === 'done') ui.hint('');
  if (ph === 'done' && world.outcome) {
    const t = world.outcome.type;
    if (t === 'goal') ui.flash('Tor', 'goal');
    else if (RESULT[t] && RESULT[t].shot) ui.flash(RESULT[t].head, 'shot');
  }
}

function onContext() {
  if (state !== 'play' || paused) return;
  if (world.phase === 'decide' && !world.shielding) {
    world.input({ type: 'shield' });
    ui.setShieldActive(true);
    ui.hint('Ball gesichert – Mitspieler bieten sich an. Abspielen, bevor der Balken voll ist.', 2200);
  } else if (world.phase === 'team') {
    world.input({ type: 'demand' });
    ui.hint(`Ball gefordert – die ${world.num[world.carrier]} sucht dich, wenn der Weg frei ist.`, 1600);
  }
}

function frame(now) {
  raf = requestAnimationFrame(frame);
  const dtMs = last ? now - last : 16.7;
  last = now;
  const dt = Math.min(dtMs / 1000, 0.1);
  renderer.track(dtMs);

  if (cinematic()) {
    // Hintergrund: echte Situation läuft, die Kamera fährt langsam darum herum
    clock.tempo = 1;
    const n = clock.advance(dt);
    for (let k = 0; k < n; k++) world.step(STEP);
    if (state !== 'intro') {
      if (bdFade === 0 && ((world.outcome && world.t - world.outcomeT > 1.2) || world.t > 12)) bdFade = 0.001;
      if (bdFade > 0) {
        const before = bdFade;
        bdFade += dt;
        if (before < 0.3 && bdFade >= 0.3) loadBackdrop();
        canvas.classList.toggle('dim', bdFade < 0.3);
        if (bdFade > 0.8) bdFade = 0;
      }
    }
    cine.update(world, dt);
    figures.update(world, clock.alpha, -1, undefined, undefined, dt);
    props.update(world, clock.alpha, -1);
    props.updateEdge(renderer.camera, false);
  } else {
    if (!paused) {
      if (state === 'play' || state === 'feedback') {
        const n = clock.advance(dt);
        for (let k = 0; k < n; k++) world.step(STEP);
      }
      if (state === 'play') {
        if (world.phase !== lastPhase) { lastPhase = world.phase; onPhaseChange(lastPhase); }
        if (world.shielding) { ui.setShieldActive(true); ui.setMeter(world.shieldT / (world.shieldLimit || 2.8)); }
        if (run && run.mode === 'blitz' && !run.timeUp) {
          run.timeLeft -= dt;
          if (run.timeLeft <= 0) { run.timeLeft = 0; run.timeUp = true; ui.hint('Zeit! Letzter Spielzug', 1800); }
        }
        if (world.outcome && world.t - world.outcomeT >= (RESULT_DELAY[world.outcome.type] ?? RESULT_DELAY_DEFAULT)) finishMove();
      } else if (state === 'feedback') {
        if (!(lastMove && lastMove.actions)) {
          fbT += dt;
          ui.resultProgress(fbT / fbDuration);
          if (fbT >= fbDuration) goNext();
        }
      } else if (state === 'fadeout') {
        fadeT += dt;
        if (fadeT >= 0.26) afterFade();
      }
      updateChips();
    }
    const a = world.action;
    const ph = world.phase;
    fp.follow = ph === 'done' || ph === 'team' || ph === 'flight' || (ph === 'action' && !!a && (a.type === 'dribble' || a.kicked));
    const alpha = clock.alpha;
    fp.update(world, alpha, dt);
    figures.update(world, alpha, world.user, fp.eyeX, fp.eyeY, paused ? 0 : dt * clock.tempo);
    props.update(world, alpha, world.user);
    props.updateEdge(renderer.camera, state === 'play' && world.phase !== 'done');
  }
  props.tick(dt);
  renderer.render();
  debug.update(dt, renderer, world, fp, clock);
}

// ---------- HUD je Modus ----------

let chipBump = 0;
function updateChips() {
  if (!run) return;
  const c = [];
  const pts = (n) => Math.round(n).toLocaleString('de-DE');
  if (run.mode === 'training') {
    c.push({ label: 'Punkte ', text: pts(session.points) });
    if (session.streak >= 2) c.push({ text: `Serie ${session.streak}` });
  } else if (run.mode === 'career') {
    c.push({ icon: 'target', label: `Level ${run.level.n} · `, text: OBJECTIVES[run.level.goal].short });
  } else if (run.mode === 'tempo') {
    c.push({ type: 'lives', value: run.lives, max: TEMPO.lives, bump: chipBump > 0 });
    c.push({ icon: 'speed', text: `${fmt(run.speed, 2)}×` });
    c.push({ label: 'Punkte ', text: pts(run.score) });
  } else if (run.mode === 'blitz') {
    const s = Math.ceil(run.timeLeft);
    c.push({ icon: 'timer', text: `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`, cls: `timer${s <= 10 ? ' low' : ''}` });
    c.push({ label: 'Punkte ', text: pts(run.score) });
  }
  ui.chips(c);
  if (chipBump > 0) chipBump--;
}

// ---------- Szenen und Modi ----------

function loadScene(scene) {
  world.load(scene);
  figures.setup(world);
  props.setup(world);
  fp.reset(world, -1);
  clock.reset();
  lastPhase = '';
}

function pickScene() {
  if (run && run.mode === 'career') {
    const pool = levelPool(SITUATIONS, run.level, settings.pos);
    const sub = pool.map((i) => SITUATIONS[i]);
    const p = pickNext(sub, 'mix', progress, rng);
    return { index: pool[p.index], mirror: p.mirror };
  }
  return pickNext(SITUATIONS, settings.pos, progress, rng);
}

function nextScene() {
  const pick = pickScene();
  world.continuous = true;
  const scene = buildRealScene(pick.index, pick.mirror);
  state = 'play';
  applyCameraMode();
  loadScene(scene);
  progress.history.push(scene.baseId);
  if (progress.history.length > 300) progress.history.splice(0, progress.history.length - 300);
  progress.phases.push(scene.meta.phase);
  if (progress.phases.length > 10) progress.phases.splice(0, progress.phases.length - 10);
  ui.sceneMeta(scene.meta);
  clock.tempo = run.mode === 'training' ? settings.tempo : run.mode === 'tempo' ? run.speed : 1;
  ui.setContext('shield-off');
  ui.fade(false);
}

function startRun(mode, level) {
  paused = false; clock.paused = false;
  ui.hideMenu(); ui.hideCareer(); ui.hideGameOver(); ui.hidePause(); ui.hideResult(); ui.hideLevelCard();
  for (const s of ['settings', 'stats', 'howto']) ui.closeSheet(s);
  run = { mode, level: level || null, lives: TEMPO.lives, speed: TEMPO.start, timeLeft: BLITZ_TIME, timeUp: false, score: 0, moves: 0, goals: 0, over: false };
  if (mode === 'career' && !run.level) run.level = currentLevel(progress.career.stars);
  session = newSession();
  lastMove = null;
  ui.showHud(mode === 'training');
  ui.setTempo(settings.tempo);
  updateChips();
  // kurz abblenden, dann erste Situation
  ui.fade(true);
  state = 'fadeout';
  fadeT = 0;
  requestWakeLock();
}

function afterFade() {
  if (run && run.over) { gameOver(); return; }
  nextScene();
}

function toMenu() {
  paused = false; clock.paused = false;
  canvas.classList.remove('dim');
  bdFade = 0;
  ui.hidePause(); ui.hideResult(); ui.hideGameOver(); ui.hideLevelCard();
  ui.fade(false);
  run = null;
  state = 'menu';
  applyCameraMode();
  cine.start('menu');
  loadBackdrop();
  showMenu();
}

function setPaused(p) {
  if (state !== 'play' && state !== 'feedback') return;
  paused = p;
  clock.paused = p;
  if (p) ui.showPause(sessionRows(), !!run && run.mode !== 'training'); else ui.hidePause();
}

function sessionRows() {
  if (!run) return [];
  if (run.mode === 'tempo') return [['Punkte', String(Math.round(run.score))], ['Leben', String(run.lives)], ['Tempo', `${fmt(run.speed, 2)}×`], ['Spielzüge', String(run.moves)]];
  if (run.mode === 'blitz') return [['Punkte', String(Math.round(run.score))], ['Zeit', `${Math.ceil(run.timeLeft)} s`], ['Spielzüge', String(run.moves)], ['Tore', String(run.goals)]];
  if (run.mode === 'career') return [['Level', `${run.level.n} · ${run.level.name}`], ['Ziel', OBJECTIVES[run.level.goal].short]];
  if (session.scenes === 0) return [];
  const avgTime = session.times.length ? session.times.reduce((a, b) => a + b, 0) / session.times.length : 0;
  return [
    ['Spielzüge', String(session.scenes)],
    ['Punkte', session.points.toLocaleString('de-DE')],
    ['Tore', String(session.goals)],
    ['Ø Sterne', fmt(session.stars / session.scenes)],
    ['Ø Entscheidung', session.times.length ? `${fmt(avgTime)} s` : '–'],
    ['Beste Serie', String(session.bestStreak)],
  ];
}

// Spielzug vorbei: bewerten, Fortschritt speichern, Analyse zeigen
function finishMove() {
  const m = evaluateMove(world);
  const g = m.first;
  const phase = world.scene.meta.phase;
  let points = m.points;
  const good = m.stars >= 2;
  session.streak = good ? session.streak + 1 : 0;
  if (good && session.streak >= 3) points += 10 * Math.min(5, session.streak - 2); // Serienbonus
  session.scenes++;
  session.bestStreak = Math.max(session.bestStreak, session.streak);
  const sc = world.decisions[0] ? world.decisions[0].scans : world.scans;
  session.scans += sc;
  session.stars += m.stars;
  if (m.type === 'goal') session.goals++;
  if (g && g.decisionTime !== null) session.times.push(g.decisionTime);
  // dauerhaft: Stärken/Schwächen je Phase (erste Entscheidung = Kern des Trainings)
  const firstPts = g ? g.points : 0;
  const ps = progress.stats[phase] || (progress.stats[phase] = { n: 0, avg: 60 });
  ps.n++;
  ps.avg += (firstPts - ps.avg) / Math.min(ps.n, 20);

  const meta = [];
  if (g && g.decisionTime !== null) meta.push(world.decisions[0].direct ? 'Direktpass' : `1. Entscheidung nach ${fmt(g.decisionTime)} s`);
  meta.push(`${sc} ${sc === 1 ? 'Scan' : 'Scans'} vor der Annahme`);
  const extra = {};
  fbDuration = FEEDBACK_TIME;
  run.moves++;
  if (m.type === 'goal') run.goals++;

  if (run.mode === 'training') {
    if (session.scenes % UNIT === 0) {
      meta.push(`Einheit ${session.scenes / UNIT} geschafft: Ø ${Math.round((session.points + points) / session.scenes)} Punkte`);
      fbDuration += 2;
    }
  } else if (run.mode === 'career') {
    const lv = run.level;
    const met = objectiveMet(lv.goal, world, m);
    const got = levelStars(lv.goal, world, m);
    const prev = progress.career.stars[lv.id] || 0;
    if (got > prev) progress.career.stars[lv.id] = got;
    extra.eyebrow = `Level ${lv.n} · ${lv.name}`;
    extra.stars = got;
    extra.objective = { met, text: OBJECTIVES[lv.goal].short };
    const nx = nextLevel(lv.id);
    extra.actions = [];
    if (met && nx) extra.actions.push({ label: 'Nächstes Level', primary: true, onClick: () => { run.level = nx; goNext(); } });
    extra.actions.push({ label: 'Nochmal', primary: !met, onClick: () => goNext() });
    extra.actions.push({ label: 'Übersicht', onClick: () => { toMenu(); openCareer(); } });
    if (got > prev && prev > 0) meta.push('Neuer Bestwert in diesem Level');
  } else if (run.mode === 'tempo') {
    const lose = m.stars === 0 || m.lostByUser;
    if (lose) { run.lives--; chipBump = 40; meta.push('Ein Leben weg'); }
    else if (good) { run.speed = Math.min(TEMPO.max, run.speed + TEMPO.step); meta.push(`Schneller: ${fmt(run.speed, 2)}×`); }
    points = Math.round(points * clock.tempo);
    run.score += points;
    extra.eyebrow = `Tempo ${fmt(clock.tempo, 2)}× · ${run.lives} ${run.lives === 1 ? 'Leben' : 'Leben'} übrig`;
    if (run.lives <= 0) run.over = true;
  } else if (run.mode === 'blitz') {
    run.score += points;
    fbDuration = FEEDBACK_BLITZ;
    if (run.timeUp) run.over = true;
  }
  session.points += points;
  const t = progress.totals;
  t.scenes++; t.points += points; t.scans = (t.scans || 0) + sc;
  if (m.type === 'goal') t.goals = (t.goals || 0) + 1;
  if (g && g.decisionTime !== null) { t.decT = (t.decT || 0) + g.decisionTime; t.decN = (t.decN || 0) + 1; }
  t.bestStreak = Math.max(t.bestStreak || 0, session.bestStreak);
  store.save('progress', progress);

  lastMove = m;
  lastMove.actions = extra.actions && extra.actions.length ? extra.actions : null;
  ui.showResult(m, points, meta.join(' · '), extra);
  fbT = 0;
  state = 'feedback';
}

function goNext() {
  if (state !== 'feedback' && state !== 'play') return;
  ui.hideResult();
  ui.fade(true);
  fadeT = 0;
  state = 'fadeout';
}

function gameOver() {
  const mode = run.mode;
  const best = progress.best[mode] || 0;
  const record = run.score > best;
  if (record) progress.best[mode] = Math.round(run.score);
  store.save('progress', progress);
  state = 'over';
  applyCameraMode();
  cine.start('menu');
  loadBackdrop();
  ui.fade(false);
  ui.showGameOver({
    mode: mode === 'tempo' ? 'Tempo' : 'Blitz',
    title: mode === 'tempo' ? 'Keine Leben mehr' : 'Zeit abgelaufen',
    score: run.score, best, record,
    rows: [
      ['Spielzüge', String(run.moves)],
      ['Tore', String(run.goals)],
      mode === 'tempo' ? ['Höchstes Tempo', `${fmt(run.speed, 2)}×`] : ['Ø pro Spielzug', String(run.moves ? Math.round(run.score / run.moves) : 0)],
      ['Ø Sterne', session.scenes ? fmt(session.stars / session.scenes) : '–'],
    ],
  });
}

function loadBackdrop() {
  const pick = pickNext(SITUATIONS, 'mix', { history: progress.history.slice(-40), phases: [], stats: {} }, rng);
  world.continuous = false;
  loadScene(buildRealScene(pick.index, pick.mirror));
}

// ---------- Vorspann ----------

function startIntro() {
  const full = settings.intro === 'full' || !(progress.introSeen > 0);
  state = 'intro';
  applyCameraMode();
  cine.start('intro');
  introTimer = setTimeout(endIntro, ui.intro(full)); // Echtzeit, wie die Texteinblendungen
  ui.shade('off');
}

function endIntro() {
  if (state !== 'intro') return;
  clearTimeout(introTimer);
  canvas.classList.remove('dim');
  progress.introSeen = (progress.introSeen || 0) + 1;
  store.save('progress', progress);
  ui.endIntro();
  state = 'menu';
  cine.start('menu');
  showMenu();
}

// ---------- Eingaben ----------

const v3 = new THREE.Vector3();
let pickScore = Infinity;
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
  pickScore = bestScore;
  return best;
}

// Tipp → Strahl vom Auge durch den Bildpunkt
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
function tapRay(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(ndc, renderer.camera);
  return raycaster.ray;
}

// Tor getroffen? Rückgabe: Zielpunkt auf der Torlinie (y quer, z Höhe) oder null
function pickGoal(r) {
  const gx = (world.team[world.user] === 0 ? 1 : -1) * 52.5;
  const o = r.origin, d = r.direction;
  if (Math.abs(world.ball.x - gx) > 45) return null;
  if (d.x * Math.sign(gx) > 0.02) {
    const t = (gx - o.x) / d.x;
    const y = -(o.z + d.z * t), z = o.y + d.y * t;
    if (t > 0 && Math.abs(y) < 3.66 + 1.3 && z > -0.4 && z < 2.44 + 1.1) return { y: clamp(y, -4.3, 4.3), z: clamp(z, 0.15, 3.3) };
  }
  // Tipp auf den Rasen direkt vor dem Tor: flacher Schuss dorthin
  if (d.y < -0.01) {
    const t = -o.y / d.y;
    const x = o.x + d.x * t, y = -(o.z + d.z * t);
    if ((x - gx) * Math.sign(-gx) < 3 && Math.abs(y) < 4.2) return { y: clamp(y, -3.4, 3.4), z: 0.3 };
  }
  return null;
}

// Punkt auf dem Rasen (Pass in den Raum), höchstens 60 m weit
function pickGround(r) {
  const o = r.origin, d = r.direction;
  if (d.y > -0.004) return null;
  const t = -o.y / d.y;
  let x = o.x + d.x * t, y = -(o.z + d.z * t);
  const bx = world.ball.x, by = world.ball.y;
  const dist = Math.hypot(x - bx, y - by);
  if (dist > 60) { x = bx + ((x - bx) / dist) * 60; y = by + ((y - by) / dist) * 60; }
  if (dist < 3) return null;
  return { x, y };
}

new Gestures(canvas, {
  canDribble: () => state === 'play' && !paused && (world.phase === 'decide' || world.phase === 'team' || world.phase === 'flight'),
  headStart: () => { if (!paused && (state === 'play' || state === 'feedback')) fp.beginDrag(); },
  headMove: (dx) => { if (fp.dragging) fp.drag(dx, renderer.width); },
  headEnd: () => fp.endDrag(),
  tap: (x, y) => {
    if (paused) return;
    if (state === 'intro') { endIntro(); return; }
    if (state === 'feedback') { if (!(lastMove && lastMove.actions)) goNext(); return; }
    if (state !== 'play') return;
    const ph = world.phase;
    const t = pickTeammate(x, y);
    if (ph === 'team') {
      // Tipp auf den ballführenden Mitspieler: Ball fordern
      if (t === world.carrier) { world.input({ type: 'demand' }); ui.hint('Ball gefordert', 1200); }
      return;
    }
    if (ph !== 'pre' && ph !== 'toUser' && ph !== 'decide') return;
    const ray = tapRay(x, y);
    const goal = pickGoal(ray);
    if (t >= 0 && (pickScore <= 1 || !goal)) {
      world.input({ type: 'pass', target: t });
      if (ph !== 'decide') ui.hint(`Direktpass auf die ${world.num[t]} vorgemerkt`);
      return;
    }
    if (goal) {
      world.input({ type: 'shot', y: goal.y, z: goal.z });
      if (ph !== 'decide') ui.hint('Direktabnahme vorgemerkt');
      return;
    }
    if (ph !== 'decide') return;
    const g = pickGround(ray);
    if (!g) return;
    world.input({ type: 'space', x: g.x, y: g.y });
    props.markSpace(g.x, g.y);
  },
  swipe: (dx, dy) => {
    if (state !== 'play' || paused) return;
    // Bildschirmrichtung → Richtung auf dem Platz, relativ zur Blickrichtung
    const screenAng = Math.atan2(dx, -dy); // 0 = nach oben, positiv = nach rechts
    const dir = fp.gaze - screenAng;
    if (world.phase === 'decide') world.input({ type: 'dribble', dx: Math.cos(dir), dy: Math.sin(dir) });
    else if (world.phase === 'team' || world.phase === 'flight') {
      world.input({ type: 'run', dx: Math.cos(dir), dy: Math.sin(dir) });
      ui.hint('Sprint', 700);
    }
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
    if (run) requestWakeLock();
  }
});

// ---------- Start ----------

loadBackdrop();
world.continuous = true;
evaluateOptions(world, world.user); // Bewertung einmal vorab durchlaufen (JIT aufwärmen)
world.continuous = false;
applySetting('fov', settings.fov);
ui.setTempo(settings.tempo);
ui.setPosition(settings.pos);
renderer.resize();
// alle Shader vorab kompilieren, auch für gerade unsichtbare Objekte
props.ring.visible = props.edge.visible = props.mark.visible = true;
renderer.compile();
props.ring.visible = props.edge.visible = props.mark.visible = false;
if (/[?&]menu=1/.test(location.search) || location.hash === '#menu') {
  state = 'menu'; applyCameraMode(); cine.start('menu'); showMenu();
} else startIntro();
raf = requestAnimationFrame(frame);
window.__blickfeld = {
  world, renderer, fp, clock, ui,
  get state() { return state; },
  get run() { return run; },
  next: () => goNext(),
  startMode: (m, id) => startRun(m, id ? levelById(id) : undefined),
  skipIntro: () => endIntro(),
};
