import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef, type ReactNode } from 'react'
import {
  Color,
  Object3D,
  type Group,
  type InstancedMesh,
  type MeshLambertMaterial,
} from 'three'
import {
  carPoint,
  hash,
  roadZ,
  type CityLayout,
  type Lot,
  type Road,
  type Theme,
  type Tile,
  type Tree,
} from './layout'

// Tiles are columns standing on a dirt slab whose top is at this height.
const BEDROCK = -0.3

interface Box {
  x: number
  y: number
  z: number
  sx: number
  sy: number
  sz: number
}

// Many static boxes of one color, drawn in a single call.
function InstancedBoxes({ boxes, color }: { boxes: Box[]; color: string }) {
  const mesh = useRef<InstancedMesh>(null)
  useLayoutEffect(() => {
    const dummy = new Object3D()
    boxes.forEach((b, i) => {
      dummy.position.set(b.x, b.y, b.z)
      dummy.scale.set(b.sx, b.sy, b.sz)
      dummy.updateMatrix()
      mesh.current?.setMatrixAt(i, dummy.matrix)
    })
    if (mesh.current) mesh.current.instanceMatrix.needsUpdate = true
  }, [boxes])
  if (boxes.length === 0) return null
  return (
    <instancedMesh
      // A new count needs a new mesh.
      key={boxes.length}
      ref={mesh}
      args={[undefined, undefined, boxes.length]}
      castShadow
      receiveShadow
    >
      <boxGeometry />
      <meshLambertMaterial color={color} />
    </instancedMesh>
  )
}

// Groups boxes by color, one instanced mesh per color.
function ColoredBoxes({ boxes }: { boxes: Map<string, Box[]> }) {
  return [...boxes].map(([color, list]) => (
    <InstancedBoxes key={color} boxes={list} color={color} />
  ))
}

function addBox(groups: Map<string, Box[]>, color: string, box: Box) {
  const list = groups.get(color)
  if (list) list.push(box)
  else groups.set(color, [box])
}

const TILE_COLORS: Record<Tile['kind'], string> = {
  water: '#2f78c4',
  shallow: '#4fa6e0',
  pond: '#4aa3df',
  sand: '#e8d49b',
  grass: '#5fa83a',
  hill: '#56a036',
  road: '#3a3a44',
  plaza: '#b9b6aa',
  crater: '#3a2a22',
}
// A nuked ground is burnt and grey.
const ASH_COLORS: Record<Tile['kind'], string> = {
  water: '#27384a',
  shallow: '#2f4558',
  pond: '#2f4558',
  sand: '#5a5148',
  grass: '#403a34',
  hill: '#352f2a',
  road: '#1f1f24',
  plaza: '#4b4640',
  crater: '#16120f',
}
// Hills get darker and rockier as they rise.
const HILL_COLORS = ['#5fa83a', '#56a036', '#4d9631', '#468a2c', '#7d8a6a']

// What changes from one theme to another: the ground and the hills.
const THEME_TILES: Record<Theme, Partial<Record<Tile['kind'], string>>> = {
  coastal: {},
  meadow: { grass: '#6dba3f' },
  desert: { grass: '#e3bf73', pond: '#3fb6a8', plaza: '#cdb98e' },
  snow: {
    grass: '#f2f6fa',
    sand: '#e8eef4',
    pond: '#a9d8f0',
    plaza: '#cfd6dc',
  },
}
const THEME_HILLS: Record<Theme, string[]> = {
  coastal: HILL_COLORS,
  meadow: ['#6dba3f', '#63b03a', '#58a334', '#4d962e', '#7d8a6a'],
  desert: ['#e3bf73', '#d9a95a', '#cf9a4c', '#c58b3f', '#a8794a'],
  snow: ['#f2f6fa', '#e8eef4', '#dde6ee', '#cdd8e2', '#b9c4cf'],
}

