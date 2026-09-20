import { create } from 'zustand'
import { VIEWS, type ViewId } from '../data/views'

type State = {
  view: ViewId
  setView: (v: ViewId) => void
  /** Zaehler, damit dieselbe Ansicht erneut angefahren werden kann. */
  nonce: number
}

export const useScene = create<State>((set, get) => ({
  view: (new URLSearchParams(location.search).get('view') as ViewId) in VIEWS
    ? (new URLSearchParams(location.search).get('view') as ViewId)
    : 'uebersicht',
  nonce: 0,
  setView: (v) => set({ view: v, nonce: get().nonce + 1 }),
}))
