import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { MeshLambertMaterial, type Group } from 'three'
import { hash } from './layout'
import {
  CAR_COLORS,
  carState,
  lanePoint,
  lanesOf,
  plateAt,
  vehicleKind,
  type Lane,
  type Plot,
  type Roundabout,
  type VehicleKind,
} from './traffic'
import type { Way } from './world'

// What a vehicle is made of: boxes (size, then middle) in the colors of its tones, heading +X.
type Tone = 'body' | 'glass' | 'dark' | 'cargo'
interface Part {
  tone: Tone
  size: [number, number, number]
  at: [number, number, number]
}
const PARTS: Record<VehicleKind, Part[]> = {
  car: [
    { tone: 'body', size: [0.9, 0.25, 0.45], at: [0, 0.26, 0] },
    { tone: 'glass', size: [0.45, 0.2, 0.4], at: [-0.05, 0.48, 0] },
  ],
  truck: [
    { tone: 'dark', size: [2.1, 0.12, 0.5], at: [-0.05, 0.18, 0] },
    { tone: 'cargo', size: [1.5, 0.65, 0.58], at: [-0.4, 0.55, 0] },
    { tone: 'body', size: [0.6, 0.5, 0.55], at: [0.7, 0.45, 0] },
    { tone: 'glass', size: [0.1, 0.22, 0.46], at: [0.97, 0.55, 0] },
  ],
  motorcycle: [
    { tone: 'body', size: [0.7, 0.18, 0.14], at: [0, 0.22, 0] },
    { tone: 'dark', size: [0.22, 0.4, 0.22], at: [-0.05, 0.5, 0] },
    { tone: 'body', size: [0.16, 0.16, 0.16], at: [-0.02, 0.78, 0] },
  ],
}
const TONES: Record<Exclude<Tone, 'body'>, string> = {
  glass: '#9fd3ff',
  dark: '#2b2d33',
  cargo: '#d9dde3',
}

interface CarSlot {
  lane: Lane
  k: number
  parts: Part[]
  // One material per tone, for it to fade on its own.
  materials: Map<Tone, MeshLambertMaterial>
  // The plate it was on last, tried first.
  plate: number
}

// Vehicles fade through their opacity: each has materials of its own.
function useCars(lanes: Lane[]): CarSlot[] {
  const cars = useMemo(
    () =>
      lanes.flatMap((lane) =>
        Array.from({ length: lane.count }, (_, k): CarSlot => {
          const parts = PARTS[vehicleKind(lane, k)]
          const body = CAR_COLORS[hash(`${lane.id}:${k}`) % CAR_COLORS.length]
          const materials = new Map(
            [...new Set(parts.map((p) => p.tone))].map((tone) => [
              tone,
              new MeshLambertMaterial({
                color: tone === 'body' ? body : TONES[tone],
              }),
            ]),
          )
          return { lane, k, parts, materials, plate: 0 }
        }),
      ),
    [lanes],
  )
  useEffect(
    () => () => {
      for (const { materials } of cars) {
        for (const material of materials.values()) material.dispose()
      }
    },
    [cars],
  )
  return cars
}

function fade(material: MeshLambertMaterial, opacity: number) {
  material.opacity = opacity
  material.transparent = opacity < 1
}

// The traffic of the whole map: cars, trucks and motorcycles. They drive across the plates, so they are not inside one: each
// is placed after the group of the plate it is on, which follows the focus view (it shrinks, grows
// or lifts), and hidden over a plate that has been nuked.
export default function Traffic({
  ways,
  roundabouts,
  plots,
  groups,
  nuked,
  visible,
  density,
}: {
  ways: Way[]
  roundabouts: Roundabout[]
  plots: Plot[]
  // The group of every plate, by id.
  groups: ReadonlyMap<string, Group>
  // The plates with no road left.
  nuked: ReadonlySet<string>
  // Hidden, there is no traffic to move.
  visible: boolean
  // How many vehicles, as a multiple of the normal count.
  density: number
}) {
  const lanes = useMemo(
    () => lanesOf(ways, roundabouts, density),
    [ways, roundabouts, density],
  )
  const cars = useCars(lanes)
  const nodes = useRef<(Group | null)[]>([])

  useFrame(({ clock }) => {
    if (!visible) return
    const t = clock.elapsedTime
    cars.forEach((car, i) => {
      const node = nodes.current[i]
      if (!node) return
      const state = carState(car.lane, car.k, t)
      const point = state.active
        ? lanePoint(car.lane, state.s, roundabouts)
        : null
      const index = point ? plateAt(plots, point.x, point.z, car.plate) : -1
      const plot = plots[index]
      const plate = plot && groups.get(plot.id)
      if (!point || !plot || !plate || nuked.has(plot.id)) {
        node.visible = false
        return
      }
      car.plate = index
      const k = plate.scale.x
      node.visible = true
      node.position.set(
        plate.position.x + k * (point.x - plot.x),
        plate.position.y,
        plate.position.z + k * (point.z - plot.z),
      )
      node.scale.setScalar(k)
      node.rotation.y = point.heading
      for (const material of car.materials.values()) {
        fade(material, state.opacity)
      }
    })
  })

  return (
    <group visible={visible}>
      {cars.map((car, i) => (
        <group
          key={`${car.lane.id}:${car.k}`}
          ref={(node) => {
            nodes.current[i] = node
          }}
          visible={false}
        >
          {car.parts.map((part, n) => (
            <mesh
              key={n}
              position={part.at}
              castShadow
              material={car.materials.get(part.tone)}
            >
              <boxGeometry args={part.size} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  )
}
