import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef, type ReactNode } from 'react'
import { Color, Object3D, type Group, type InstancedMesh } from 'three'
import { airportBoxes } from './airport'
import { CAR_COLORS } from './traffic'
import { trackBoxes } from './trackBoxes'
import {
  carPoint,
  hash,
  roadZ,
  type CityLayout,
  type Lot,
  type Point,
  type Road,
  type Structure,
  type Tile,
  type Tree,
} from './layout'
import type { Biome } from './biomes'

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
  snow: '#f2f6fa',
  ice: '#bfe3f2',
  court: '#c4683f',
  path: '#c8b48c',
  island: '#4f9a32',
  track: '#8a8378',
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
  snow: '#6a6660',
  ice: '#4a5560',
  court: '#4a3a32',
  path: '#4e463e',
  island: '#352f2a',
  track: '#3a352f',
}

// What changes from one biome to another: the ground and the hills, which
// get darker and rockier as they rise, and snowy at the top of mountains.
const BIOME_TILES: Record<Biome, Partial<Record<Tile['kind'], string>>> = {
  forest: { grass: '#4f9a32' },
  city: { grass: '#6dba3f' },
  coastal: {},
  mountain: { grass: '#6c9450', plaza: '#b4b4ae', path: '#a99f8e' },
  desert: {
    grass: '#e3bf73',
    sand: '#e8cf8f',
    plaza: '#cdb98e',
    path: '#c9a565',
  },
  tundra: {
    grass: '#e9eff3',
    sand: '#dfe6ec',
    plaza: '#cfd6dc',
    path: '#b3aca0',
  },
}
const BIOME_HILLS: Record<Biome, string[]> = {
  forest: ['#4f9a32', '#47902e', '#3f852a', '#387a26', '#6f7d5c'],
  city: ['#6dba3f', '#63b03a', '#58a334', '#4d962e', '#7d8a6a'],
  coastal: ['#5fa83a', '#56a036', '#4d9631', '#468a2c', '#7d8a6a'],
  mountain: [
    '#6c9450',
    '#5f8448',
    '#7d8470',
    '#8e8e88',
    '#a5a5a0',
    '#e8eef3',
    '#f8fbfd',
  ],
  desert: ['#e3bf73', '#d9a95a', '#cf9a4c', '#c58b3f', '#a8794a'],
  tundra: ['#e9eff3', '#dde6ee', '#cdd8e2', '#b9c4cf', '#a9b4bf'],
}
// The moss of the tundra and the snow of the mountains, here and there.
const SPECKLES: Partial<Record<Biome, [string, number]>> = {
  tundra: ['#9fae8a', 0.2],
  mountain: ['#eef3f7', 0.08],
}

// Stable value in [0, 1) per tile.
function fraction(tile: Tile, a: number, b: number): number {
  const n = Math.sin(tile.x * a + tile.z * b) * 43758.5453
  return n - Math.floor(n)
}

// Stable shade in [0.93, 1.07] per tile, for a hand-drawn look.
function shade(tile: Tile): number {
  return 0.93 + 0.14 * fraction(tile, 12.9898, 78.233)
}

function tileColor(tile: Tile, color: Color, nuked: boolean): Color {
  const hills = BIOME_HILLS[tile.biome]
  const speckle = SPECKLES[tile.biome]
  const base = nuked
    ? ASH_COLORS[tile.kind]
    : tile.kind === 'hill'
      ? hills[Math.min(hills.length - 1, Math.round((tile.top - 0.05) / 0.5))]
      : tile.kind === 'grass' &&
          speckle &&
          fraction(tile, 39.346, 11.135) < speckle[1]
        ? speckle[0]
        : (BIOME_TILES[tile.biome][tile.kind] ?? TILE_COLORS[tile.kind])
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

// One mesh for all the tiles of a kind, each with its own color.
function TileMesh({
  tiles,
  water,
  nuked,
}: {
  tiles: Tile[]
  water: boolean
  nuked: boolean
}) {
  const mesh = useRef<InstancedMesh>(null)
  const dummy = useMemo(() => new Object3D(), [])

  useLayoutEffect(() => {
    if (!mesh.current) return
    const color = new Color()
    tiles.forEach((tile, i) => {
      placeTile(mesh.current!, dummy, tile, i, tile.top)
      mesh.current!.setColorAt(i, tileColor(tile, color, nuked))
    })
    mesh.current.instanceMatrix.needsUpdate = true
    if (mesh.current.instanceColor)
      mesh.current.instanceColor.needsUpdate = true
  }, [tiles, dummy, nuked])

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
      <TileMesh tiles={land} water={false} nuked={nuked} />
      <TileMesh tiles={water} water nuked={nuked} />
    </>
  )
}

