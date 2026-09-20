import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { VIEWS } from '../data/views'
import { useScene } from '../state/useScene'
import { ROOM } from '../data/room'

/**
 * Freie Orbit-Steuerung plus animierte Kamerapresets.
 * Das Ziel wird im Raum gehalten, damit man sich nicht verliert.
 */
export function CameraRig() {
  const controls = useRef<OrbitControlsImpl>(null)
  const camera = useThree((s) => s.camera)
  const view = useScene((s) => s.view)
  const nonce = useScene((s) => s.nonce)

  const from = useRef(new THREE.Vector3())
  const fromTarget = useRef(new THREE.Vector3())
  const to = useRef(new THREE.Vector3())
  const toTarget = useRef(new THREE.Vector3())
  const t = useRef(1)

  useEffect(() => {
    const v = VIEWS[view]
    from.current.copy(camera.position)
    fromTarget.current.copy(controls.current?.target ?? new THREE.Vector3())
    to.current.set(v.position[0], v.position[1], v.position[2])
    toTarget.current.set(v.target[0], v.target[1], v.target[2])
    t.current = 0
    // beim allerersten Setzen hart springen
    if (nonce === 0) t.current = 1
    if (nonce === 0) {
      camera.position.copy(to.current)
      controls.current?.target.copy(toTarget.current)
      controls.current?.update()
    }
  }, [view, nonce, camera])

  useFrame((_, dt) => {
    if (t.current >= 1 || !controls.current) return
    t.current = Math.min(1, t.current + dt / 0.85)
    const e = 1 - Math.pow(1 - t.current, 3)
    camera.position.lerpVectors(from.current, to.current, e)
    controls.current.target.lerpVectors(fromTarget.current, toTarget.current, e)
    controls.current.update()
  })

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      panSpeed={0.7}
      rotateSpeed={0.7}
      zoomSpeed={0.8}
      minDistance={0.35}
      maxDistance={14}
      maxPolarAngle={Math.PI * 0.92}
      target={[ROOM.width / 2, 1, ROOM.length / 2]}
    />
  )
}