// Stable shade in [0.93, 1.07] per tile, for a hand-drawn look.
function shade(tile: Tile): number {
  const n = Math.sin(tile.x * 12.9898 + tile.z * 78.233) * 43758.5453
  return 0.93 + 0.14 * (n - Math.floor(n))
}

function tileColor(
  tile: Tile,
  color: Color,
  theme: Theme,
  nuked: boolean,
): Color {
  const hills = THEME_HILLS[theme]
  const base = nuked
    ? ASH_COLORS[tile.kind]
    : tile.kind === 'hill'
      ? hills[Math.min(hills.length - 1, Math.round((tile.top - 0.05) / 0.5))]
      : (THEME_TILES[theme][tile.kind] ?? TILE_COLORS[tile.kind])
  return color.set(base).multiplyScalar(shade(tile))
}

const isWater = (tile: Tile) =>
  tile.kind === 'water' || tile.kind === 'shallow' || tile.kind === 'pond'

// A tile is a column from the bedrock up to its top.
function placeTile(
  mesh: InstancedMesh,
  dummy: Object3D,
  tile: Tile,
  i: number,
  top: number,
) {
  dummy.position.set(tile.x, (top + BEDROCK) / 2, tile.z)
  dummy.scale.set(1, top - BEDROCK, 1)
  dummy.updateMatrix()
  mesh.setMatrixAt(i, dummy.matrix)
}

// One mesh for all the tiles of a kind, each with its own color. Water
// tiles bob up and down in small waves.
function TileMesh({
  tiles,
  water,
  theme,
  nuked,
}: {
  tiles: Tile[]
  water: boolean
  theme: Theme
  nuked: boolean
}) {
  const mesh = useRef<InstancedMesh>(null)
  const material = useRef<MeshLambertMaterial>(null)
  const dummy = useMemo(() => new Object3D(), [])

  useLayoutEffect(() => {
    if (!mesh.current) return
    const color = new Color()
    tiles.forEach((tile, i) => {
      placeTile(mesh.current!, dummy, tile, i, tile.top)
      mesh.current!.setColorAt(i, tileColor(tile, color, theme, nuked))
    })
    mesh.current.instanceMatrix.needsUpdate = true
    if (mesh.current.instanceColor)
      mesh.current.instanceColor.needsUpdate = true
  }, [tiles, dummy, theme, nuked])

  useFrame(({ clock }) => {
    if (!water || !mesh.current) return
    const t = clock.elapsedTime
    tiles.forEach((tile, i) => {
      const wave = Math.sin(t * 1.2 + tile.x * 0.5 + tile.z * 0.8)
      placeTile(mesh.current!, dummy, tile, i, tile.top + 0.03 * wave)
    })
    mesh.current.instanceMatrix.needsUpdate = true
    if (material.current) {
      material.current.emissiveIntensity = 0.12 + 0.06 * Math.sin(t * 0.8)
    }
  })

  if (tiles.length === 0) return null
  return (
    <instancedMesh
      key={tiles.length}
      ref={mesh}
      args={[undefined, undefined, tiles.length]}
      castShadow={!water}
      receiveShadow
    >
      <boxGeometry />
      <meshLambertMaterial
        ref={material}
        emissive={water ? '#6ec6ff' : '#000000'}
        emissiveIntensity={water ? 0.12 : 0}
      />
    </instancedMesh>
  )
}

function Ground({ layout, nuked }: { layout: CityLayout; nuked: boolean }) {
  const { land, water } = useMemo(
    () => ({
      land: layout.tiles.filter((t) => !isWater(t)),
      water: layout.tiles.filter(isWater),
    }),
    [layout.tiles],
  )
  return (
    <>
      {/* The dirt slab the island floats on. */}
      <mesh position={[0, BEDROCK - 0.4, 0]} receiveShadow>
        <boxGeometry args={[2 * layout.halfWidth, 0.8, 2 * layout.halfDepth]} />
        <meshLambertMaterial color="#7a4e32" />
      </mesh>
      <TileMesh tiles={land} water={false} theme={layout.theme} nuked={nuked} />
      <TileMesh tiles={water} water theme={layout.theme} nuked={nuked} />
    </>
  )
}

