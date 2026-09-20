import { Scene } from './scene/Scene'
import { ViewBar } from './ui/ViewBar'
import { ROOM } from './data/room'
import './ui/styles.css'

const shotMode = new URLSearchParams(location.search).has('shot')

export default function App() {
  return (
    <div className="app">
      <Scene />
      {!shotMode && (
        <>
          <div className="badge">
            <b>Zimmer 3D</b> · M1 Raumhülle · {ROOM.width.toFixed(2)} × {ROOM.length.toFixed(2)} × {ROOM.height.toFixed(2)} m
          </div>
          <ViewBar />
        </>
      )}
    </div>
  )
}
