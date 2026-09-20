import { VIEWS, type ViewId } from '../data/views'
import { useScene } from '../state/useScene'

export function ViewBar() {
  const view = useScene((s) => s.view)
  const setView = useScene((s) => s.setView)
  return (
    <nav className="viewbar">
      {(Object.keys(VIEWS) as ViewId[]).map((id) => (
        <button key={id} data-active={id === view} onClick={() => setView(id)}>
          {VIEWS[id].label}
        </button>
      ))}
    </nav>
  )
}