function RoadMarkings({
  roads,
  halfWidth,
}: {
  roads: Road[]
  halfWidth: number
}) {
  const dashes = useMemo(
    () =>
      roads.flatMap((road) => {
        const list: Box[] = []
        for (let x = -Math.floor(halfWidth); x <= halfWidth; x += 2) {
          list.push({
            x,
            y: 0.07,
            z: roadZ(road, x),
            sx: 0.5,
            sy: 0.03,
            sz: 0.08,
          })
        }
        return list
      }),
    [roads, halfWidth],
  )
  return <InstancedBoxes boxes={dashes} color="#f1f1e6" />
}

// Each kind of tree is a stack of boxes: [color, y, width, height, depth].
const TREE_SHAPES: Record<
  Tree['kind'],
  [string, number, number, number, number][]
> = {
  oak: [
    ['#6b4226', 0.3, 0.2, 0.6, 0.2],
    ['#2e8b3e', 0.85, 0.8, 0.6, 0.8],
    ['#3fae4f', 1.3, 0.45, 0.35, 0.45],
  ],
  pine: [
    ['#6b4226', 0.2, 0.18, 0.4, 0.18],
    ['#1f6b3a', 0.6, 0.9, 0.4, 0.9],
    ['#247a43', 1.0, 0.65, 0.4, 0.65],
    ['#2c8f50', 1.4, 0.38, 0.4, 0.38],
  ],
  fruit: [
    ['#6b4226', 0.3, 0.2, 0.6, 0.2],
    ['#4aa84f', 0.8, 0.85, 0.5, 0.85],
    ['#f4a6c0', 1.2, 0.6, 0.35, 0.6],
  ],
  palm: [
    ['#9c7a4b', 0.45, 0.16, 0.9, 0.16],
    ['#8b6b3e', 1.25, 0.14, 0.7, 0.14],
    ['#2f9e44', 1.68, 1.3, 0.1, 0.3],
    ['#2f9e44', 1.68, 0.3, 0.1, 1.3],
    ['#3fbf55', 1.78, 0.35, 0.2, 0.35],
  ],
}

// Trees, flowers, reeds, rocks, parasols and the pier: all static boxes.
function Props({ layout }: { layout: CityLayout }) {
  const boxes = useMemo(() => {
    const groups = new Map<string, Box[]>()
    for (const tree of layout.trees) {
      for (const [color, y, sx, sy, sz] of TREE_SHAPES[tree.kind]) {
        const s = tree.scale
        addBox(groups, color, {
          x: tree.x,
          y: tree.y + y * s,
          z: tree.z,
          sx: sx * s,
          sy: sy * s,
          sz: sz * s,
        })
      }
    }
    for (const f of layout.flowers) {
      addBox(groups, '#2f7d32', {
        x: f.x,
        y: f.y + 0.08,
        z: f.z,
        sx: 0.06,
        sy: 0.16,
        sz: 0.06,
      })
      addBox(groups, f.color, {
        x: f.x,
        y: f.y + 0.2,
        z: f.z,
        sx: 0.18,
        sy: 0.1,
        sz: 0.18,
      })
    }
    for (const r of layout.reeds) {
      addBox(groups, '#4f8a3a', {
        x: r.x,
        y: r.y + 0.25,
        z: r.z,
        sx: 0.06,
        sy: 0.5,
        sz: 0.06,
      })
      addBox(groups, '#6b4226', {
        x: r.x,
        y: r.y + 0.5,
        z: r.z,
        sx: 0.09,
        sy: 0.14,
        sz: 0.09,
      })
    }
    for (const r of layout.rocks) {
      addBox(groups, '#8d8d86', {
        x: r.x,
        y: r.y + 0.17,
        z: r.z,
        sx: 0.5,
        sy: 0.35,
        sz: 0.4,
      })
      addBox(groups, '#a3a39b', {
        x: r.x + 0.2,
        y: r.y + 0.1,
        z: r.z + 0.2,
        sx: 0.25,
        sy: 0.2,
        sz: 0.25,
      })
    }
    for (const u of layout.umbrellas) {
      addBox(groups, '#e8e8e8', {
        x: u.x,
        y: u.y + 0.55,
        z: u.z,
        sx: 0.06,
        sy: 1.1,
        sz: 0.06,
      })
      addBox(groups, u.color, {
        x: u.x,
        y: u.y + 1.12,
        z: u.z,
        sx: 1,
        sy: 0.1,
        sz: 1,
      })
      addBox(groups, u.color, {
        x: u.x,
        y: u.y + 1.22,
        z: u.z,
        sx: 0.5,
        sy: 0.1,
        sz: 0.5,
      })
    }
    for (const p of layout.pier) {
      addBox(groups, '#a0703c', {
        x: p.x,
        y: p.y,
        z: p.z,
        sx: 1,
        sy: 0.08,
        sz: 0.95,
      })
      for (const dx of [-0.42, 0.42]) {
        addBox(groups, '#5b3a1e', {
          x: p.x + dx,
          y: p.y - 0.3,
          z: p.z,
          sx: 0.12,
          sy: 0.6,
          sz: 0.12,
        })
      }
    }
    return groups
  }, [layout])
  return <ColoredBoxes boxes={boxes} />
}

