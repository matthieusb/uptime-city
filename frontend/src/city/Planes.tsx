import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { MeshLambertMaterial, type Group, type Quaternion } from 'three'
import type { Airport } from './airport'
import {
  LIVERIES,
  MAX_PLANES,
  PLANE_KINDS,
  planeCount,
  planeState,
  type AirportSpec,
  type PlaneKind,
  type PlaneState,
} from './flights'

// The colors of the planes: a body and an accent (tail, stripe, engine band) per livery. The
// tourism plane has six liveries, the jumbo jet is white with one of six tail colors, and the
// cargo plane is white and blue.
const TOURISM: [string, string][] = [
  ['#f4f4f4', '#e63946'],
  ['#ffd23f', '#2b2d33'],
  ['#e63946', '#f4f4f4'],
  ['#219ebc', '#f4f4f4'],
  ['#f4f4f4', '#8338ec'],
  ['#06d6a0', '#f4f4f4'],
]
const JUMBO_TAILS = [
  '#e63946',
  '#219ebc',
  '#1d3a8a',
  '#06d6a0',
  '#ff8c42',
  '#8338ec',
]
function colorsOf(kind: PlaneKind, livery: number): [string, string] {
  if (kind === 'tourism') return TOURISM[livery % TOURISM.length]
  if (kind === 'jumbo') return ['#f4f4f4', JUMBO_TAILS[livery % LIVERIES]]
  return ['#f4f6fa', '#1f56b8']
}

// What a plane is made of: boxes (size, then middle) in the colors of its tones, nose to +X, its
// wheels on the ground. The sizes follow CRAFT in flights.ts (length, span).
type Tone = 'body' | 'accent' | 'wing' | 'glass' | 'dark'
interface Part {
  tone: Tone
  size: [number, number, number]
  at: [number, number, number]
}
const part = (
  tone: Tone,
  size: [number, number, number],
  at: [number, number, number],
): Part => ({ tone, size, at })

// A light plane: a high wing on struts, a propeller on the nose, a small tail.
const TOURISM_PARTS: Part[] = [
  part('body', [1.1, 0.3, 0.3], [0, 0.35, 0]),
  part('accent', [0.3, 0.3, 0.3], [0.65, 0.35, 0]),
  part('dark', [0.04, 0.55, 0.07], [0.83, 0.35, 0]),
  part('glass', [0.45, 0.14, 0.28], [0.05, 0.52, 0]),
  part('body', [0.5, 0.2, 0.2], [-0.6, 0.4, 0]),
  part('accent', [0.3, 0.4, 0.05], [-0.72, 0.7, 0]),
  part('wing', [0.25, 0.04, 0.8], [-0.72, 0.5, 0]),
  part('wing', [0.45, 0.05, 2.2], [0.1, 0.7, 0]),
  part('dark', [0.04, 0.35, 0.04], [0.15, 0.45, 0.55]),
  part('dark', [0.04, 0.35, 0.04], [0.15, 0.45, -0.55]),
  part('dark', [0.06, 0.2, 0.06], [0.45, 0.1, 0]),
  part('dark', [0.06, 0.2, 0.06], [0.05, 0.1, 0.2]),
  part('dark', [0.06, 0.2, 0.06], [0.05, 0.1, -0.2]),
]

