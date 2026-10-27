import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import { MeshLambertMaterial, type Group } from 'three'
import { RAIL_TOP } from './trackBoxes'
import type { Track } from './tracks'
import {
  activeTrains,
  carriagePoint,
  carriageState,
  LENGTHS,
  trackLength,
  trainOf,
  type Carriage,
  type CarriageKind,
  type Train,
} from './trains'
import { plateAt, type Plot } from './traffic'

// What a carriage is made of: boxes (size, then middle, the height from the top of the rails) in a
// color, `body` and `accent` being the carriage's own, heading +X.
interface Part {
  color: string
  size: [number, number, number]
  at: [number, number, number]
}
const DARK = '#2b2d33'
const GLASS = '#9fd3ff'
const ROOF = '#9aa0a8'
// The two bogies under a carriage of that length.
const bogies = (kind: CarriageKind, length: number): Part[] =>
  [-1, 1].map((end) => ({
    color: DARK,
    size: [0.7, 0.12, 0.5],
    at: [end * length * (kind === 'tgvCoach' ? 0.5 : 0.3), 0.06, 0],
  }))
const BODIES: Record<CarriageKind, Part[]> = {
  locomotive: [
    { color: DARK, size: [3.5, 0.16, 0.6], at: [0, 0.16, 0] },
    { color: 'body', size: [3.4, 0.55, 0.7], at: [0, 0.5, 0] },
    { color: 'accent', size: [3.42, 0.1, 0.72], at: [0, 0.4, 0] },
    { color: 'body', size: [1.1, 0.35, 0.68], at: [-1.1, 0.95, 0] },
    { color: GLASS, size: [0.1, 0.2, 0.5], at: [-0.52, 1.0, 0] },
    { color: GLASS, size: [0.1, 0.2, 0.5], at: [1.72, 0.6, 0] },
    { color: '#ffe48a', size: [0.06, 0.1, 0.12], at: [1.73, 0.38, 0.22] },
    { color: '#ffe48a', size: [0.06, 0.1, 0.12], at: [1.73, 0.38, -0.22] },
  ],
  coach: [
    { color: DARK, size: [3.1, 0.14, 0.55], at: [0, 0.16, 0] },
    { color: 'body', size: [3.1, 0.75, 0.68], at: [0, 0.6, 0] },
    { color: 'accent', size: [3.12, 0.1, 0.7], at: [0, 0.4, 0] },
    { color: GLASS, size: [2.7, 0.24, 0.7], at: [0, 0.75, 0] },
    { color: ROOF, size: [3.1, 0.08, 0.56], at: [0, 1.02, 0] },
  ],
  boxcar: [
    { color: DARK, size: [2.9, 0.14, 0.55], at: [0, 0.16, 0] },
    { color: 'body', size: [2.9, 0.8, 0.68], at: [0, 0.62, 0] },
    { color: DARK, size: [0.9, 0.55, 0.7], at: [0, 0.6, 0] },
    { color: ROOF, size: [3, 0.06, 0.6], at: [0, 1.05, 0] },
  ],
  tank: [
    { color: DARK, size: [2.9, 0.14, 0.55], at: [0, 0.16, 0] },
    { color: 'body', size: [2.7, 0.62, 0.62], at: [0, 0.66, 0] },
    { color: 'accent', size: [0.8, 0.14, 0.34], at: [0, 1.04, 0] },
    { color: DARK, size: [2.5, 0.05, 0.16], at: [0, 1.0, 0] },
  ],
  hopper: [
    { color: DARK, size: [2.9, 0.14, 0.55], at: [0, 0.16, 0] },
    { color: 'body', size: [2.8, 0.55, 0.68], at: [0, 0.5, 0] },
    { color: '#25262b', size: [2.6, 0.2, 0.56], at: [0, 0.86, 0] },
    { color: 'accent', size: [2.82, 0.08, 0.7], at: [0, 0.4, 0] },
  ],
  // A TGV: low and sleek, with a stepped nose, a stripe along the sides and a grey roof.
  tgvHead: [
    { color: DARK, size: [3.7, 0.1, 0.5], at: [0, 0.16, 0] },
    { color: 'body', size: [2.8, 0.62, 0.66], at: [-0.5, 0.55, 0] },
    { color: 'accent', size: [3.6, 0.1, 0.68], at: [-0.05, 0.4, 0] },
    { color: 'body', size: [0.5, 0.5, 0.6], at: [1.15, 0.5, 0] },
    { color: 'body', size: [0.4, 0.36, 0.5], at: [1.6, 0.43, 0] },
    { color: 'accent', size: [0.2, 0.22, 0.4], at: [1.9, 0.36, 0] },
    { color: GLASS, size: [0.5, 0.1, 0.5], at: [1.15, 0.78, 0] },
    { color: ROOF, size: [2.6, 0.06, 0.5], at: [-0.6, 0.89, 0] },
  ],
  tgvCoach: [
    { color: DARK, size: [3, 0.1, 0.5], at: [0, 0.16, 0] },
    { color: 'body', size: [3, 0.62, 0.66], at: [0, 0.55, 0] },
    { color: 'accent', size: [3, 0.1, 0.68], at: [0, 0.4, 0] },
    { color: GLASS, size: [2.6, 0.16, 0.68], at: [0, 0.64, 0] },
    { color: ROOF, size: [3, 0.06, 0.5], at: [0, 0.89, 0] },
  ],
  flatcar: [
    { color: DARK, size: [3.2, 0.12, 0.7], at: [0, 0.22, 0] },
    { color: 'body', size: [1.4, 0.65, 0.64], at: [-0.8, 0.6, 0] },
    { color: 'accent', size: [1.4, 0.65, 0.64], at: [0.8, 0.6, 0] },
  ],
}

