// Pure layout of the whole map, independent of three.js: one neighbourhood
// per physical host. The neighbourhoods are the plates of one ground, side by
// side in rows, each with its own look and its own size, and roads run from
// one to the next. There is never any void between them.
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

interface Size {
  width: number
  depth: number
}

// Cuts the plates into rows of the given length: a row is as deep as its
// deepest plate, and the map as wide as its widest row.
function rowsOf<T>(items: T[], columns: number): T[][] {
  const rows: T[][] = []
  for (let i = 0; i < items.length; i += columns) {
    rows.push(items.slice(i, i + columns))
  }
  return rows
}

// How many plates side by side make the map as square as possible, without
// wasting much ground on padding.
function chooseColumns(sizes: Size[]): number {
  const area = sizes.reduce((sum, s) => sum + s.width * s.depth, 0)
  let best = 1
  let bestScore = Infinity
  for (let columns = 1; columns <= sizes.length; columns++) {
    const rows = rowsOf(sizes, columns)
    const width = Math.max(
      ...rows.map((row) => row.reduce((sum, s) => sum + s.width, 0)),
    )
    const depth = rows.reduce(
      (sum, row) => sum + Math.max(...row.map((s) => s.depth)),
      0,
    )
    const score = Math.abs(Math.log(width / depth)) + (width * depth) / area
    if (score < bestScore) [best, bestScore] = [columns, score]
  }
  return best
}

export function worldLayout(specs: NeighbourhoodSpec[]): World {
  const themeOf = (i: number) => THEMES[i % THEMES.length]
  const items = specs.map(withDecor)

  // Every neighbourhood is as big as its buildings need: the less services
  // and vms, the smaller. The plates of a row are as deep as the deepest of
  // them, and every row as wide as the widest, so that they fit together.
  const natural = items.map((hosts, i) => cityLayout(hosts, themeOf(i)))
  const columns = specs.length
    ? chooseColumns(
        natural.map((l) => ({
          width: 2 * l.halfWidth,
          depth: 2 * l.halfDepth,
        })),
      )
    : 0
  const rowsIndex = rowsOf(
    specs.map((_, i) => i),
    columns,
  )
  const rowWidth = (row: number[]) =>
    row.reduce((sum, i) => sum + 2 * natural[i].halfWidth, 0)
  const mapWidth = Math.max(0, ...rowsIndex.map(rowWidth))

  // The plates touch each other: when buildings of a plate could hide those
  // of the plate behind it, the plates all grow deeper instead of moving apart.
  const build = (more: number): Neighbourhood[] => {
    const depths = rowsIndex.map(
      (row) => Math.max(...row.map((i) => natural[i].halfDepth)) + more / 2,
    )
    const height = 2 * depths.reduce((sum, d) => sum + d, 0)
    const plates: Neighbourhood[] = []
    let z = -height / 2
    rowsIndex.forEach((row, r) => {
      // The last plate of a row takes the width the row lacks.
      const spare = (mapWidth - rowWidth(row)) / 2
      let x = -mapWidth / 2
      row.forEach((i, c) => {
        const last = c === row.length - 1
        const layout = cityLayout(
          items[i],
          themeOf(i),
          natural[i].halfWidth - 0.5 + (last ? spare : 0),
          depths[r],
        )
        plates.push({
          id: specs[i].id,
          x: x + layout.halfWidth,
          z: z + layout.halfDepth,
          layout: linkRoads(layout, {
            sideways: row.length > 1,
            below: c === 0 && r < rowsIndex.length - 1,
            above: c === 0 && r > 0,
          }),
        })
        x += 2 * layout.halfWidth
      })
      z += 2 * depths[r]
    })
    return plates
  }
  const lotsOf = (plates: Neighbourhood[]): Placed[] =>
    plates.flatMap((n) =>
      n.layout.lots.map((l) => ({
        x: l.x + n.x,
        z: l.z + n.z,
        height: l.height,
      })),
    )

  let plates = build(0)
  for (let more = 2; hidesSomething(lotsOf(plates)) && more < 200; more += 2) {
    plates = build(more)
  }

  return {
    neighbourhoods: plates,
    wilds: [],
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
