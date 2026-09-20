import { Suspense, useEffect } from 'react'
import * as THREE from 'three'
import { Canvas, useThree } from '@react-three/fiber'
import { Room } from './Room'
import { Lighting } from './Lighting'
import { CameraRig } from './CameraRig'
import { Postprocessing } from './Postprocessing'
import { ROOM } from '../data/room'

/** Signalisiert dem Screenshot-Werkzeug, dass gerendert wurde. */
function ReadySignal() {
  const gl = useThree((s) => s.gl)
  useEffect(() => {
    let n = 0
    const tick = () => {
      if (++n > 8) {
        ;(window as unknown as { __ready?: boolean }).__ready = true
        return
      }
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, [gl])
  return null
}

export function Scene({ quality = 'hoch' }: { quality?: 'hoch' | 'niedrig' }) {
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      gl={{ antialias: true, preserveDrawingBuffer: true }}
      camera={{ fov: 62, near: 0.05, far: 60, position: [ROOM.width / 2, 1.5, ROOM.length / 2] }}
      onCreated={({ gl, scene }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping
        gl.toneMappingExposure = 1.0
        scene.background = new THREE.Color('#1c1f22')
      }}
    >
      <Suspense fallback={null}>
        <Lighting />
        <Room />
        <CameraRig />
        <Postprocessing quality={quality} />
        <ReadySignal />
      </Suspense>
    </Canvas>
  )
}
