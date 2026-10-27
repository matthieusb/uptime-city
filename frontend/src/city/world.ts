// Pure layout of the whole map, independent of three.js: one neighbourhood
// per physical host. The neighbourhoods are the plates of one ground, side by
// side in rows, each with its own look and a size that follows its host's
// score, and roads run from one to the next. Joining tiles of wild ground fill
// what no neighbourhood covers, so that there is never any void. Each plate
// has the biomes of where it stands (see biomes.ts), and they mix where two
// plates meet. One network of roads runs across the plates: straight roads
// along X, roads along Z that link them, and roundabouts where they meet.
import {
  mainBiome,
  secondBiome,
  type Biome,
  type Biomes,
  type Spot,
} from './biomes'
import {
  CRATER_TOP,
  cityLayout,
  fillerLayout,
  type CityLayout,
  type DecorKind,
  type HostSpec,
} from './layout'
import { placeAirport } from './airport'
import { layRoads } from './map/roads'
import { carveSeas } from './map/seas'
import { blendSeams } from './map/seams'
import {
  chooseRows,
  rowDepth,
  rowWidth,
  sizeScore,
  sizesOf,
} from './map/sizing'
import { clearWilds } from './map/wilds'
import { placeMonuments } from './monuments'
import { layTracks, type Track } from './tracks'

export { sizeScore }

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

// A straight road of the map, 2 tiles wide: along X, its center line is at
// z = at, from x = from to x = to; along Z, the other way round.
export interface Way {
  vertical: boolean
  at: number
  from: number
  to: number
}

export interface World {
  neighbourhoods: Neighbourhood[]
  // The plates that no host fills.
  wilds: Neighbourhood[]
  // Half sizes of the map, along X and Z.
  halfWidth: number
  halfDepth: number
  // The roads across the plates, and the middles of their roundabouts.
  ways: Way[]
  roundabouts: { x: number; z: number }[]
  // The railway across the whole map, if there is room for one.
  track: Track | null
}

// The plates and the size of a map, all a camera needs to frame it.
type Ground = Pick<
  World,
  'neighbourhoods' | 'wilds' | 'halfWidth' | 'halfDepth'
>

// What stands around the monitored buildings, and is not monitored.
const BEFORE: DecorKind[] = ['houses']
const AFTER: DecorKind[] = ['supermarket', 'parking']

export function withDecor(spec: NeighbourhoodSpec): HostSpec[] {
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
  width: number
  // The row of neighbourhoods it stands in.
  row: number
}

// The row of the first building that could cover part of a building of
// another row on screen, as in layout.ts, or -1 if there is none.
function hiderRow(lots: Placed[]): number {
  for (const placed of lots) {
    for (const b of lots) {
      if (placed.row === b.row) continue
      const sideways = Math.abs(placed.x - b.x - (placed.z - b.z)) / Math.SQRT2
      const depth = (placed.x - b.x + (placed.z - b.z)) / Math.SQRT2
      const halves = (placed.width + b.width) / Math.SQRT2
      const reach = placed.height * Math.sqrt(3) + halves
      if (sideways < halves + 1 && depth > 0 && depth < reach) {
        return placed.row
      }
    }
  }
  return -1
}

