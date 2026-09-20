import { useMemo } from 'react'
import * as THREE from 'three'
import { RoundedBox } from '@react-three/drei'
import {
  ROOM, DOOR, WINDOWS, WINDOW_DETAIL, RADIATOR, COLORS, WALL_COLORS,
  CEILING_LAMP, SMOKE_DETECTOR, SWITCHES, roomOutline,
} from '../data/room'
import { makeFloorTexture, makePlasterBump, FLOOR_TILE } from './textures'
import { splitWall, wallYaw, wallPoint, type WallSpec } from './walls'

const T = ROOM.wallThickness
const TC = ROOM.exteriorThickness

/** Alle Waende inkl. Nischenrueckspruung. */
function useWalls(): WallSpec[] {
  return useMemo(() => {
    const { width: B, length: L, height: H, niche } = ROOM
    const plain = WALL_COLORS.uniform ? COLORS.wall : COLORS.wallBright

    const windowOpenings = WINDOWS.map((w) => ({
      // Wand C laeuft von Wand B (u=0) zu Wand D (u=B) -> u = x
      u0: w.x, u1: w.x + w.width, y0: w.sill, y1: w.sill + w.height,
    }))

    return [
      {
        id: 'B', origin: [0, 0], dir: [0, 1], length: L, height: H,
        normal: [1, 0], color: COLORS.wall, thickness: T,
      },
      {
        id: 'C', origin: [0, L], dir: [1, 0], length: B, height: H,
        normal: [0, -1], color: COLORS.wall, thickness: TC, openings: windowOpenings,
      },
      {
        id: 'D', origin: [B, L], dir: [0, -1], length: L + niche.depth, height: H,
        normal: [-1, 0], color: COLORS.wall, thickness: T,
      },
      // Wand A, vorspringender Tuerblock
      {
        id: 'A', origin: [0, 0], dir: [1, 0], length: niche.x0, height: H,
        normal: [0, 1], color: plain, thickness: T,
        openings: [{ u0: DOOR.x, u1: DOOR.x + DOOR.width, y0: 0, y1: DOOR.height }],
      },
      // linke Nischenwange
      {
        id: 'N-links', origin: [niche.x0, 0], dir: [0, -1], length: niche.depth, height: H,
        normal: [1, 0], color: plain, thickness: T,
      },
      // Nischenrueckwand
      {
        id: 'N-rueck', origin: [niche.x0, -niche.depth], dir: [1, 0], length: B - niche.x0, height: H,
        normal: [0, 1], color: plain, thickness: T,
      },
    ]
  }, [])
}

function Wall({ w, bump }: { w: WallSpec; bump: THREE.Texture }) {
  const yaw = wallYaw(w.dir)
  const t = w.thickness
  const rects = splitWall(w.length, w.height, w.openings as never)
  return (
    <group>
      {rects.map((r, i) => {
        const u = (r.u0 + r.u1) / 2
        const p = wallPoint(w, u, (r.y0 + r.y1) / 2, -t / 2)
        return (
          <mesh key={i} position={p} rotation={[0, yaw, 0]} castShadow receiveShadow>
            <boxGeometry args={[r.u1 - r.u0, r.y1 - r.y0, t]} />
            <meshStandardMaterial color={w.color} roughness={0.96} bumpMap={bump} bumpScale={0.0015} />
          </mesh>
        )
      })}
      {/* Laibungen weiss ausgekleidet */}
      {(w.openings ?? []).map((o, i) => (
        <Reveal key={`r${i}`} w={w} o={o} />
      ))}
      {/* Sockelleiste, unterbrochen an Oeffnungen die bis zum Boden gehen */}
      {splitWall(w.length, ROOM.baseboard.height,
        (w.openings ?? []).filter((o) => o.y0 < 1e-6) as never
      ).map((r, i) => (
        <mesh
          key={`b${i}`}
          position={wallPoint(w, (r.u0 + r.u1) / 2, ROOM.baseboard.height / 2, ROOM.baseboard.depth / 2)}
          rotation={[0, yaw, 0]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[r.u1 - r.u0, ROOM.baseboard.height, ROOM.baseboard.depth]} />
          <meshStandardMaterial color={COLORS.trim} roughness={0.55} />
        </mesh>
      ))}
    </group>
  )
}