// The dashed line in the middle of the roads, along X or along Z. The
// paths have none.
function RoadMarkings({ roads }: { roads: Road[] }) {
  const dashes = useMemo(
    () =>
      roads.flatMap((road) => {
        const list: Box[] = []
        for (
          let along = Math.ceil(road.xMin) + 0.5;
          along <= road.xMax - 0.25;
          along += 2
        ) {
          const across = roadZ(road, along)
          list.push(
            road.vertical
              ? { x: across, y: 0.07, z: along, sx: 0.08, sy: 0.03, sz: 0.5 }
              : { x: along, y: 0.07, z: across, sx: 0.5, sy: 0.03, sz: 0.08 },
          )
        }
        return list
      }),
    [roads],
  )
  return <InstancedBoxes boxes={dashes} color="#f1f1e6" />
}

// The railway on a plate: ballast, sleepers, rails and the marks of its level crossings.
function Rails({ layout }: { layout: CityLayout }) {
  const boxes = useMemo(
    () => trackBoxes(layout.tracks, layout.halfWidth, layout.halfDepth),
    [layout.tracks, layout.halfWidth, layout.halfDepth],
  )
  return <ColoredBoxes boxes={boxes} />
}

// The island of a roundabout: a white curb, flowers and a round tree.
function Roundabouts({ centers }: { centers: Point[] }) {
  const boxes = useMemo(() => {
    const groups = new Map<string, Box[]>()
    for (const { x, y, z } of centers) {
      const box = (
        color: string,
        dy: number,
        sx: number,
        sy: number,
        sz: number,
        dx = 0,
        dz = 0,
      ) =>
        addBox(groups, color, { x: x + dx, y: y + dy, z: z + dz, sx, sy, sz })
      box('#ecebe4', -0.04, 2.08, 0.1, 2.08)
      box('#4f9a32', 0.02, 1.8, 0.04, 1.8)
      for (const [dx, dz] of [
        [-0.6, -0.6],
        [0.6, -0.6],
        [-0.6, 0.6],
        [0.6, 0.6],
      ]) {
        box(
          FLOWER_RING[(dx > 0 ? 1 : 0) + (dz > 0 ? 2 : 0)],
          0.1,
          0.3,
          0.12,
          0.3,
          dx,
          dz,
        )
      }
      box('#6b4226', 0.4, 0.18, 0.7, 0.18)
      box('#2e8b3e', 1.0, 0.9, 0.7, 0.9)
      box('#3fae4f', 1.45, 0.5, 0.3, 0.5)
    }
    return groups
  }, [centers])
  return <ColoredBoxes boxes={boxes} />
}
const FLOWER_RING = ['#ff5d8f', '#ffd23f', '#c77dff', '#ff8c42']

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
  // A fir with snow on its tiers.
  fir: [
    ['#5a3a22', 0.2, 0.18, 0.4, 0.18],
    ['#174f30', 0.6, 0.95, 0.42, 0.95],
    ['#eef4f8', 0.84, 0.7, 0.06, 0.7],
    ['#1b5c37', 1.05, 0.7, 0.42, 0.7],
    ['#eef4f8', 1.29, 0.48, 0.06, 0.48],
    ['#20683f', 1.5, 0.42, 0.42, 0.42],
    ['#f6fafc', 1.78, 0.2, 0.16, 0.2],
  ],
  cactus: [
    ['#3f8f4a', 0.6, 0.26, 1.2, 0.26],
    ['#3f8f4a', 0.55, 0.5, 0.14, 0.14],
    ['#3f8f4a', 0.78, 0.12, 0.42, 0.14],
    ['#478f3a', 0.7, 0.14, 0.12, 0.42],
    ['#478f3a', 0.88, 0.14, 0.38, 0.12],
    ['#f08fb0', 1.24, 0.1, 0.08, 0.1],
  ],
  shrub: [
    ['#6a7a4a', 0.18, 0.55, 0.36, 0.5],
    ['#7c8c55', 0.4, 0.32, 0.2, 0.3],
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

const AWNINGS = ['#e63946', '#219ebc', '#ffb703', '#06d6a0', '#8338ec']

// Boxes of a small structure of a city or a beach, around its middle.
function structureBoxes(s: Structure, groups: Map<string, Box[]>) {
  const salt = `${s.kind}:${s.x},${s.z}`
  const box = (
    color: string,
    dx: number,
    y: number,
    dz: number,
    sx: number,
    sy: number,
    sz: number,
  ) =>
    addBox(groups, color, { x: s.x + dx, y: s.y + y, z: s.z + dz, sx, sy, sz })
  const pick = <T,>(list: T[], n = 0) =>
    list[hash(`${salt}:${n}`) % list.length]

  switch (s.kind) {
    case 'house':
      box(pick(PASTELS), 0, 0.45, 0, 1.3, 0.9, 1.3)
      box(
        pick(['#a04040', '#6a4a3a', '#44546a'], 1),
        0,
        1.02,
        0,
        1.5,
        0.25,
        1.5,
      )
      box(pick(['#a04040', '#6a4a3a', '#44546a'], 1), 0, 1.24, 0, 0.9, 0.2, 0.9)
      box('#5a3e2b', 0.66, 0.3, 0, 0.04, 0.6, 0.35)
      box('#9fd3ff', 0, 0.55, 0.66, 0.35, 0.3, 0.04)
      // A hedge along the garden.
      box('#3f7f34', 0, 0.15, 0.9, 1.8, 0.3, 0.16)
      break
    case 'shop': {
      const awning = pick(AWNINGS)
      box('#ece6da', 0, 0.6, -0.1, 2.6, 1.2, 1.4)
      box('#8a8f98', 0, 1.25, -0.1, 2.8, 0.1, 1.6)
      box(awning, 0, 0.95, 0.7, 2.6, 0.08, 0.35)
      box(awning, 0, 1.4, 0.62, 1.6, 0.25, 0.06)
      box('#2b3a55', 0, 0.45, 0.61, 1.8, 0.6, 0.04)
      break
    }
    case 'parking':
      box('#4a4a52', 0, 0.02, 0, 2.8, 0.04, 2.8)
      for (const dx of [-0.95, 0, 0.95]) {
        box('#f1f1f1', dx + 0.47, 0.05, -0.6, 0.05, 0.02, 1.2)
      }
      for (const [n, dx] of [-0.95, 0, 0.95].entries()) {
        if (hash(`${salt}:car${n}`) % 3 === 0) continue
        box(pick(CAR_COLORS, n), dx, 0.22, -0.6, 0.5, 0.25, 0.9)
        box('#9fd3ff', dx, 0.42, -0.6, 0.42, 0.18, 0.45)
      }
      break
    case 'tennis':
      // White lines on the clay, a net across the middle and the posts of a fence.
      box('#f4f1ea', 0, 0.01, -1.9, 2.4, 0.02, 0.06)
      box('#f4f1ea', 0, 0.01, 1.9, 2.4, 0.02, 0.06)
      box('#f4f1ea', -1.2, 0.01, 0, 0.06, 0.02, 3.86)
      box('#f4f1ea', 1.2, 0.01, 0, 0.06, 0.02, 3.86)
      box('#f4f1ea', 0, 0.01, 0, 0.04, 0.02, 2)
      box('#3a3a3a', 0, 0.15, 0, 2.6, 0.24, 0.04)
      box('#fafafa', 0, 0.28, 0, 2.6, 0.04, 0.05)
      for (const dx of [-1.45, 1.45]) {
        for (const dz of [-2.45, 2.45])
          box('#2f5d3a', dx, 0.3, dz, 0.08, 0.6, 0.08)
      }
      break
    case 'clubhouse': {
      const awning = pick(AWNINGS)
      box('#ece6da', 0, 0.55, 0, 2.6, 1.1, 1.5)
      box('#7a3b2e', 0, 1.18, 0, 2.9, 0.16, 1.8)
      box('#7a3b2e', 0, 1.36, 0, 1.8, 0.2, 1.1)
      box(awning, 0, 0.9, 0.85, 2.2, 0.08, 0.3)
      box('#2b3a55', 0, 0.45, 0.76, 1.2, 0.6, 0.04)
      break
    }
    case 'stadium': {
      // A striped pitch with its lines, stands along the four sides and a
      // floodlight at each corner.
      for (const [n, dx] of [-2.8, -0.93, 0.93, 2.8].entries()) {
        box(n % 2 ? '#4fb04f' : '#43a043', dx, 0.05, 0, 1.87, 0.04, 4)
      }
      box('#f4f1ea', 0, 0.08, -1.95, 7, 0.02, 0.06)
      box('#f4f1ea', 0, 0.08, 1.95, 7, 0.02, 0.06)
      box('#f4f1ea', -3.47, 0.08, 0, 0.06, 0.02, 3.9)
      box('#f4f1ea', 3.47, 0.08, 0, 0.06, 0.02, 3.9)
      box('#f4f1ea', 0, 0.08, 0, 0.05, 0.02, 3.9)
      for (const dz of [-2.9, 2.9]) {
        box('#b9b6aa', 0, 0.45, dz, 9, 0.9, 1.2)
        box('#c0392b', 0, 0.95, dz, 8.4, 0.1, 0.9)
        box('#b9b6aa', 0, 1.25, dz * 1.12, 9, 0.5, 0.5)
      }
      for (const dx of [-4.2, 4.2]) {
        box('#b9b6aa', dx, 0.35, 0, 0.6, 0.7, 4.4)
        box('#c0392b', dx, 0.75, 0, 0.45, 0.1, 4.2)
      }
      for (const dx of [-4.3, 4.3]) {
        for (const dz of [-3.2, 3.2]) {
          box('#8a8f98', dx, 1.05, dz, 0.12, 2.1, 0.12)
          box('#fff7c2', dx, 2.15, dz, 0.4, 0.15, 0.3)
        }
      }
      break
    }
    case 'airport':
      airportBoxes(s, (color, b) => addBox(groups, color, b))
      break
    case 'kiosk': {
      const awning = pick(AWNINGS)
      box(
        pick(['#f7d08a', '#a6d8f4', '#f4a6a6', '#fafafa'], 1),
        0,
        0.4,
        0,
        1.4,
        0.8,
        0.7,
      )
      box('#7a5230', 0, 0.84, 0, 1.6, 0.08, 0.9)
      // A striped awning on the side of the sea.
      for (let n = 0; n < 4; n++) {
        box(
          n % 2 ? '#fafafa' : awning,
          -0.6 + n * 0.4,
          0.72,
          0.5,
          0.4,
          0.06,
          0.35,
        )
      }
      box(awning, 0, 1.0, 0, 0.8, 0.25, 0.06)
      break
    }
  }
}

// Houses, shops, car parks, tennis clubs, a stadium and kiosks around the town.
function Structures({ structures }: { structures: Structure[] }) {
  const boxes = useMemo(() => {
    const groups = new Map<string, Box[]>()
    for (const s of structures) structureBoxes(s, groups)
    return groups
  }, [structures])
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
      <RoadMarkings roads={layout.roads} />
      <Roundabouts centers={layout.roundabouts} />
      <Rails layout={layout} />
      <Props layout={layout} />
      <Decor lots={layout.lots} />
      <Structures structures={layout.structures} />
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