interface TravelerProps {
  route: Road
  // Start position, as a fraction of a round trip.
  offset: number
  // Tiles per second.
  speed: number
  children: ReactNode
  // Height above the ground, at time t.
  lift?: (t: number) => number
}

// Something moving back and forth along a road or a sailing route.
function Traveler({ route, offset, speed, children, lift }: TravelerProps) {
  const group = useRef<Group>(null)
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    const trip = (t * speed) / (2 * (route.xMax - route.xMin))
    const { x, z, heading } = carPoint(route, offset + trip)
    group.current?.position.set(x, lift ? lift(t) : 0, z)
    group.current?.rotation.set(0, heading, 0)
  })
  return <group ref={group}>{children}</group>
}

const CAR_COLORS = [
  '#e63946',
  '#ffb703',
  '#219ebc',
  '#f1f1f1',
  '#8338ec',
  '#06d6a0',
]

function Car({ color }: { color: string }) {
  return (
    <>
      <mesh position={[0, 0.26, 0]} castShadow>
        <boxGeometry args={[0.9, 0.25, 0.45]} />
        <meshLambertMaterial color={color} />
      </mesh>
      <mesh position={[-0.05, 0.48, 0]} castShadow>
        <boxGeometry args={[0.45, 0.2, 0.4]} />
        <meshLambertMaterial color="#9fd3ff" />
      </mesh>
    </>
  )
}

const PASTELS = [
  '#f4a6a6',
  '#f7d08a',
  '#a6d8f4',
  '#b8e0a6',
  '#d6b6f0',
  '#f4c6a0',
]
// Top of the paved lots.
const PAVED = 0.09