/** Weisse Auskleidung einer Wandoeffnung (Laibung). */
function Reveal({ w, o }: { w: WallSpec; o: { u0: number; u1: number; y0: number; y1: number } }) {
  const yaw = wallYaw(w.dir)
  const t = w.thickness
  const d = 0.012
  const mat = <meshStandardMaterial color={COLORS.trim} roughness={0.6} />
  const uMid = (o.u0 + o.u1) / 2
  const yMid = (o.y0 + o.y1) / 2
  const width = o.u1 - o.u0
  const height = o.y1 - o.y0
  return (
    <group>
      <mesh position={wallPoint(w, uMid, o.y1 - d / 2, -t / 2)} rotation={[0, yaw, 0]} receiveShadow>
        <boxGeometry args={[width, d, t]} />{mat}
      </mesh>
      {o.y0 > 1e-6 && (
        <mesh position={wallPoint(w, uMid, o.y0 + d / 2, -t / 2)} rotation={[0, yaw, 0]} receiveShadow>
          <boxGeometry args={[width, d, t]} />{mat}
        </mesh>
      )}
      <mesh position={wallPoint(w, o.u0 + d / 2, yMid, -t / 2)} rotation={[0, yaw, 0]} receiveShadow>
        <boxGeometry args={[d, height, t]} />{mat}
      </mesh>
      <mesh position={wallPoint(w, o.u1 - d / 2, yMid, -t / 2)} rotation={[0, yaw, 0]} receiveShadow>
        <boxGeometry args={[d, height, t]} />{mat}
      </mesh>
    </group>
  )
}

function Floor() {
  const { map, rough } = useMemo(() => makeFloorTexture(), [])
  const geom = useMemo(() => {
    const shape = new THREE.Shape()
    const pts = roomOutline()
    // Shape liegt in XY, wird um -90 Grad um X gedreht -> shape.y entspricht -world z
    shape.moveTo(pts[0][0], -pts[0][1])
    for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i][0], -pts[i][1])
    shape.closePath()
    return new THREE.ShapeGeometry(shape)
  }, [])

  map.repeat.set(1 / FLOOR_TILE.w, 1 / FLOOR_TILE.l)
  rough.repeat.copy(map.repeat)

  return (
    <mesh geometry={geom} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <meshStandardMaterial map={map} roughnessMap={rough} roughness={0.58} metalness={0} />
    </mesh>
  )
}

function Ceiling({ bump }: { bump: THREE.Texture }) {
  const geom = useMemo(() => {
    const shape = new THREE.Shape()
    const pts = roomOutline()
    shape.moveTo(pts[0][0], -pts[0][1])
    for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i][0], -pts[i][1])
    shape.closePath()
    return new THREE.ShapeGeometry(shape)
  }, [])
  return (
    <mesh geometry={geom} rotation={[-Math.PI / 2, 0, 0]} position={[0, ROOM.height, 0]} receiveShadow>
      <meshStandardMaterial color={COLORS.ceiling} roughness={0.98} bumpMap={bump} bumpScale={0.002} side={THREE.BackSide} />
    </mesh>
  )
}

function Door() {
  // Wand A: u = x, Normale = +Z. Baender auf der Wand-B-Seite (kleines x).
  const leafW = DOOR.width - 2 * 0.005
  const leafH = DOOR.height - 0.005
  const cx = DOOR.x + DOOR.width / 2
  return (
    // Wand A liegt zwischen z = -T und z = 0, die Zarge sitzt mittig darin.
    <group position={[0, 0, -T / 2]}>
      {/* Zarge */}
      {[
        { p: [DOOR.x - DOOR.frameWidth / 2, DOOR.height / 2, 0] as const, a: [DOOR.frameWidth, DOOR.height + DOOR.frameWidth, T + 2 * DOOR.frameDepth] as const },
        { p: [DOOR.x + DOOR.width + DOOR.frameWidth / 2, DOOR.height / 2, 0] as const, a: [DOOR.frameWidth, DOOR.height + DOOR.frameWidth, T + 2 * DOOR.frameDepth] as const },
        { p: [cx, DOOR.height + DOOR.frameWidth / 2, 0] as const, a: [DOOR.width + 2 * DOOR.frameWidth, DOOR.frameWidth, T + 2 * DOOR.frameDepth] as const },
      ].map((f, i) => (
        <mesh key={i} position={[f.p[0], f.p[1], f.p[2]]} castShadow receiveShadow>
          <boxGeometry args={f.a as unknown as [number, number, number]} />
          <meshStandardMaterial color={COLORS.trim} roughness={0.45} />
        </mesh>
      ))}
      {/* Tuerblatt, buendig in der Zarge */}
      <RoundedBox args={[leafW, leafH, 0.04]} radius={0.004} smoothness={2} position={[cx, leafH / 2, 0.02]} castShadow receiveShadow>
        <meshStandardMaterial color="#f5f4f0" roughness={0.38} />
      </RoundedBox>
      {/* Grizzlies-Poster (Platzhalterfarbe bis Textur aus Referenzfoto vorliegt) */}
      <mesh position={[cx - 0.03, DOOR.poster.centerY, 0.041]}>
        <planeGeometry args={[DOOR.poster.width, DOOR.poster.height]} />
        <meshStandardMaterial color="#20476e" roughness={0.6} />
      </mesh>
      {/* Druecker + Schliesszylinder, Griffseite = grosses x */}
      <group position={[DOOR.x + DOOR.width - 0.06, 1.05, 0.04]}>
        <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.026, 0.026, 0.014, 20]} />
          <meshStandardMaterial color="#b9bcc0" metalness={0.85} roughness={0.28} />
        </mesh>
        <mesh position={[-0.055, 0, 0.032]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <capsuleGeometry args={[0.012, 0.1, 4, 12]} />
          <meshStandardMaterial color="#b9bcc0" metalness={0.85} roughness={0.28} />
        </mesh>
      </group>
      <mesh position={[DOOR.x + DOOR.width - 0.06, 0.94, 0.042]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.016, 0.016, 0.008, 16]} />
        <meshStandardMaterial color="#9fa3a7" metalness={0.8} roughness={0.35} />
      </mesh>
      {/* Baender */}
      {[0.3, 1.65].map((y) => (
        <mesh key={y} position={[DOOR.x + 0.005, y, 0.022]} castShadow>
          <cylinderGeometry args={[0.011, 0.011, 0.075, 12]} />
          <meshStandardMaterial color="#c2c5c8" metalness={0.8} roughness={0.35} />
        </mesh>
      ))}
    </group>
  )
}

