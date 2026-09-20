import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { useThree } from '@react-three/fiber'
import { ROOM } from '../data/room'

/**
 * Tageslicht-Setup. Auf allen Referenzfotos ist die Fensterwand (Wand C)
 * die einzige nennenswerte Lichtquelle, der Himmel ist bedeckt:
 * weiches, diffuses Licht, keine harten Schlagschatten.
 */
export function Lighting() {
  const scene = useThree((s) => s.scene)

  const env = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = 512
    c.height = 256
    const g = c.getContext('2d')!
    const grad = g.createLinearGradient(0, 0, 0, 256)
    grad.addColorStop(0, '#f2f6fa')
    grad.addColorStop(0.45, '#cfd8e1')
    grad.addColorStop(0.55, '#cfcbc3')
    grad.addColorStop(1, '#bdb8af')
    g.fillStyle = grad
    g.fillRect(0, 0, 512, 256)
    // helles Fenster-Segment
    const spot = g.createRadialGradient(150, 100, 10, 150, 100, 150)
    spot.addColorStop(0, 'rgba(255,255,255,0.95)')
    spot.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = spot
    g.fillRect(0, 0, 512, 256)
    const t = new THREE.CanvasTexture(c)
    t.mapping = THREE.EquirectangularReflectionMapping
    t.colorSpace = THREE.SRGBColorSpace
    return t
  }, [])

  useEffect(() => {
    scene.environment = env
    return () => {
      scene.environment = null
    }
  }, [scene, env])

  const cx = ROOM.width / 2

  return (
    <>
      {/* Der Bodenbounce faerbte die Decke vorher deutlich zu warm ab. */}
      <hemisphereLight args={['#eaf0f6', '#e2ded8', 1.0]} />
      {/* Aufhellung der Decke (Bounce vom Boden und von den Waenden) */}
      <directionalLight position={[ROOM.width / 2, -2, ROOM.length / 2]} intensity={0.45} color="#fbf9f5" />
      {/* Hauptlicht durch die Fenster */}
      <directionalLight
        position={[cx + 0.6, 3.0, ROOM.length + 6]}
        intensity={0.5}
        color="#fbfaf6"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      >
        <orthographicCamera attach="shadow-camera" args={[-3.5, 3.5, 4.5, -4.5, 1, 20]} />
      </directionalLight>
      {/* weiche Aufhellung, damit die Tuerwand nicht absaeuft */}
      <directionalLight position={[cx, 1.7, ROOM.length + 3]} intensity={0.26} color="#eef2f6" />
      <directionalLight position={[cx - 2.5, 2.4, ROOM.length + 4]} intensity={0.13} color="#e9eef4" />
      <directionalLight position={[cx, 2.2, -4]} intensity={0.16} color="#e8eef4" />
    </>
  )
}
