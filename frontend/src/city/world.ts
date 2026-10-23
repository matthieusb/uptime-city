// Pure layout of the whole map, independent of three.js: one neighbourhood
// per physical host. The neighbourhoods are the plates of one ground, side by
// side in rows, each with its own look and a size that follows its host's
// score, and roads run from one to the next. Joining tiles of wild ground fill
// what no neighbourhood covers, so that there is never any void.
import {
  CRATER_TOP,
  cityLayout,
  fillerLayout,
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
  // The row of neighbourhoods it stands in.
  row: number
}

// The row of the first building that could cover part of a building of
// another row on screen, as in layout.ts, or -1 if there is none.
function hiderRow(lots: Placed[]): number {
  for (const a of lots) {
    for (const b of lots) {
      if (a.row === b.row) continue
      const sideways = Math.abs(a.x - b.x - (a.z - b.z)) / Math.SQRT2
      const depth = (a.x - b.x + (a.z - b.z)) / Math.SQRT2
      const reach = a.height * Math.sqrt(3) + 2 * HALF_SCREEN_WIDTH
      if (sideways < 2 * HALF_SCREEN_WIDTH + 1 && depth > 0 && depth < reach) {
        return a.row
      }
    }
  }
  return -1
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

// How much a physical host weighs in the size of its neighbourhood: the host
// itself, its own services, its vm-hosts and the services on these.
const HOST_SCORE = 20
const SERVICE_SCORE = 5
const VM_SCORE = 15
const VM_SERVICE_SCORE = 6

export function sizeScore(buildings: HostSpec[]): number {
  const [host, ...vms] = buildings
  return (
    HOST_SCORE +
    SERVICE_SCORE * (host?.services ?? 0) +
    vms.reduce((sum, vm) => sum + VM_SCORE + VM_SERVICE_SCORE * vm.services, 0)
  )
}

// Neighbourhoods are about this much wider than deep.
const ASPECT = 1.3

const odd = (n: number) =>
  Math.ceil(n) % 2 === 0 ? Math.ceil(n) + 1 : Math.ceil(n)

interface Size {
  width: number
  depth: number
}

// How much bigger than the one before it, at least, a neighbourhood is when
// its score is higher.
const GROWTH = 1.08

// The size of every neighbourhood, in tiles: the bigger its score, the bigger
// its area, and never too small for its buildings. Going up the scores, each
// area is at least that of the previous score, a little more.
function sizesOf(natural: Size[], scores: number[]): Size[] {
  const sizes: Size[] = []
  const ascending = scores
    .map((_, i) => i)
    .sort((a, b) => scores[a] - scores[b])
  let previous = 0
  let before = -Infinity
  for (const i of ascending) {
    const own = natural[i].width * natural[i].depth
    // The same score, the same area, or the nearest the buildings allow.
    const same = scores[i] === before
    sizes[i] = fit(
      natural[i],
      Math.max(own, same ? previous : previous * GROWTH),
    )
    const area = sizes[i].width * sizes[i].depth
    previous = same ? Math.max(previous, area) : area
    before = scores[i]
  }
  return sizes
}

// The size of at least this area, odd on both sides and not smaller than
// `min`, wide first or deep first, whichever overshoots the area the least.
function fit(min: Size, area: number): Size {
  const wide = odd(Math.max(min.width, Math.sqrt(area * ASPECT)))
  const deep = odd(Math.max(min.depth, Math.sqrt(area / ASPECT)))
  const options: Size[] = [
    { width: wide, depth: odd(Math.max(min.depth, area / wide)) },
    { width: odd(Math.max(min.width, area / deep)), depth: deep },
  ]
  return options.sort((p, q) => p.width * p.depth - q.width * q.depth)[0]
}

// Cuts the neighbourhoods, deepest first, into rows no wider than `limit`.
function shelves(order: number[], sizes: Size[], limit: number): number[][] {
  const rows: number[][] = []
  let width = 0
  for (const i of order) {
    if (rows.length === 0 || width + sizes[i].width > limit) {
      rows.push([])
      width = 0
    }
    rows[rows.length - 1].push(i)
    width += sizes[i].width
  }
  return rows
}

const rowWidth = (row: number[], sizes: Size[]) =>
  row.reduce((sum, i) => sum + sizes[i].width, 0)
const rowDepth = (row: number[], sizes: Size[]) =>
  Math.max(...row.map((i) => sizes[i].depth))

// The rows that make the map as square as possible, without wasting much
// ground on joining tiles.
function chooseRows(sizes: Size[]): number[][] {
  const order = sizes
    .map((_, i) => i)
    .sort((a, b) => sizes[b].depth - sizes[a].depth || a - b)
  const area = sizes.reduce((sum, s) => sum + s.width * s.depth, 0)
  const widest = Math.max(...sizes.map((s) => s.width))
  const total = sizes.reduce((sum, s) => sum + s.width, 0)
  let best: number[][] = []
  let bestScore = Infinity
  for (let limit = widest; limit <= total; limit++) {
    const rows = shelves(order, sizes, limit)
    const width = Math.max(...rows.map((r) => rowWidth(r, sizes)))
    const depth = rows.reduce((sum, r) => sum + rowDepth(r, sizes), 0)
    const score =
      Math.abs(Math.log(width / depth)) + (2 * (width * depth - area)) / area
    if (score < bestScore) [best, bestScore] = [rows, score]
  }
  return best
}

export function worldLayout(specs: NeighbourhoodSpec[]): World {
  const themeOf = (i: number) => THEMES[i % THEMES.length]
  // The joining tiles look different from the neighbourhood they touch.
  const otherThan = (i: number) => THEMES[(i + 1) % THEMES.length]
  const items = specs.map(withDecor)
  if (specs.length === 0) {
    return { neighbourhoods: [], wilds: [], halfWidth: 0, halfDepth: 0 }
  }

  // Each neighbourhood is as big as its score says, and the map is made of
  // rows of them, as square as possible. Where a neighbourhood is smaller than
  // its row, a joining tile fills the rest.
  const natural = items.map((hosts, i) => cityLayout(hosts, themeOf(i)))
  const sizes = sizesOf(
    natural.map((l) => ({ width: 2 * l.halfWidth, depth: 2 * l.halfDepth })),
    specs.map((s) => sizeScore(s.buildings)),
  )
  // The tallest buildings stand at the back, where they hide the least.
  const tallest = (row: number[]) =>
    Math.max(...row.flatMap((i) => natural[i].lots.map((l) => l.height)))
  const rows = chooseRows(sizes).sort((a, b) => tallest(b) - tallest(a))
  const mapWidth = Math.max(...rows.map((r) => rowWidth(r, sizes)))
  const layouts = new Map<number, CityLayout>()
  rows.forEach((row, r) =>
    row.forEach((i, c) =>
      layouts.set(
        i,
        linkRoads(
          cityLayout(
            items[i],
            themeOf(i),
            (sizes[i].width - 1) / 2,
            sizes[i].depth / 2,
          ),
          {
            sideways: row.length > 1,
            below: c === 0 && r < rows.length - 1,
            above: c === 0 && r > 0,
          },
        ),
      ),
    ),
  )

  // When buildings of a row could hide those of a row behind it, that row
  // grows deeper, with joining tiles, instead of moving apart.
  const build = (extra: number[]): World => {
    const neighbourhoods = new Map<number, Neighbourhood>()
    const wilds: Neighbourhood[] = []
    const wild = (
      width: number,
      depth: number,
      x: number,
      z: number,
      theme: Theme,
      roadColumn = false,
    ) => {
      const id = `filler-${wilds.length}`
      wilds.push({
        id,
        x,
        z,
        layout: fillerLayout(width, depth, theme, id, roadColumn),
      })
    }
    let back = 0
    rows.forEach((row, r) => {
      const height = rowDepth(row, sizes) + extra[r]
      let left = 0
      row.forEach((i, c) => {
        const { width, depth } = sizes[i]
        // The neighbourhoods stand against the front of their row.
        neighbourhoods.set(i, {
          id: specs[i].id,
          x: left + width / 2,
          z: back + height - depth / 2,
          layout: layouts.get(i)!,
        })
        if (height > depth) {
          wild(
            width,
            height - depth,
            left + width / 2,
            back + (height - depth) / 2,
            otherThan(i),
            c === 0,
          )
        }
        left += width
      })
      if (left < mapWidth) {
        const last = row[row.length - 1]
        wild(
          mapWidth - left,
          height,
          left + (mapWidth - left) / 2,
          back + height / 2,
          otherThan(last),
        )
      }
      back += height
    })
    // The middle of the map is the origin.
    const move = (n: Neighbourhood): Neighbourhood => ({
      ...n,
      x: n.x - mapWidth / 2,
      z: n.z - back / 2,
    })
    const plates = specs.map((_, i) => move(neighbourhoods.get(i)!))
    const joins = wilds.map(move)
    const all = [...plates, ...joins]
    return {
      neighbourhoods: plates,
      wilds: joins,
      halfWidth: Math.max(
        ...all.map((n) => Math.abs(n.x) + n.layout.halfWidth),
      ),
      halfDepth: Math.max(
        ...all.map((n) => Math.abs(n.z) + n.layout.halfDepth),
      ),
    }
  }
  const rowOf = new Map<number, number>()
  rows.forEach((row, r) => row.forEach((i) => rowOf.set(i, r)))
  const lotsOf = (world: World): Placed[] =>
    world.neighbourhoods.flatMap((n, i) =>
      n.layout.lots.map((l) => ({
        x: l.x + n.x,
        z: l.z + n.z,
        height: l.height,
        row: rowOf.get(i)!,
      })),
    )

  const extra = rows.map(() => 0)
  let world = build(extra)
  for (let tries = 0; tries < 500; tries++) {
    const hider = hiderRow(lotsOf(world))
    if (hider < 0) break
    extra[hider] += 2
    world = build(extra)
  }
  return world
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