function Window({ w }: { w: (typeof WINDOWS)[number] }) {
  const { revealDepth, sillThickness, sillOverhang, frameWidth } = WINDOW_DETAIL
  // Blendrahmen sitzt um die Laibungstiefe zurueckversetzt in der Aussenwand
  const z = ROOM.length + revealDepth
  const cx = w.x + w.width / 2
  const cy = w.sill + w.height / 2
  return (
    <group>
      {/* Fensterbank */}
      <RoundedBox
        args={[w.width + 0.12, sillThickness, revealDepth + sillOverhang]}
        radius={0.006}
        smoothness={2}
        position={[cx, w.sill - sillThickness / 2, ROOM.length + (revealDepth - sillOverhang) / 2]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color={COLORS.sill} roughness={0.55} />
      </RoundedBox>
      {/* Blendrahmen */}
      {[
        [cx, w.sill + frameWidth / 2, w.width, frameWidth],
        [cx, w.sill + w.height - frameWidth / 2, w.width, frameWidth],
        [w.x + frameWidth / 2, cy, frameWidth, w.height],
        [w.x + w.width - frameWidth / 2, cy, frameWidth, w.height],
      ].map((f, i) => (
        <mesh key={i} position={[f[0], f[1], z]} castShadow receiveShadow>
          <boxGeometry args={[f[2], f[3], 0.07]} />
          <meshStandardMaterial color="#f6f6f3" roughness={0.35} />
        </mesh>
      ))}
      {/* Glas */}
      <mesh position={[cx, cy, z - 0.012]}>
        <planeGeometry args={[w.width - 2 * frameWidth, w.height - 2 * frameWidth]} />
        <meshPhysicalMaterial
          color="#dbe7ea" roughness={0.06} metalness={0} transparent opacity={0.22}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Rollladenkasten-Blende, buendig in der Laibung */}
      <mesh position={[cx, w.sill + w.height - 0.035, ROOM.length + revealDepth / 2 + 0.02]}>
        <boxGeometry args={[w.width - 0.008, 0.07, revealDepth - 0.04]} />
        <meshStandardMaterial color="#f1f1ee" roughness={0.5} />
      </mesh>
      <Radiator w={w} />
    </group>
  )
}

function Radiator({ w }: { w: (typeof WINDOWS)[number] }) {
  const width = w.width - 2 * RADIATOR.inset
  const cx = w.x + w.width / 2
  const z = ROOM.length - RADIATOR.depth / 2
  const fins = Math.max(6, Math.round(width / 0.033))
  return (
    <group>
      <RoundedBox
        args={[width, RADIATOR.height, RADIATOR.depth]}
        radius={0.012}
        smoothness={2}
        position={[cx, RADIATOR.floorGap + RADIATOR.height / 2, z]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color={COLORS.radiator} roughness={0.5} />
      </RoundedBox>
      {Array.from({ length: fins }, (_, i) => {
        const x = cx - width / 2 + ((i + 0.5) * width) / fins
        return (
          <mesh key={i} position={[x, RADIATOR.floorGap + RADIATOR.height / 2, z - RADIATOR.depth / 2 + 0.003]}>
            <boxGeometry args={[0.006, RADIATOR.height - 0.06, 0.004]} />
            <meshStandardMaterial color="#dcdcd9" roughness={0.7} />
          </mesh>
        )
      })}
      {/* Fuesse / Wandkonsolen */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[cx + s * width * 0.35, RADIATOR.floorGap / 2, ROOM.length - 0.03]}>
          <boxGeometry args={[0.02, RADIATOR.floorGap, 0.03]} />
          <meshStandardMaterial color="#d8d8d5" roughness={0.6} />
        </mesh>
      ))}
    </group>
  )
}