// Boxes of one piece of decoration, around the middle (x, z) of its lot.
function decorBoxes(lot: Lot, groups: Map<string, Box[]>) {
  const { x, z } = lot
  const box = (
    color: string,
    dx: number,
    y: number,
    dz: number,
    sx: number,
    sy: number,
    sz: number,
  ) => addBox(groups, color, { x: x + dx, y: PAVED + y, z: z + dz, sx, sy, sz })
  const pick = <T,>(list: T[], salt: string) =>
    list[hash(`${lot.id}:${salt}`) % list.length]

  switch (lot.decor) {
    case 'supermarket':
      box('#e9e4d8', 0, 0.9, 0, 3, 1.8, 3)
      box('#8a8f98', 0, 1.875, 0, 3.2, 0.15, 3.2)
      // Signs and glass doors on the two faces that look at the camera.
      box('#e63946', 1.55, 1.45, 0, 0.1, 0.45, 2.4)
      box('#e63946', 0, 1.45, 1.55, 2.4, 0.45, 0.1)
      box('#2b3a55', 1.52, 0.55, 0, 0.06, 1, 1.2)
      box('#2b3a55', 0, 0.55, 1.52, 1.2, 1, 0.06)
      break
    case 'parking':
      box('#4a4a52', 0, 0.02, 0, 3.2, 0.04, 3.2)
      box('#f1f1f1', 0, 0.05, 0, 0.05, 0.02, 2.8)
      box('#f1f1f1', 0, 0.05, 0, 2.8, 0.02, 0.05)
      for (const [n, [dx, dz]] of [
        [-0.8, -0.8],
        [0.8, -0.8],
        [-0.8, 0.8],
        [0.8, 0.8],
      ].entries()) {
        // Some spaces are free.
        if (hash(`${lot.id}:car${n}`) % 4 === 0) continue
        box(pick(CAR_COLORS, `car${n}`), dx, 0.22, dz, 0.5, 0.25, 0.9)
        box('#9fd3ff', dx, 0.42, dz, 0.42, 0.18, 0.45)
      }
      break
    case 'houses':
      for (const [n, [dx, dz]] of [
        [-0.8, -0.8],
        [0.8, 0.8],
      ].entries()) {
        box(pick(PASTELS, `house${n}`), dx, 0.45, dz, 1.2, 0.9, 1.2)
        box(
          pick(['#a04040', '#6a4a3a', '#44546a'], `roof${n}`),
          dx,
          1,
          dz,
          1.4,
          0.3,
          1.4,
        )
        box('#5a3e2b', dx + 0.61, 0.3, dz, 0.04, 0.6, 0.35)
        box('#5a3e2b', dx, 0.3, dz + 0.61, 0.35, 0.6, 0.04)
      }
      break
  }
}

// Shops, houses and car parks: they are there for the look, not monitored.
function Decor({ lots }: { lots: Lot[] }) {
  const boxes = useMemo(() => {
    const groups = new Map<string, Box[]>()
    for (const lot of lots) if (lot.decor) decorBoxes(lot, groups)
    return groups
  }, [lots])
  return <ColoredBoxes boxes={boxes} />
}

function Boat() {
  return (
    <>
      <mesh position={[0, 0, 0]} castShadow>
        <boxGeometry args={[1.3, 0.3, 0.55]} />
        <meshLambertMaterial color="#8b5a2b" />
      </mesh>
      <mesh position={[0, 0.6, 0]} castShadow>
        <boxGeometry args={[0.06, 1, 0.06]} />
        <meshLambertMaterial color="#5b3a1e" />
      </mesh>
      <mesh position={[-0.25, 0.65, 0]} castShadow>
        <boxGeometry args={[0.5, 0.8, 0.04]} />
        <meshLambertMaterial color="#fafafa" />
      </mesh>
    </>
  )
}

export default function Scenery({
  layout,
  nuked = false,
}: {
  layout: CityLayout
  nuked?: boolean
}) {
  return (
    <>
      <Ground layout={layout} nuked={nuked} />
      <RoadMarkings roads={layout.roads} halfWidth={layout.halfWidth} />
      <Props layout={layout} />
      <Decor lots={layout.lots} />
      {layout.roads.flatMap((road, r) =>
        [0, 1, 2].map((n) => (
          <Traveler
            key={`car-${r}-${n}`}
            route={road}
            offset={n / 3 + r * 0.17}
            speed={1.8 + ((n + r) % 3) * 0.5}
          >
            <Car color={CAR_COLORS[(r * 3 + n) % CAR_COLORS.length]} />
          </Traveler>
        )),
      )}
      {layout.boats.map((route, n) => (
        <Traveler
          key={`boat-${n}`}
          route={route}
          offset={n * 0.4}
          speed={0.8 + n * 0.3}
          lift={(t) => 0.03 * Math.sin(t * 1.5 + n)}
        >
          <Boat />
        </Traveler>
      ))}
    </>
  )
}
