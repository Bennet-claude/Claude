export type Opening = { u0: number; u1: number; y0: number; y1: number }
export type Rect = { u0: number; u1: number; y0: number; y1: number }

export type WallSpec = {
  id: string
  /** Punkt in Plankoordinaten (x,z), an dem u = 0 liegt. */
  origin: [number, number]
  /** Einheitsvektor in der Grundrissebene, entlang dessen u laeuft. */
  dir: [number, number]
  length: number
  height: number
  /** Einheitsnormale, die in den Raum zeigt. */
  normal: [number, number]
  color: string
  thickness: number
  openings?: Opening[]
}

/**
 * Zerlegt eine Wand mit Oeffnungen in volle Rechtecke (Brueustung, Sturz,
 * Pfeiler). Oeffnungen duerfen sich in u nicht ueberschneiden.
 */
export function splitWall(length: number, height: number, openings: Opening[] = []): Rect[] {
  const out: Rect[] = []
  const sorted = [...openings].sort((a, b) => a.u0 - b.u0)
  let cursor = 0
  for (const o of sorted) {
    if (o.u0 > cursor + 1e-6) out.push({ u0: cursor, u1: o.u0, y0: 0, y1: height })
    if (o.y0 > 1e-6) out.push({ u0: o.u0, u1: o.u1, y0: 0, y1: o.y0 })
    if (o.y1 < height - 1e-6) out.push({ u0: o.u0, u1: o.u1, y0: o.y1, y1: height })
    cursor = Math.max(cursor, o.u1)
  }
  if (cursor < length - 1e-6) out.push({ u0: cursor, u1: length, y0: 0, y1: height })
  return out
}

/** Y-Rotation, die lokales +X auf dir abbildet. */
export function wallYaw(dir: [number, number]) {
  return Math.atan2(-dir[1], dir[0])
}

/** Weltposition eines Punktes (u, y) auf der Wandinnenflaeche, um `off` entlang der Normalen versetzt. */
export function wallPoint(w: WallSpec, u: number, y: number, off = 0): [number, number, number] {
  return [w.origin[0] + w.dir[0] * u + w.normal[0] * off, y, w.origin[1] + w.dir[1] * u + w.normal[1] * off]
}
