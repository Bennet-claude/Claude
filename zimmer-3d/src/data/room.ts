/**
 * Raumdefinition - EINZIGE WAHRHEITSQUELLE fuer die Geometrie.
 *
 * Koordinatensystem: Rechtshaendig, Y = oben, Einheit = Meter.
 * Ursprung (0,0,0) = Bodenecke Wand A (Tuerwand) x Wand B (TV-/Schreibtischwand).
 *   +X laeuft von Wand B zu Wand D (Bettwand)
 *   +Z laeuft von Wand A zu Wand C (Fensterwand)
 *
 * Konfidenz je Wert:
 *   [S] sicher aus Fotos     [W] wahrscheinlich / hergeleitet     [U] unbekannt
 *
 * HERLEITUNG DER HAUPTMASSE (Foto-Photogrammetrie mit bekannten Referenzen):
 *   Referenz 1: Innentuer, Standardblatt 0.86 m breit.
 *   Referenz 2: Kleiderschrank, 3 gleich breite Tueren -> 3 x 0.50 = 1.50 m.
 *   Referenz 3: Kallax 1x4 = 1.47 m hoch, 0.42 m breit.
 *
 *   Breite  B  = Tuerwandblock (0.05 + 0.98 Zarge + 0.17) + Nischenbreite 1.50 = 2.70
 *   Hoehe   H  = Schrankhoehe 2.01 + gemessener Luftspalt darueber ~0.46 = 2.47 -> 2.50
 *   Laenge  L  = Wand B: freie Wand 0.90 + Kommode 0.80 + Kallax 0.77 + Luecke 0.28
 *                + Schreibtisch 1.25 = 4.00
 *   Gegenprobe Wand D: Bett 1.89 + Luecke 0.06 + Sofa 1.45 + Rest 0.60 = 4.00  [passt]
 */

export const ROOM = {
  /** Raumbreite Wand B -> Wand D. [W] +/- 0.15 */
  width: 2.7,
  /** Raumlaenge Wand A -> Wand C. [S] iPhone-Messung "etwas mehr als 4 m",
   *  Gegenprobe ueber 58 gezaehlte Dielenreihen a ~7.1 cm = 4.12 m. */
  length: 4.1,
  /** Deckenhoehe. [W] +/- 0.05 */
  height: 2.5,
  /** Innenwandstaerke (nur Darstellung). */
  wallThickness: 0.14,
  /**
   * Aussenwand (Wand C). Die Fensterlaibungen auf den Fotos sind deutlich
   * tiefer als eine Innenwand - daher eigene Staerke. [W]
   */
  exteriorThickness: 0.32,

  /**
   * Schranknische: Ruecksprung in Wand A, direkt an Wand D angrenzend.
   * Aus Foto 11/12 zweifelsfrei belegt: Tuer sitzt in einem vorspringenden
   * Wandblock, rechts daneben springt die Wand zurueck, der Schrank fuellt
   * die Nische vollstaendig aus und stoesst rechts an Wand D. [S Existenz, W Masse]
   */
  niche: {
    /** X-Position der linken Nischenkante (= Breite des Tuerwandblocks). */
    x0: 1.2,
    /** Nischentiefe in -Z (Schranktiefe). */
    depth: 0.6,
  },

  /** Sockelleiste. [W] */
  baseboard: { height: 0.06, depth: 0.016 },
} as const

/** Tuer in Wand A, Baender auf der Seite zu Wand B, oeffnet nach innen. [S] */
export const DOOR = {
  /** X der linken Kante der Rohbauoeffnung. [W] */
  x: 0.14,
  width: 0.86,
  height: 2.01,
  /** Sichtbare Zargenbreite. [W] */
  frameWidth: 0.06,
  frameDepth: 0.02,
  /** Poster (Memphis Grizzlies) auf dem Tuerblatt. [S] */
  poster: { width: 0.46, height: 0.35, centerY: 1.62 },
} as const

/**
 * Zwei Fenster in Wand C, dazwischen das Kallax-Regal.
 * x = linke Kante der Oeffnung (von Wand B aus gemessen).
 * "b" = Fenster auf der Wand-B-Seite (freier Ausblick, Jalousie)
 * "d" = Fenster auf der Wand-D-Seite (Rollladen unten)
 */
export const WINDOWS = [
  { id: 'fenster-b', x: 0.2, width: 0.9, sill: 0.95, height: 1.1 },
  { id: 'fenster-d', x: 1.62, width: 0.9, sill: 0.95, height: 1.1 },
] as const

/** Laibungstiefe bis zum Blendrahmen, Fensterbank aus hellem Holz. [S Existenz, W Masse] */
export const WINDOW_DETAIL = {
  revealDepth: 0.17,
  sillThickness: 0.035,
  sillOverhang: 0.05,
  frameWidth: 0.06,
} as const

/** Flachheizkoerper unter beiden Fenstern. [S] */
export const RADIATOR = {
  height: 0.6,
  depth: 0.1,
  floorGap: 0.14,
  /** Schmaler als die Fensteroeffnung. */
  inset: 0.06,
} as const

/** Runde weisse Deckenleuchte. [S aus Foto 11/14], Position [W] */
export const CEILING_LAMP = { x: 1.35, z: 1.75, diameter: 0.33, depth: 0.11 } as const

/** Rauchmelder an der Decke. [S] */
export const SMOKE_DETECTOR = { x: 0.95, z: 3.15, diameter: 0.11 } as const

/** Schalter + Steckdose rechts neben der Tuer, Wand A. [S] */
export const SWITCHES = [
  { x: 1.06, y: 1.05, kind: 'switch' as const },
  { x: 1.06, y: 0.93, kind: 'socket' as const },
]

/**
 * Farben. Die Tuerwand und die Nische wirken auf allen Fotos deutlich
 * heller als Wand B/C/D - noch nicht abschliessend geklaert, ob eigener
 * Anstrich oder nur Gegenlicht. Umschaltbar ueber WALL_COLORS.uniform. [U]
 */
export const COLORS = {
  wall: '#dee4df',
  wallBright: '#eef0ec',
  ceiling: '#fafaf8',
  floorBase: '#9a6538',
  trim: '#f3f3f0',
  sill: '#c9ab80',
  radiator: '#f0f0ee',
} as const

export const WALL_COLORS = { uniform: false }

/** Innenpolygon des Raums inkl. Nische, im Uhrzeigersinn (x, z). */
export function roomOutline(): [number, number][] {
  const { width: B, length: L, niche } = ROOM
  return [
    [0, 0],
    [niche.x0, 0],
    [niche.x0, -niche.depth],
    [B, -niche.depth],
    [B, L],
    [0, L],
  ]
}
