import { useFrame } from '@react-three/fiber'
import { useRef, type RefObject } from 'react'
import {
  AdditiveBlending,
  DoubleSide,
  type Group,
  type MeshBasicMaterial,
} from 'three'
import { floorBase, floorHeight } from '../layout'
import { recoveryActive, waveFade, waveRadius } from './recoveryShape'

// A service of a building that came back up, and when (a clock time, in seconds).
export interface Recovered {
  floor: number
  start: number
}

// The recovery of a service: a shock wave like the one of a restored tile spreads in a circle from
// the middle of its floor, a wall of light as high as the floor and a ring at its foot. It does
// not reach the other floors. One slot per service, each showing only while its floor is in
// `recovered`.
export default function Recovery({
  width,
  floors,
  recovered,
}: {
  width: number
  floors: number
  recovered: RefObject<Recovered[]>
}) {
  const slots = Array.from({ length: Math.max(0, floors - 1) }, (_, i) => i + 1)
  return (
    <>
      {slots.map((floor) => (
        <Wave key={floor} floor={floor} width={width} recovered={recovered} />
      ))}
    </>
  )
}

function Wave({
  floor,
  width,
  recovered,
}: {
  floor: number
  width: number
  recovered: RefObject<Recovered[]>
}) {
  const front = useRef<Group>(null)
  const wall = useRef<MeshBasicMaterial>(null)
  const ring = useRef<MeshBasicMaterial>(null)
  const height = floorHeight(floor)

  useFrame(({ clock }) => {
    const found = recovered.current?.find((r) => r.floor === floor)
    const age = found ? clock.elapsedTime - found.start : -1
    const active = recoveryActive(age)
    if (front.current) {
      front.current.visible = active
      if (active) {
        const radius = waveRadius(age, width)
        front.current.scale.set(radius, 1, radius)
      }
    }
    if (!active) return
    // Thins out as the wave spends itself, as the one of a tile does.
    const left = waveFade(age)
    if (wall.current) wall.current.opacity = 0.1 + 0.3 * left
    if (ring.current) ring.current.opacity = 0.85 * left
  })

  // Drawn at radius 1 and scaled to the radius of the front.
  return (
    <group ref={front} position={[0, floorBase(floor), 0]} visible={false}>
      <mesh position={[0, height / 2, 0]}>
        <cylinderGeometry args={[1, 1, height, 48, 1, true]} />
        <meshBasicMaterial
          ref={wall}
          color="#bfeeff"
          transparent
          opacity={0.4}
          side={DoubleSide}
          depthWrite={false}
          blending={AdditiveBlending}
        />
      </mesh>
      <mesh position={[0, 0.05, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.95, 1.05, 48]} />
        <meshBasicMaterial
          ref={ring}
          color="#ffffff"
          transparent
          opacity={0.85}
          side={DoubleSide}
          depthWrite={false}
          blending={AdditiveBlending}
        />
      </mesh>
    </group>
  )
}
