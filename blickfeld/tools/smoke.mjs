// Rauchtest im Headless-Chromium: Vorspann, Menü, Karriere, Spielzug mit Analyse, Tempo-Modus,
// Pause und Dialoge – mit Screenshots. FPS-Werte hier sind bedeutungslos (Software-Rendering).
// Aufruf: node tools/smoke.mjs [ausgabeordner]
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (_) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(process.argv[2] || path.join(root, '.smoke'));
fs.mkdirSync(out, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
  const file = path.join(root, url === '/' ? 'index.html' : url);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: 1, hasTouch: true });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
const shot = (n) => page.screenshot({ path: path.join(out, n) });
const state = () => page.evaluate(() => window.__blickfeld && window.__blickfeld.state);

await page.goto(`http://localhost:${port}/?debug=0`);
await page.waitForFunction(() => window.__blickfeld && window.__blickfeld.renderer.fps > 0, null, { timeout: 60000 });
await page.waitForTimeout(1200);
await shot('01-vorspann-a.png');
await page.waitForTimeout(2600);
await shot('02-vorspann-b.png');
await page.waitForFunction(() => window.__blickfeld.state === 'menu', null, { timeout: 60000 });
await page.waitForTimeout(1400);
await shot('03-menue.png');

// Karriere öffnen, Level wählen
await page.click('#card-career');
await page.waitForTimeout(900);
await shot('04-karriere.png');
await page.click('.level:not(.locked)');
await page.waitForTimeout(700);
await shot('05-level.png');
await page.click('#lc-start');
await page.waitForFunction(() => window.__blickfeld.state === 'play', null, { timeout: 30000 });

// Autopilot: in jeder Entscheidung die beste Option, ohne Ball einmal sprinten
await page.evaluate(() => {
  const B = window.__blickfeld;
  let last = -1, ran = -1;
  window.__auto = setInterval(() => {
    const w = B.world;
    if (B.state !== 'play') return;
    if (w.phase === 'decide' && w.ev.reception !== last && w.t - w.ev.reception > 0.4) {
      last = w.ev.reception;
      const o = w.evalAtReception.best;
      if (o.type === 'pass') {
        B.fp.target = Math.atan2(w.py[o.target] - w.py[w.user], w.px[o.target] - w.px[w.user]);
        w.input({ type: 'pass', target: o.target });
      } else if (o.type === 'dribble') w.input({ type: 'dribble', dx: o.dx, dy: o.dy });
      else if (o.type === 'shot') w.input({ type: 'shot', y: 2.4, z: 0.5 });
      else w.input({ type: 'shield' });
    }
    if (w.phase === 'team' && w.t - ran > 3) { ran = w.t; w.input({ type: 'run', dx: 0.9, dy: 0.3 }); }
  }, 50);
});
await page.waitForTimeout(2500);
await shot('06-spiel.png');
await page.waitForFunction(() => window.__blickfeld.state === 'feedback', null, { timeout: 150000 });
await page.waitForTimeout(900);
await shot('07-analyse.png');
const result = await page.evaluate(() => ({
  title: document.getElementById('r-title').textContent,
  items: [...document.querySelectorAll('#r-items li')].map((l) => l.textContent),
  key: document.getElementById('r-key').textContent,
  tip: document.getElementById('r-tip').textContent,
  objective: document.getElementById('r-objective').textContent,
  outcome: window.__blickfeld.world.outcome.type,
  decisions: window.__blickfeld.world.decisions.length,
}));

// Tempo-Modus: HUD mit Leben, dann Pause
await page.evaluate(() => window.__blickfeld.startMode('tempo'));
await page.waitForFunction(() => window.__blickfeld.state === 'play', null, { timeout: 30000 });
await page.waitForFunction(() => window.__blickfeld.world.phase === 'decide' || window.__blickfeld.world.phase === 'toUser', null, { timeout: 60000 });
await page.waitForTimeout(300);
await shot('08-tempo-hud.png');
await page.click('#btn-pause');
await page.waitForTimeout(700);
await shot('09-pause.png');
await page.click('#btn-menu');
await page.waitForTimeout(1200);
await page.click('#btn-settings');
await page.waitForTimeout(800);
await shot('10-einstellungen.png');
await page.click('[data-close="settings"]');
await page.waitForTimeout(400);
await page.click('#btn-stats');
await page.waitForTimeout(1000);
await shot('11-statistik.png');
const info = await page.evaluate(() => { const r = window.__blickfeld.renderer; return { calls: r.r.info.render.calls, tris: r.r.info.render.triangles }; });
await page.setViewportSize({ width: 844, height: 390 });
await page.click('[data-close="stats"]');
await page.waitForTimeout(900);
await shot('12-iphone-menue.png');
console.log(JSON.stringify({ result, ...info, errors }, null, 2));
await browser.close();
server.close();