const PARTS = Object.fromEntries(
  Object.entries(BODIES).map(([kind, parts]) => [
    kind,
    [...parts, ...bogies(kind as CarriageKind, LENGTHS[kind as CarriageKind])],
  ]),
) as Record<CarriageKind, Part[]>

interface Slot {
  train: Train
  j: number
  carriage: Carriage
  // One material per color, for the carriage to fade on its own.
  materials: Map<string, MeshLambertMaterial>
  // The plate it was on last, tried first.
  plate: number
}

function fade(material: MeshLambertMaterial, opacity: number) {
  material.opacity = opacity
  material.transparent = opacity < 1
}

// The trains of the whole map. They run across the plates, so they are not inside one: each carriage
// is placed after the group of the plate it is on, which follows the focus view (it shrinks, grows or
// lifts), and hidden over a plate that has been nuked. Which trains are on their way changes about
// once a minute, and only then does the component render again.
export default function Trains({
  track,
  plots,
  groups,
  nuked,
  visible,
  density,
}: {
  track: Track | null
  plots: Plot[]
  // The group of every plate, by id.
  groups: ReadonlyMap<string, Group>
  // The plates with no railway left.
  nuked: ReadonlySet<string>
  // Hidden, there is no train to move.
  visible: boolean
  // How many trains, as a multiple of the normal count.
  density: number
}) {
  const length = track ? trackLength(track) : 0
  const [ids, setIds] = useState('')
  const slots = useMemo(
    () =>
      (ids ? ids.split(',').map(Number) : []).flatMap((id) => {
        const train = trainOf(id, density, length)
        return train.carriages.map((carriage, j): Slot => {
          const parts = PARTS[carriage.kind]
          const colors = [...new Set(parts.map((part) => part.color))]
          const materials = new Map(
            colors.map((color) => [
              color,
              new MeshLambertMaterial({
                color:
                  color === 'body'
                    ? carriage.body
                    : color === 'accent'
                      ? carriage.accent
                      : color,
              }),
            ]),
          )
          return { train, j, carriage, materials, plate: 0 }
        })
      }),
    [ids, density, length],
  )
  useEffect(
    () => () => {
      for (const { materials } of slots) {
        for (const material of materials.values()) material.dispose()
      }
    },
    [slots],
  )
  const nodes = useRef<(Group | null)[]>([])

  useFrame(({ clock }) => {
    if (!visible || !track) return
    const t = clock.elapsedTime
    const now = activeTrains(t, density, length)
      .map((train) => train.id)
      .join(',')
    if (now !== ids) setIds(now)
    slots.forEach((slot, i) => {
      const node = nodes.current[i]
      if (!node) return
      const state = carriageState(slot.train, slot.j, t, length)
      const point = state.active
        ? carriagePoint(track, slot.train, state.u)
        : null
      const index = point ? plateAt(plots, point.x, point.z, slot.plate) : -1
      const plot = plots[index]
      const plate = plot && groups.get(plot.id)
      if (!point || !plot || !plate || nuked.has(plot.id)) {
        node.visible = false
        return
      }
      slot.plate = index
      const k = plate.scale.x
      node.visible = true
      node.position.set(
        plate.position.x + k * (point.x - plot.x),
        plate.position.y + k * RAIL_TOP,
        plate.position.z + k * (point.z - plot.z),
      )
      node.scale.setScalar(k)
      node.rotation.y = point.heading
      for (const material of slot.materials.values()) {
        fade(material, state.opacity)
      }
    })
  })

  if (!track) return null
  return (
    <group visible={visible}>
      {slots.map((slot, i) => (
        <group
          key={`${slot.train.id}:${slot.j}`}
          ref={(node) => {
            nodes.current[i] = node
          }}
          visible={false}
        >
          <group rotation-y={slot.carriage.reversed ? Math.PI : 0}>
            {PARTS[slot.carriage.kind].map((part, n) => (
              <mesh
                key={n}
                position={part.at}
                castShadow
                material={slot.materials.get(part.color)}
              >
                <boxGeometry args={part.size} />
              </mesh>
            ))}
          </group>
        </group>
      ))}
    </group>
  )
}
