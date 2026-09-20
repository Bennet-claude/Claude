import { ROOM } from './room'

const B = ROOM.width
const L = ROOM.length

export type View = {
  label: string
  position: [number, number, number]
  target: [number, number, number]
  /** Referenzfoto, gegen das diese Ansicht geprueft wird. */
  ref?: string
}

export const VIEWS = {
  uebersicht: {
    label: 'Übersicht',
    position: [B - 0.45, 1.95, 0.25],
    target: [B / 2 - 0.2, 0.85, L - 0.9],
    ref: 'Foto 13 (Blick von der Nische zum Fenster)',
  },
  tuerwand: {
    label: 'Tür & Schrank',
    position: [B / 2 - 0.15, 1.5, L - 0.7],
    target: [B / 2 + 0.2, 1.15, 0],
    ref: 'Foto 11',
  },
  schrank: {
    label: 'Schrank',
    position: [B / 2 - 0.1, 1.45, 2.05],
    target: [B / 2 + 0.35, 1.2, -0.3],
    ref: 'Foto 12',
  },
  bettwand: {
    label: 'Bettwand',
    position: [0.45, 1.5, 2.55],
    target: [B, 0.9, 1.55],
    ref: 'Foto 3 / 4',
  },
  schreibtisch: {
    label: 'Schreibtisch',
    position: [B - 0.5, 1.45, 1.75],
    target: [0.25, 0.95, L - 0.35],
    ref: 'Foto 7',
  },
  tvwand: {
    label: 'TV-Wand',
    position: [B - 0.5, 1.5, 2.9],
    target: [0, 1.15, 1.2],
    ref: 'Foto 8 / 9',
  },
  fensterwand: {
    label: 'Fenster',
    position: [B / 2, 1.5, 1.3],
    target: [B / 2, 1.25, L],
    ref: 'Foto 6',
  },
  grundriss: {
    label: 'Grundriss',
    position: [B / 2, 7.4, L / 2 + 0.001],
    target: [B / 2, 0, L / 2],
  },
} satisfies Record<string, View>

export type ViewId = keyof typeof VIEWS
