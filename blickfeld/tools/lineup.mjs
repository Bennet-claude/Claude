// Screenshots vom Figuren-Prüfstand (tools/lineup.html). Aufruf: node tools/lineup.mjs ausgabeordner [query ...]
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (_) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(process.argv[2] || path.join(root, '.lineup'));
const queries = process.argv.slice(3).length ? process.argv.slice(3) : ['view=side', 'view=front', 'view=close&i=3', 'view=eye'];
fs.mkdirSync(out, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript' };
const server = http.createServer((req, res) => {
  const file = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 700 } });
page.on('pageerror', (e) => console.log('pageerror', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log(m.text()); });
for (const [k, q] of queries.entries()) {
  await page.goto(`http://localhost:${server.address().port}/tools/lineup.html?${q}`);
  await page.waitForFunction(() => window.done, null, { timeout: 30000 });
  await page.screenshot({ path: path.join(out, `${k}-${q.replace(/[^a-z0-9]+/gi, '_')}.png`) });
}
await browser.close();
server.close();