export function worldLayout(specs: NeighbourhoodSpec[]): World {
  const items = specs.map(withDecor)
  if (specs.length === 0) {
    return {
      neighbourhoods: [],
      wilds: [],
      halfWidth: 0,
      halfDepth: 0,
      ways: [],
      roundabouts: [],
      track: null,
    }
  }

  // Each neighbourhood is as big as its score says, and the map is made of
  // rows of them, as square as possible. Where a neighbourhood is smaller than
  // its row, a joining tile fills the rest.
  const natural = items.map((hosts) => cityLayout(hosts))
  const sizes = sizesOf(
    natural.map((cityLayout) => ({
      width: 2 * cityLayout.halfWidth,
      depth: 2 * cityLayout.halfDepth,
    })),
    specs.map((neighbourhoodSpec) => sizeScore(neighbourhoodSpec.buildings)),
  )
  // The tallest buildings stand at the back, where they hide the least.
  const tallest = (row: number[]) =>
    Math.max(...row.flatMap((i) => natural[i].lots.map((lot) => lot.height)))
  const rows = chooseRows(sizes).sort((a, b) => tallest(b) - tallest(a))
  const mapWidth = Math.max(...rows.map((r) => rowWidth(r, sizes)))

  // The biomes of each neighbourhood follow where it stands, and its second
  // one is often the main one of a neighbour of its row.
  const mapDepth = rows.reduce((sum, r) => sum + rowDepth(r, sizes), 0)
  const spots: Spot[] = []
  rows.reduce((back, row, r) => {
    const height = rowDepth(row, sizes)
    row.reduce((left, i) => {
      spots[i] = {
        u: (left + sizes[i].width / 2) / mapWidth,
        v: (back + height - sizes[i].depth / 2) / mapDepth,
        front: r === rows.length - 1,
      }
      return left + sizes[i].width
    }, 0)
    return back + height
  }, 0)
  const mains = specs.map((neighbourhoodSpec, i) =>
    mainBiome(neighbourhoodSpec.id, spots[i]),
  )
  const biomes: Biomes[] = []
  for (const row of rows) {
    row.forEach((i, c) => {
      const neighbours = [
        ...(c > 0 ? [{ side: 'left' as const, biome: mains[row[c - 1]] }] : []),
        ...(c < row.length - 1
          ? [{ side: 'right' as const, biome: mains[row[c + 1]] }]
          : []),
      ]
      biomes[i] = {
        main: mains[i],
        ...secondBiome(specs[i].id, mains[i], spots[i], neighbours),
      }
    })
  }

  const layouts = new Map<number, CityLayout>(
    items.map((hosts, i) => [
      i,
      cityLayout(
        hosts,
        biomes[i],
        (sizes[i].width - 1) / 2,
        sizes[i].depth / 2,
      ),
    ]),
  )

  // When buildings of a row could hide those of a row behind it, that row
  // grows deeper, with joining tiles, instead of moving apart.
  const build = (extra: number[]): World => {
    const neighbourhoods = new Map<number, Neighbourhood>()
    const wilds: Neighbourhood[] = []
    const depth = rows.reduce(
      (sum, r, n) => sum + rowDepth(r, sizes) + extra[n],
      0,
    )
    // A joining tile has the biomes of where it stands, and takes a second
    // one from the neighbourhood it touches.
    const wild = (
      width: number,
      height: number,
      x: number,
      z: number,
      front: boolean,
      touching: { side: 'left' | 'front'; biome: Biome },
    ) => {
      const id = `filler-${wilds.length}`
      const spot = { u: x / mapWidth, v: z / depth, front }
      const main = mainBiome(id, spot)
      wilds.push({
        id,
        x,
        z,
        layout: fillerLayout(
          width,
          height,
          { main, ...secondBiome(id, main, spot, [touching]) },
          id,
        ),
      })
    }
    let back = 0
    rows.forEach((row, r) => {
      const height = rowDepth(row, sizes) + extra[r]
      const front = r === rows.length - 1
      let left = 0
      row.forEach((i) => {
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
            false,
            { side: 'front', biome: mains[i] },
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
          front,
          { side: 'left', biome: mains[last] },
        )
      }
      back += height
    })
    // The middle of the map is the origin.
    const move = (neighbourhood: Neighbourhood): Neighbourhood => ({
      ...neighbourhood,
      x: neighbourhood.x - mapWidth / 2,
      z: neighbourhood.z - back / 2,
    })
    const plates = specs.map((_, i) => move(neighbourhoods.get(i)!))
    const joins = wilds.map(move)
    const all = [...plates, ...joins]
    return {
      neighbourhoods: plates,
      wilds: joins,
      halfWidth: Math.max(
        ...all.map(
          (neighbourhood) =>
            Math.abs(neighbourhood.x) + neighbourhood.layout.halfWidth,
        ),
      ),
      halfDepth: Math.max(
        ...all.map(
          (neighbourhood) =>
            Math.abs(neighbourhood.z) + neighbourhood.layout.halfDepth,
        ),
      ),
      ways: [],
      roundabouts: [],
      track: null,
    }
  }
  const rowOf = new Map<number, number>()
  rows.forEach((row, r) => row.forEach((i) => rowOf.set(i, r)))
  const lotsOf = (world: World): Placed[] =>
    world.neighbourhoods.flatMap((neighbourhood, i) =>
      neighbourhood.layout.lots.map((lot) => ({
        x: lot.x + neighbourhood.x,
        z: lot.z + neighbourhood.z,
        height: lot.height,
        width: lot.width,
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
  return clearWilds(
    placeMonuments(
      placeAirport(blendSeams(carveSeas(layTracks(layRoads(world))))),
    ),
  )
}

// The ground of a neighbourhood after a nuke: the decoration, the trees, the
// flowers and the traffic are gone, and a crater is dug at the middle, except
// under the buildings, which are left in ruins.
export function nukedLayout(layout: CityLayout): CityLayout {
  const lots = layout.lots.filter((lot) => !lot.decor)
  const water = new Set(['water', 'shallow', 'pond', 'ice'])
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
    structures: [],
    roundabouts: [],
    tracks: [],
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

export function worldFrame(world: Ground, top: number): Frame {
  // The corners of every plate, at ground level and at the top of the tallest
  // building. An empty map shows a plate of the smallest size.
  const all = [...world.neighbourhoods, ...world.wilds]
  const plates = all.length
    ? all.map((neighbourhood) => ({
        x: neighbourhood.x,
        z: neighbourhood.z,
        halfWidth: neighbourhood.layout.halfWidth,
        halfDepth: neighbourhood.layout.halfDepth,
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
