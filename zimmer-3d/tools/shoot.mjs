/**
 * QA-Werkzeug (Phase 6): rendert jede Kameraansicht headless und legt die
 * Screenshots unter shots/ ab, damit sie direkt gegen die Referenzfotos
 * gehalten werden koennen.
 *
 *   npm run build && npm run preview &   # oder: npm run dev
 *   npm run shots [-- --url http://localhost:5173 --only tuerwand]
 */
import { chromium } from 'playwright'
import { mkdir, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`)
  return i > -1 ? process.argv[i + 1] : fallback
}

const url = arg('url', 'http://localhost:4173')
const only = arg('only', null)
const outDir = resolve(root, arg('out', 'shots'))

// Ansichten direkt aus der Quelle lesen, damit die Liste nie auseinanderlaeuft.
const viewsSrc = await readFile(resolve(root, 'src/data/views.ts'), 'utf8')
const views = [...viewsSrc.matchAll(/^ {2}([a-z]+):\s*\{/gm)].map((m) => m[1])

await mkdir(outDir, { recursive: true })

// In vorbereiteten Umgebungen liegt Chromium bereits unter PLAYWRIGHT_BROWSERS_PATH,
// die Revision passt aber nicht zwangslaeufig zur installierten Playwright-Version.
function findChromium() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH
  if (!base) return undefined
  for (const dir of ['chromium', 'chromium-1194']) {
    for (const rel of ['chrome-linux/chrome', 'chrome']) {
      const p = resolve(base, dir, rel)
      if (existsSync(p)) return p
    }
  }
  return undefined
}

const browser = await chromium.launch({
  executablePath: arg('chromium', findChromium()),
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
  ],
})
const page = await browser.newPage({ viewport: { width: 1200, height: 1600 }, deviceScaleFactor: 1 })
page.on('pageerror', (e) => console.error('  ! Seitenfehler:', e.message))
page.on('console', (m) => m.type() === 'error' && console.error('  ! Konsole:', m.text()))

let failed = 0
for (const v of views) {
  if (only && v !== only) continue
  process.stdout.write(`  ${v} ... `)
  await page.goto(`${url}/?shot=1&view=${v}`, { waitUntil: 'load' })
  try {
    await page.waitForFunction(() => window.__ready === true, { timeout: 30000 })
  } catch {
    console.log('ZEITUEBERSCHREITUNG')
    failed++
    continue
  }
  await page.waitForTimeout(400)
  await page.screenshot({ path: resolve(outDir, `${v}.png`) })
  console.log('ok')
}

await browser.close()
console.log(failed ? `\n${failed} Ansicht(en) fehlgeschlagen.` : '\nAlle Ansichten gerendert.')
process.exit(failed ? 1 : 0)
