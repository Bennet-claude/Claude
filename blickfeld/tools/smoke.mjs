// Rauchtest im Headless-Chromium: lädt die Seite, spielt die Szene an, macht Screenshots.
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
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml' };
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

await page.goto(`http://localhost:${port}/?debug=1`);
await page.waitForFunction(() => window.__blickfeld && window.__blickfeld.renderer.fps > 0, null, { timeout: 30000 });
await page.waitForTimeout(800);
await page.screenshot({ path: path.join(out, '1-start.png') });

// Szene starten, auf halbes Tempo, kurz vor der Annahme nach rechts schauen
await page.click('#btn-start');
await page.waitForTimeout(1500);
await page.screenshot({ path: path.join(out, '2-wahrnehmen.png') });
await page.evaluate(() => {
  const { fp, world } = window.__blickfeld;
  const r8 = world.idx.R8;
  fp.target = Math.atan2(world.py[r8] - world.py[world.user], world.px[r8] - world.px[world.user]);
});
await page.waitForTimeout(700);
await page.screenshot({ path: path.join(out, '3-scan-rechts.png') });
await page.evaluate(() => {
  const { fp, world } = window.__blickfeld;
  fp.target = Math.atan2(world.ball.y - world.py[world.user], world.ball.x - world.px[world.user]);
});
await page.waitForFunction(() => window.__blickfeld.world.phase === 'decide', null, { timeout: 30000, polling: 16 });
// Pass auf die 10 sofort über die Simulation auslösen (Screenshots dauern im Software-Rendering lange)
await page.evaluate(() => { const { world } = window.__blickfeld; world.input({ type: 'pass', target: world.idx.R8 }); });
await page.screenshot({ path: path.join(out, '4-annahme.png') });
await page.waitForTimeout(900);
await page.screenshot({ path: path.join(out, '5-aufloesung.png') });
await page.waitForFunction(() => window.__blickfeld.state === 'result', null, { timeout: 30000 });
await page.waitForTimeout(300);
await page.screenshot({ path: path.join(out, '6-ergebnis.png') });
const outcome = await page.evaluate(() => window.__blickfeld.world.outcome.type);
const info = await page.evaluate(() => { const r = window.__blickfeld.renderer; return { calls: r.r.info.render.calls, tris: r.r.info.render.triangles }; });

// Hochformat-Hinweis
await page.setViewportSize({ width: 820, height: 1180 });
await page.waitForTimeout(300);
await page.screenshot({ path: path.join(out, '7-hochformat.png') });

console.log(JSON.stringify({ outcome, ...info, errors }, null, 2));
await browser.close();
server.close();