// A cargo plane (Airbus Beluga): a blue belly under a huge white upper bay, a drooping nose, two
// engines and a raised tail with three fins.
const CARGO_PARTS: Part[] = [
  part('accent', [2.6, 0.28, 0.4], [-0.05, 0.4, 0]),
  part('body', [2, 0.5, 0.66], [0.1, 0.78, 0]),
  part('body', [0.35, 0.34, 0.5], [1.2, 0.7, 0]),
  part('accent', [0.45, 0.3, 0.36], [1.52, 0.36, 0]),
  part('glass', [0.08, 0.12, 0.3], [1.74, 0.42, 0]),
  part('body', [0.8, 0.3, 0.3], [-1.3, 0.62, 0]),
  part('body', [0.4, 0.24, 0.24], [-1.55, 0.78, 0]),
  part('wing', [0.4, 0.05, 1.1], [-1.5, 0.95, 0]),
  part('accent', [0.3, 0.45, 0.05], [-1.5, 1.15, 0.55]),
  part('accent', [0.3, 0.45, 0.05], [-1.5, 1.15, -0.55]),
  part('accent', [0.45, 0.55, 0.06], [-1.45, 1.3, 0]),
  part('wing', [0.8, 0.06, 3], [0.15, 0.42, 0]),
  part('dark', [0.55, 0.24, 0.24], [0.3, 0.22, 0.85]),
  part('dark', [0.55, 0.24, 0.24], [0.3, 0.22, -0.85]),
  part('dark', [0.12, 0.26, 0.12], [1, 0.13, 0]),
  part('dark', [0.12, 0.26, 0.12], [-0.1, 0.13, 0.3]),
  part('dark', [0.12, 0.26, 0.12], [-0.1, 0.13, -0.3]),
]

// A jumbo jet (Boeing 747): a long fuselage with the upper deck over the nose, swept wings, four
// engines and a tall tail fin.
const JUMBO_PARTS: Part[] = [
  part('body', [3.3, 0.42, 0.42], [-0.05, 0.47, 0]),
  part('body', [0.4, 0.32, 0.32], [1.8, 0.45, 0]),
  part('body', [1.1, 0.22, 0.34], [1, 0.8, 0]),
  part('glass', [0.1, 0.1, 0.28], [1.58, 0.82, 0]),
  part('accent', [3, 0.07, 0.43], [-0.2, 0.52, 0]),
  part('glass', [2.2, 0.05, 0.43], [-0.2, 0.62, 0]),
  part('body', [0.4, 0.34, 0.34], [-1.8, 0.58, 0]),
  ...[1, -1].flatMap((side): Part[] => [
    part('wing', [0.9, 0.06, 0.6], [0.2, 0.36, side * 0.5]),
    part('wing', [0.7, 0.06, 0.55], [-0.1, 0.36, side * 1]),
    part('wing', [0.5, 0.06, 0.5], [-0.45, 0.36, side * 1.45]),
    part('dark', [0.5, 0.22, 0.22], [0.45, 0.2, side * 0.7]),
    part('dark', [0.5, 0.22, 0.22], [0.1, 0.2, side * 1.25]),
    part('dark', [0.12, 0.26, 0.12], [0, 0.13, side * 0.35]),
  ]),
  part('accent', [0.7, 1, 0.07], [-1.7, 1.15, 0]),
  part('accent', [0.4, 0.35, 0.07], [-1.45, 0.85, 0]),
  part('wing', [0.5, 0.05, 1.5], [-1.85, 0.7, 0]),
  part('dark', [0.12, 0.26, 0.12], [1.2, 0.13, 0]),
]

const PARTS: Record<PlaneKind, Part[]> = {
  tourism: TOURISM_PARTS,
  cargo: CARGO_PARTS,
  jumbo: JUMBO_PARTS,
}

type Materials = Record<Tone, MeshLambertMaterial>

function useMaterials(count: number, free: boolean): Materials[] {
  const all = useMemo(() => {
    // On the planet, the planes of the sky are placed on the planet itself: no bending.
    const make = (color: string) => {
      const material = new MeshLambertMaterial({ color })
      if (free) material.defines = { PLANET_FREE: '' }
      return material
    }
    return Array.from({ length: count }, (): Materials => ({
      body: make(TOURISM[0][0]),
      accent: make(TOURISM[0][1]),
      wing: make('#c9ced6'),
      glass: make('#9fd3ff'),
      dark: make('#2b2d33'),
    }))
  }, [count, free])
  useEffect(
    () => () => {
      for (const materials of all)
        for (const material of Object.values(materials)) material.dispose()
    },
    [all],
  )
  return all
}

