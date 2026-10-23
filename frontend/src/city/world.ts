// Pure layout of the whole map, independent of three.js: one neighbourhood
// per physical host. The neighbourhoods are the plates of one ground, side by
// side in a grid, each with its own look, and roads run from one to the next.
// The cells of the grid that no host fills are wilderness.
import {
  CRATER_TOP,
  cityLayout,
  HALF_SCREEN_WIDTH,
  ROAD_TOP,
  type CityLayout,
  type DecorKind,
  type HostSpec,
  type Theme,
} from './layout'

// A physical host: the buildings it is monitored through, its own first and
// then one per vm-host.
export interface NeighbourhoodSpec {
  id: string
  buildings: HostSpec[]
}

export interface Neighbourhood {
  id: string
  // Where the middle of its plate stands on the map.
  x: number
  z: number
  layout: CityLayout
}

export interface World {
  neighbourhoods: Neighbourhood[]
  // The plates that no host fills.
  wilds: Neighbourhood[]
  // Half sizes of the map, along X and Z.
  halfWidth: number
  halfDepth: number
}

// Neighbouring neighbourhoods get different looks.
const THEMES: Theme[] = ['coastal', 'meadow', 'desert', 'snow']
// What stands around the monitored buildings, and is not monitored.
const BEFORE: DecorKind[] = ['houses']
const AFTER: DecorKind[] = ['supermarket', 'parking']

function withDecor(spec: NeighbourhoodSpec): HostSpec[] {
  const decor = (kind: DecorKind, n: number): HostSpec => ({
    id: `${spec.id}:decor-${n}`,
    services: 0,
    decor: kind,
  })
  return [
    ...BEFORE.map((kind, n) => decor(kind, n)),
    ...spec.buildings,
    ...AFTER.map((kind, n) => decor(kind, BEFORE.length + n)),
  ]
}

interface Placed {
  x: number
  z: number
  height: number
}

// Whether a building could cover part of another on screen, as in layout.ts.
function hidesSomething(lots: Placed[]): boolean {
  for (const a of lots) {
    for (const b of lots) {
      if (a === b) continue
      const sideways = Math.abs(a.x - b.x - (a.z - b.z)) / Math.SQRT2
      const depth = (a.x - b.x + (a.z - b.z)) / Math.SQRT2
      const reach = a.height * Math.sqrt(3) + 2 * HALF_SCREEN_WIDTH
      if (sideways < 2 * HALF_SCREEN_WIDTH + 1 && depth > 0 && depth < reach) {
        return true
      }
    }
  }
  return false
}

// Roads are 2 tiles wide. One crosses every row of plates, and one links the
// rows along the left edge of the plates.
function linkRoads(
  layout: CityLayout,
  {
    sideways,
    below,
    above,
  }: { sideways: boolean; below: boolean; above: boolean },
): CityLayout {
  const xs = layout.tiles.map((t) => t.x)
  const zs = layout.tiles.map((t) => t.z)
  const [xMin, xMax] = [Math.min(...xs), Math.max(...xs)]
  const [zMin, zMax] = [Math.min(...zs), Math.max(...zs)]
  // The front road, made straight where it meets the next plate.
  const row = Math.ceil(layout.roads[0].z - 1)
  const painted = new Set<string>()
  if (sideways) {
    for (let x = xMin; x <= xMax; x++) {
      for (const z of [row, row + 1]) painted.add(`${x},${z}`)
    }
  }
  for (const x of [xMin + 2, xMin + 3]) {
    if (below) for (let z = row; z <= zMax; z++) painted.add(`${x},${z}`)
    if (above) for (let z = zMin; z <= row + 1; z++) painted.add(`${x},${z}`)
  }
  if (painted.size === 0) return layout
  const onRoad = (p: { x: number; z: number }) =>
    painted.has(`${Math.round(p.x)},${Math.round(p.z)}`)
  return {
    ...layout,
    tiles: layout.tiles.map((t) =>
      onRoad(t) ? { ...t, kind: 'road', top: ROAD_TOP } : t,
    ),
    trees: layout.trees.filter((t) => !onRoad(t)),
    flowers: layout.flowers.filter((f) => !onRoad(f)),
    reeds: layout.reeds.filter((r) => !onRoad(r)),
    rocks: layout.rocks.filter((r) => !onRoad(r)),
    umbrellas: layout.umbrellas.filter((u) => !onRoad(u)),
  }
}

// How many plates side by side make the map as square as possible, without
// leaving many cells empty.
function chooseColumns(plates: number, width: number, depth: number): number {
  let best = 1
  let bestScore = Infinity
  for (let columns = 1; columns <= plates; columns++) {
    const rows = Math.ceil(plates / columns)
    const aspect = (columns * width) / (rows * depth)
    const empty = columns * rows - plates
    const score = Math.abs(Math.log(aspect)) + 0.1 * empty
    if (score < bestScore) [best, bestScore] = [columns, score]
  }
  return best
}

