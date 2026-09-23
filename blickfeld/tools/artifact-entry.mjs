// Erzeugt aus index.html die Einstiegsdatei für einen claude.ai-Link (Artifact).
// Das Artifact liefert Doctype, <head> mit charset/viewport und <body> selbst mit,
// deshalb werden diese Hüllen entfernt. Alle anderen Dateien werden 1:1 veröffentlicht.
// Aufruf: node tools/artifact-entry.mjs <ausgabedatei>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = process.argv[2];
if (!out) { console.error('Ausgabedatei fehlt'); process.exit(1); }
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
html = html
  .replace(/<!doctype html>\s*/i, '')
  .replace(/<html[^>]*>\s*/i, '')
  .replace(/<\/html>\s*/i, '')
  .replace(/<head>\s*/i, '')
  .replace(/<\/head>\s*/i, '')
  .replace(/<body>\s*/i, '')
  .replace(/<\/body>\s*/i, '')
  .replace(/<meta charset="utf-8">\s*/i, '')
  .replace(/<meta name="viewport"[^>]*>\s*/i, '');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);

// Liste der mitzuveröffentlichenden Dateien (veröffentlichter Pfad = Pfad im Projekt)
const files = [];
const walk = (dir) => {
  for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) walk(rel);
    else if (/\.(js|css)$/.test(e.name)) files.push(rel);
  }
};
for (const d of ['css', 'src', 'scenes', 'vendor/three']) walk(d);
console.log(JSON.stringify(files));
