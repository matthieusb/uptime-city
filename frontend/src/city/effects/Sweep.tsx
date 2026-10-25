import { useFrame } from '@react-three/fiber'
import { useMemo, useRef, type ReactNode } from 'react'
import {
  AdditiveBlending,
  DoubleSide,
  Plane,
  type Group,
  type Material,
  type Mesh,
  type MeshBasicMaterial,
  type Object3D,
} from 'three'
import {
  RESTORE_S,
  SWEEP_S,
  WAVE_SIDES,
  sweepFront,
  wavePlanes,
  type SweepRange,
} from './restoreShape'

// The height of the wall of light of the wave.
const HEIGHT = 4

// `intersection`: clip only what is inside all the planes, the inside of the
// circle, instead of what is outside any of them.
function setPlanes(
  root: Object3D,
  planes: Plane[] | null,
  intersection: boolean,
) {
  root.traverse((object) => {
    const material = (object as Mesh).material as
      Material | Material[] | undefined
    if (!material) return
    for (const m of Array.isArray(material) ? material : [material]) {
      if (m.clippingPlanes === planes && m.clipIntersection === intersection)
        continue
      if (!planes && !m.clippingPlanes) continue
      m.clippingPlanes = planes
      m.clipIntersection = intersection
      m.needsUpdate = true
    }
  })
}

// Shows its children only on one side of a shock wave that spreads from the
// middle of the tile in a circle, from `startedAt` (milliseconds): `ahead` of
// the front, outside the circle where the wave has not passed yet, or
// `behind` it, inside the circle. Without a start, everything shows. With
// `wave`, the front is drawn as a ring and a wall of light. Calls `onDone`
// once the restoration is over.
export default function Sweep({
  startedAt,
  range,
  side,
  wave = false,
  onDone,
  children,
}: {
  startedAt: number | null
  range: SweepRange
  side: 'ahead' | 'behind'
  wave?: boolean
  onDone?: () => void
  children: ReactNode
}) {
  const group = useRef<Group>(null)
  const front = useRef<Group>(null)
  const wall = useRef<Mesh>(null)
  const clipped = useRef(false)
  const done = useRef(false)
  const planes = useMemo(
    () => Array.from({ length: WAVE_SIDES }, () => new Plane()),
    [],
  )
  useFrame(() => {
    const root = group.current
    if (!root) return
    if (startedAt === null) {
      // Not sweeping: no clipping left behind.
      if (clipped.current) setPlanes(root, null, false)
      clipped.current = false
      done.current = false
      if (front.current) front.current.visible = false
      return
    }
    const elapsed = (Date.now() - startedAt) / 1000
    const radius = Math.max(0.01, sweepFront(elapsed, range))
    // A plane keeps what is on its positive side. Behind the front, keep
    // what is inside all the planes. Ahead of it, clip what is inside all of
    // them.
    const inward = side === 'behind'
    root.updateWorldMatrix(true, false)
    wavePlanes(radius).forEach(({ x, z, distance }, i) => {
      if (inward) planes[i].normal.set(-x, 0, -z)
      else planes[i].normal.set(x, 0, z)
      planes[i].constant = inward ? distance : -distance
      planes[i].applyMatrix4(root.matrixWorld)
    })
    setPlanes(root, planes, !inward)
    clipped.current = true
    if (front.current) {
      front.current.visible = elapsed >= 0 && elapsed <= SWEEP_S
      front.current.scale.set(radius, 1, radius)
      // The wall thins out as the wave spends itself.
      const left = 1 - Math.min(1, elapsed / SWEEP_S)
      if (wall.current)
        (wall.current.material as MeshBasicMaterial).opacity = 0.1 + 0.3 * left
    }
    if (!done.current && elapsed >= RESTORE_S) {
      done.current = true
      onDone?.()
    }
  })
  return (
    <>
      <group ref={group}>{children}</group>
      {wave && (
        // Not in the clipped group, or the wave would clip itself. Drawn at
        // radius 1 and scaled to the radius of the front.
        <group ref={front} visible={false}>
          <mesh ref={wall} position={[0, HEIGHT / 2, 0]}>
            <cylinderGeometry args={[1, 1, HEIGHT, 64, 1, true]} />
            <meshBasicMaterial
              color="#bfeeff"
              transparent
              opacity={0.4}
              side={DoubleSide}
              depthWrite={false}
              blending={AdditiveBlending}
            />
          </mesh>
          <mesh position={[0, 0.15, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.97, 1.03, 64]} />
            <meshBasicMaterial
              color="#ffffff"
              transparent
              opacity={0.85}
              side={DoubleSide}
              depthWrite={false}
              blending={AdditiveBlending}
            />
          </mesh>
        </group>
      )}
    </>
  )
}