export function worldLayout(specs: NeighbourhoodSpec[]): World {
  const themeOf = (i: number) => THEMES[i % THEMES.length]
  const items = specs.map(withDecor)

  // Every plate is as wide as the widest one, so that they fit together.
  const natural = items.map((hosts, i) => cityLayout(hosts, themeOf(i)))
  const halfWidth = Math.max(0, ...natural.map((l) => l.halfWidth))
  const minHalfWidth = Math.round(halfWidth - 0.5)
  const halfDepth = Math.max(0, ...natural.map((l) => l.halfDepth))
  const columns = specs.length
    ? chooseColumns(specs.length, 2 * halfWidth, 2 * halfDepth)
    : 0
  const rows = columns ? Math.ceil(specs.length / columns) : 0
  const layouts = Array.from({ length: columns * rows }, (_, i) =>
    cityLayout(items[i] ?? [], themeOf(i), minHalfWidth),
  )
  const cellWidth = 2 * Math.max(0, ...layouts.map((l) => l.halfWidth))
  const cellDepth = 2 * Math.max(0, ...layouts.map((l) => l.halfDepth))

  const place = (more: number): Neighbourhood[] =>
    layouts.map((layout, i) => {
      const row = Math.floor(i / columns)
      const column = i % columns
      return {
        id: specs[i]?.id ?? `wild-${i - specs.length}`,
        x: (column - (columns - 1) / 2) * cellWidth,
        z: (row - (rows - 1) / 2) * (cellDepth + more),
        layout: linkRoads(layout, {
          sideways: columns > 1,
          below: row < rows - 1,
          above: row > 0,
        }),
      }
    })
  const lotsOf = (plates: Neighbourhood[]): Placed[] =>
    plates.flatMap((n) =>
      n.layout.lots.map((l) => ({
        x: l.x + n.x,
        z: l.z + n.z,
        height: l.height,
      })),
    )

  // Buildings of a plate could hide those of the plate behind it, if they are
  // very tall: then only, move the rows apart.
  let plates = place(0)
  for (let more = 2; hidesSomething(lotsOf(plates)) && more < 200; more += 2) {
    plates = place(more)
  }

  return {
    neighbourhoods: plates.slice(0, specs.length),
    wilds: plates.slice(specs.length),
    halfWidth: Math.max(
      0,
      ...plates.map((n) => Math.abs(n.x) + n.layout.halfWidth),
    ),
    halfDepth: Math.max(
      0,
      ...plates.map((n) => Math.abs(n.z) + n.layout.halfDepth),
    ),
  }
}

// The ground of a neighbourhood after a nuke: the decoration, the trees, the
// flowers and the traffic are gone, and a crater is dug at the middle, except
// under the buildings, which are left in ruins.
export function nukedLayout(layout: CityLayout): CityLayout {
  const lots = layout.lots.filter((lot) => !lot.decor)
  const water = new Set(['water', 'shallow', 'pond'])
  const dug = (t: { x: number; z: number; kind: string }) => {
    // A ragged edge.
    const radius = 7 * (0.8 + 0.2 * Math.sin(3 * Math.atan2(t.z, t.x)))
    return (
      !water.has(t.kind) &&
      Math.hypot(t.x, t.z) <= radius &&
      lots.every((lot) => Math.hypot(t.x - lot.x, t.z - lot.z) > 2.5)
    )
  }
  return {
    ...layout,
    lots,
    roads: [],
    boats: [],
    pier: [],
    patches: [],
    trees: [],
    flowers: [],
    reeds: [],
    umbrellas: [],
    tiles: layout.tiles.map((t) =>
      dug(t) ? { ...t, kind: 'crater', top: CRATER_TOP } : t,
    ),
  }
}

// What the camera frames: the size of the map on screen (in tiles), the point
// of the ground at the middle of it, and how far the camera stands from there.
export interface Frame {
  width: number
  height: number
  target: [number, number, number]
  distance: number
}

// The camera looks along the (-1, -1) diagonal, 30° above the ground: a point
// is to the right along (1, 0, -1), up with Y, and lower the closer it is.
const PITCH = Math.PI / 6

export function worldFrame(world: World, top: number): Frame {
  // The corners of every plate, at ground level and at the top of the tallest
  // building. An empty map shows a plate of the smallest size.
  const all = [...world.neighbourhoods, ...world.wilds]
  const plates = all.length
    ? all.map((n) => ({
        x: n.x,
        z: n.z,
        halfWidth: n.layout.halfWidth,
        halfDepth: n.layout.halfDepth,
      }))
    : [{ x: 0, z: 0, halfWidth: 14, halfDepth: 14 }]
  const points = plates.flatMap((p) =>
    [-1, 1].flatMap((dx) =>
      [-1, 1].flatMap((dz) =>
        [0, top].map((y) => {
          const x = p.x + dx * p.halfWidth
          const z = p.z + dz * p.halfDepth
          return {
            sx: (x - z) / Math.SQRT2,
            sy: y * Math.cos(PITCH) - ((x + z) / Math.SQRT2) * Math.sin(PITCH),
          }
        }),
      ),
    ),
  )
  const sxs = points.map((p) => p.sx)
  const sys = points.map((p) => p.sy)
  const [left, right] = [Math.min(...sxs), Math.max(...sxs)]
  const [bottom, up] = [Math.min(...sys), Math.max(...sys)]
  // The point of the ground that is at the middle of the screen.
  const u = (left + right) / 2
  const v = (-2 * (bottom + up)) / 2
  const target: [number, number, number] = [
    (u + v) / Math.SQRT2,
    0,
    (v - u) / Math.SQRT2,
  ]
  const reach =
    world.halfWidth +
    world.halfDepth +
    Math.abs(target[0]) +
    Math.abs(target[2])
  return {
    width: right - left,
    height: up - bottom,
    target,
    distance: Math.max(150, reach + 80),
  }
}