function CeilingLamp() {
  return (
    <group position={[CEILING_LAMP.x, ROOM.height - CEILING_LAMP.depth / 2, CEILING_LAMP.z]}>
      <mesh scale={[1, CEILING_LAMP.depth / CEILING_LAMP.diameter, 1]} castShadow>
        <sphereGeometry args={[CEILING_LAMP.diameter / 2, 32, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2]} />
        <meshStandardMaterial color="#fbfbf8" roughness={0.65} emissive="#fff6e2" emissiveIntensity={0.12} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, CEILING_LAMP.depth / 2 - 0.005, 0]}>
        <cylinderGeometry args={[CEILING_LAMP.diameter / 2, CEILING_LAMP.diameter / 2, 0.01, 32]} />
        <meshStandardMaterial color="#f0f0ed" roughness={0.7} />
      </mesh>
    </group>
  )
}

function SmokeDetector() {
  return (
    <mesh position={[SMOKE_DETECTOR.x, ROOM.height - 0.018, SMOKE_DETECTOR.z]}>
      <cylinderGeometry args={[SMOKE_DETECTOR.diameter / 2, SMOKE_DETECTOR.diameter / 2 - 0.008, 0.036, 24]} />
      <meshStandardMaterial color="#f4f4f1" roughness={0.75} />
    </mesh>
  )
}

function Switches() {
  return (
    <group>
      {SWITCHES.map((s, i) => (
        <RoundedBox key={i} args={[0.082, 0.082, 0.011]} radius={0.006} smoothness={2} position={[s.x, s.y, 0.0055]} castShadow>
          <meshStandardMaterial color="#fafaf7" roughness={0.42} />
        </RoundedBox>
      ))}
    </group>
  )
}

/**
 * Aussenkulisse: Himmel, Baumreihe, Hecke. Nur Hintergrund fuer den
 * Fensterausblick - entspricht grob dem, was auf Foto 7 zu sehen ist.
 */
function Outside() {
  const tex = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = 1024
    c.height = 512
    const g = c.getContext('2d')!
    const sky = g.createLinearGradient(0, 0, 0, 512)
    sky.addColorStop(0, '#dfe8ef')
    sky.addColorStop(0.45, '#eef2f5')
    g.fillStyle = sky
    g.fillRect(0, 0, 1024, 512)
    // Baumreihe
    let seed = 7
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
    for (let layer = 0; layer < 3; layer++) {
      const base = 250 + layer * 55
      const tone = ['#4e6b3f', '#5d7d48', '#6d8f52'][layer]
      for (let i = 0; i < 34; i++) {
        const x = rnd() * 1024
        const r = 45 + rnd() * 70
        g.fillStyle = tone
        g.globalAlpha = 0.9
        g.beginPath()
        g.arc(x, base - r * 0.35 + rnd() * 30, r, 0, Math.PI * 2)
        g.fill()
      }
    }
    g.globalAlpha = 1
    // Hecke
    g.fillStyle = '#415c33'
    g.fillRect(0, 400, 1024, 112)
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    return t
  }, [])
  const z = ROOM.length + ROOM.exteriorThickness + 5.5
  return (
    <mesh position={[ROOM.width / 2, 1.2, z]} rotation={[0, Math.PI, 0]}>
      <planeGeometry args={[22, 11]} />
      <meshBasicMaterial map={tex} toneMapped={false} side={THREE.DoubleSide} />
    </mesh>
  )
}

export function Room() {
  const bump = useMemo(() => makePlasterBump(), [])
  const walls = useWalls()
  return (
    <group>
      <Outside />
      <Floor />
      <Ceiling bump={bump} />
      {walls.map((w) => (
        <Wall key={w.id} w={w} bump={bump} />
      ))}
      <Door />
      {WINDOWS.map((w) => (
        <Window key={w.id} w={w} />
      ))}
      <CeilingLamp />
      <SmokeDetector />
      <Switches />
    </group>
  )
}