// A pool of `count` planes, each in a group of its own that is placed, turned and dressed in the
// livery and the model of its kind: shared by the planes of the airport and those of the sky.
export function usePlanePool(
  count = MAX_PLANES,
  // Whether they fly in the frame of the planet, out of the atlas that is bent onto it.
  free = false,
): {
  // Puts plane `i` at (x, y, z), scaled by `k`, as `state` says; or hides it, with no state.
  place: (
    i: number,
    state: PlaneState | null,
    at: [number, number, number],
    k: number,
    // Turns the plane as a whole, after its heading and pitch: on the planet, where up is not Y.
    frame?: Quaternion,
  ) => void
  bodies: ReactNode
} {
  const materials = useMaterials(count, free)
  const nodes = useRef<(Group | null)[]>([])
  // The model of each kind inside each plane's group, and the look it has now.
  const models = useRef<Partial<Record<PlaneKind, Group | null>>[]>([])
  const looks = useRef<string[]>([])

  const place = (
    i: number,
    state: PlaneState | null,
    at: [number, number, number],
    k: number,
    frame?: Quaternion,
  ) => {
    const node = nodes.current[i]
    if (!node) return
    if (!state?.active) {
      node.visible = false
      return
    }
    node.visible = true
    node.position.set(...at)
    node.scale.setScalar(k)
    node.rotation.set(0, state.heading, state.pitch)
    if (frame) node.quaternion.premultiply(frame)
    const look = `${state.kind}:${state.livery}`
    if (looks.current[i] !== look) {
      looks.current[i] = look
      const [body, accent] = colorsOf(state.kind, state.livery)
      materials[i].body.color.set(body)
      materials[i].accent.color.set(accent)
      for (const kind of PLANE_KINDS) {
        const model = models.current[i]?.[kind]
        if (model) model.visible = kind === state.kind
      }
    }
  }

  const bodies = materials.map((materials, i) => (
    <group
      key={i}
      ref={(node) => {
        nodes.current[i] = node
      }}
      visible={false}
    >
      {PLANE_KINDS.map((kind) => (
        <group
          key={kind}
          ref={(node) => {
            models.current[i] = { ...models.current[i], [kind]: node }
          }}
          visible={kind === 'tourism'}
        >
          {PARTS[kind].map((part, n) => (
            <mesh
              key={n}
              position={part.at}
              castShadow={!free}
              material={materials[part.tone]}
            >
              <boxGeometry args={part.size} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  ))
  return { place, bodies }
}

// The planes of the airport: they take off and land on its runway, come from beyond the edges of
// the map and leave beyond them. Each is placed after the group of the plate the airport is on,
// like the cars, so that they follow the focus view (the plate shrinks, grows or lifts), and they
// are hidden over a plate that has been nuked.
export default function Planes({
  airport,
  groups,
  nuked,
  visible,
  density,
  cruise,
}: {
  airport: Airport | null
  // The group of every plate, by id.
  groups: ReadonlyMap<string, Group>
  // The plates that have been nuked.
  nuked: ReadonlySet<string>
  // Hidden, there is nothing to move.
  visible: boolean
  // How many planes, as a multiple of the normal count.
  density: number
  // How high they cruise, above the clouds (`cruiseHeight`).
  cruise: number
}) {
  const spec = useMemo<AirportSpec | null>(
    () =>
      airport && {
        layout: airport.layout,
        x: airport.structure.x,
        z: airport.structure.z,
        y: airport.structure.y,
        turn: airport.turn,
        cruise,
        reach: airport.reach,
      },
    [airport, cruise],
  )
  const { place, bodies } = usePlanePool()
  const count = planeCount(density)

  useFrame(({ clock }) => {
    if (!visible || !spec || !airport) return
    const plate = groups.get(airport.plate.id)
    const gone = !plate || nuked.has(airport.plate.id)
    const t = clock.elapsedTime
    for (let i = 0; i < MAX_PLANES; i++) {
      const state = i < count && !gone ? planeState(spec, i, t) : null
      if (!state?.active || !plate) {
        place(i, null, [0, 0, 0], 1)
        continue
      }
      const k = plate.scale.x
      place(
        i,
        state,
        [
          plate.position.x + k * state.x,
          plate.position.y + k * state.y,
          plate.position.z + k * state.z,
        ],
        k,
      )
    }
  })

  if (!spec) return null
  return <group visible={visible}>{bodies}</group>
}
