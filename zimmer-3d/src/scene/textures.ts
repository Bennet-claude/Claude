import * as THREE from 'three'

/** Deterministischer PRNG, damit Renderings reproduzierbar bleiben (QA-Vergleich). */
function rng(seed: number) {
  let s = seed >>> 0
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
}

export const PLANK = { length: 1.29, width: 0.193, strips: 3 }
/** Kachelgroesse in Metern: 2 Dielen laengs, 6 Dielen quer. */
export const FLOOR_TILE = { w: PLANK.width * 6, l: PLANK.length * 2 }

/**
 * Prozedurales Laminat in Schiffsboden-Optik (3 Streifen pro Diele,
 * versetzte Kurzstaebe), wie auf den Referenzfotos.
 */
export function makeFloorTexture(): { map: THREE.Texture; rough: THREE.Texture } {
  const px = 2048
  const aspect = FLOOR_TILE.l / FLOOR_TILE.w
  const w = px
  const h = Math.round(px * aspect)
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')!
  const r = rng(20260920)

  const ppmX = w / FLOOR_TILE.w
  const ppmY = h / FLOOR_TILE.l

  g.fillStyle = '#8b5f37'
  g.fillRect(0, 0, w, h)

  const cols = Math.round(FLOOR_TILE.w / PLANK.width)
  const rows = Math.round(FLOOR_TILE.l / PLANK.length)

  for (let cx = 0; cx < cols; cx++) {
    // Laengsversatz der Dielenreihen
    const offset = ((cx % 2) * 0.5 + r() * 0.12) * PLANK.length
    for (let ry = -1; ry <= rows; ry++) {
      const y0 = (ry * PLANK.length + offset) * ppmY
      const x0 = cx * PLANK.width * ppmX
      const pw = PLANK.width * ppmX
      const ph = PLANK.length * ppmY

      for (let s = 0; s < PLANK.strips; s++) {
        const sw = pw / PLANK.strips
        const sx = x0 + s * sw
        // jeder Streifen aus 2-3 Kurzstaeben
        const segs = 2 + Math.floor(r() * 2)
        let acc = 0
        for (let k = 0; k < segs; k++) {
          const frac = k === segs - 1 ? 1 - acc : (1 / segs) * (0.7 + r() * 0.6)
          const sy = y0 + acc * ph
          const sh = Math.max(4, frac * ph)
          acc += frac
          const tint = 0.82 + r() * 0.34
          const R = Math.min(255, 139 * tint)
          const G = Math.min(255, 95 * tint)
          const B = Math.min(255, 55 * tint)
          g.fillStyle = `rgb(${R | 0},${G | 0},${B | 0})`
          g.fillRect(sx, sy, sw, sh)
          // Maserung
          g.globalAlpha = 0.1
          for (let i = 0; i < 14; i++) {
            g.strokeStyle = r() > 0.5 ? '#5d3a1c' : '#c69460'
            g.lineWidth = 0.6 + r()
            g.beginPath()
            const gx = sx + r() * sw
            g.moveTo(gx, sy)
            g.bezierCurveTo(gx + (r() - 0.5) * 6, sy + sh * 0.35, gx + (r() - 0.5) * 6, sy + sh * 0.7, gx + (r() - 0.5) * 4, sy + sh)
            g.stroke()
          }
          g.globalAlpha = 1
          // Querfuge zwischen den Kurzstaeben
          g.fillStyle = 'rgba(60,34,14,0.45)'
          g.fillRect(sx, sy + sh - 1.5, sw, 1.5)
        }
        // Laengsfuge zwischen den Streifen
        g.fillStyle = 'rgba(60,34,14,0.35)'
        g.fillRect(sx, y0, 1.2, ph)
      }
      // Dielenfuge
      g.fillStyle = 'rgba(45,25,10,0.55)'
      g.fillRect(x0, y0, 2, ph)
    }
  }

  const map = new THREE.CanvasTexture(c)
  map.wrapS = map.wrapT = THREE.RepeatWrapping
  map.colorSpace = THREE.SRGBColorSpace
  map.anisotropy = 8

  // Rauheitskarte: Fugen matter als die Flaeche
  const rc = document.createElement('canvas')
  rc.width = w
  rc.height = h
  const rg2 = rc.getContext('2d')!
  rg2.drawImage(c, 0, 0)
  rg2.globalCompositeOperation = 'saturation'
  rg2.fillStyle = '#808080'
  rg2.fillRect(0, 0, w, h)
  const rough = new THREE.CanvasTexture(rc)
  rough.wrapS = rough.wrapT = THREE.RepeatWrapping
  rough.anisotropy = 4

  return { map, rough }
}

/** Feiner Putz/Raufaser als Bumpmap fuer Waende und Decke. */
export function makePlasterBump(): THREE.Texture {
  const n = 512
  const c = document.createElement('canvas')
  c.width = c.height = n
  const g = c.getContext('2d')!
  const img = g.createImageData(n, n)
  const r = rng(77)
  for (let i = 0; i < n * n; i++) {
    const v = 128 + (r() - 0.5) * 90
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v
    img.data[i * 4 + 3] = 255
  }
  g.putImageData(img, 0, 0)
  // leichte Klumpung, damit es nach Putz und nicht nach Rauschen aussieht
  g.globalAlpha = 0.5
  g.filter = 'blur(1px)'
  g.drawImage(c, 0, 0)
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(6, 6)
  return t
}
