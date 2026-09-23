// Rauchtest im Headless-Chromium: lädt die Seite, spielt mehrere Situationen, macht Screenshots.
// FPS-Werte hier sind bedeutungslos (Software-Rendering) – nur Fehler und Bild prüfen.
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
const B = () => window.__blickfeld;

await page.goto(`http://localhost:${port}/?debug=1`);
await page.waitForFunction(() => window.__blickfeld && window.__blickfeld.renderer.fps > 0, null, { timeout: 30000 });
await page.waitForTimeout(600);
await shot('1-start.png');
// langsames Tempo, damit Screenshots im Software-Rendering die Szene nicht verpassen
await page.click('[data-tempo="0.25"]');
await page.click('#btn-start');
await page.waitForFunction(() => window.__blickfeld.state === 'play');
await page.waitForTimeout(1200);
await shot('2-anlauf.png');
const results = [];
for (let s = 0; s < 3; s++) {
  await page.waitForFunction(() => window.__blickfeld.state === 'play' && window.__blickfeld.world.phase === 'decide', null, { timeout: 90000, polling: 16 });
  // Blick auf die beste Option, dann spielen (Szene 2: erst sichern)
  const mode = s === 1 ? 'shield' : 'best';
  await page.evaluate((mode) => {
    const { world, fp } = window.__blickfeld;
    const best = world.evalAtReception.best;
    if (mode === 'shield') { world.input({ type: 'shield' }); return; }
    if (best.type === 'pass') {
      fp.target = Math.atan2(world.py[best.target] - world.py[world.user], world.px[best.target] - world.px[world.user]);
      world.input({ type: 'pass', target: best.target });
    } else if (best.type === 'dribble') world.input({ type: 'dribble', dx: best.dx, dy: best.dy });
    else world.input({ type: 'shield' });
  }, mode);
  await page.waitForTimeout(700);
  await shot(`3-szene${s + 1}-aktion.png`);
  if (mode === 'shield') {
    await page.waitForTimeout(1500);
    await page.evaluate(() => {
      const { world } = window.__blickfeld;
      if (world.phase !== 'decide') return;
      const passes = world.evalAtReception.options.filter((o) => o.type === 'pass').sort((a, b) => b.value - a.value);
      world.input({ type: 'pass', target: passes[0].target });
    });
  }
  await page.waitForFunction(() => window.__blickfeld.state === 'feedback', null, { timeout: 90000 });
  await page.waitForTimeout(250);
  await shot(`4-szene${s + 1}-rueckmeldung.png`);
  results.push(await page.evaluate(() => ({ id: window.__blickfeld.world.scene.id, outcome: window.__blickfeld.world.outcome.type, grade: document.getElementById('fb-grade').textContent, text: document.getElementById('fb-text').textContent })));
  await page.evaluate(() => window.__blickfeld.next());
}
await page.waitForFunction(() => window.__blickfeld.state === 'play');
await page.click('#btn-pause');
await page.waitForTimeout(300);
await shot('5-pause.png');
const info = await page.evaluate(() => { const r = window.__blickfeld.renderer; return { calls: r.r.info.render.calls, tris: r.r.info.render.triangles }; });
await page.setViewportSize({ width: 820, height: 1180 });
await page.waitForTimeout(300);
await shot('6-hochformat.png');
console.log(JSON.stringify({ results, ...info, errors }, null, 2));
await browser.close();
server.close();
