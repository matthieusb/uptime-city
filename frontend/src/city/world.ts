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
  noise,
  secondBiome,
  treeFor,
  type Biome,
  type Biomes,
  type Spot,
} from './biomes'
import {
  CRATER_TOP,
  cityLayout,
  fillerLayout,
  GRASS_TOP,
  hides,
  ISLAND_TOP,
  PLAZA_MARGIN,
  ROAD_TOP,
  TREE_HEIGHTS,
  type CityLayout,
  type DecorKind,
  type HostSpec,
  type Point,
  type Road,
  type Tile,
  type TileKind,
} from './layout'
import { placeAirport } from './airport'
import { placeMonuments } from './monuments'
import { layTracks, type Track } from './tracks'

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
  width: number
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
      const halves = (a.width + b.width) / Math.SQRT2
      const reach = a.height * Math.sqrt(3) + halves
      if (sideways < halves + 1 && depth > 0 && depth < reach) {
        return a.row
      }
    }
  }
  return -1
}

// Half the side of a roundabout, and how far from the middle of a road along
// Z buildings stand, so that a roundabout fits wherever it meets a road.
const ROUNDABOUT = 3
const CLEARANCE = ROUNDABOUT + 0.5
// About how far apart, along X, the roads along Z are.
const WAY_SPACING = 28

// The roads of the map. Each road of a neighbourhood runs on along X, as far
// as no building is in the way: the roads at the front of a row cross the
// whole map. Roads along Z link them where no building is in the way either,
// and a roundabout stands wherever two roads meet. The roads are then painted
// on the plates, over whatever was there, and each plate gets the pieces of
// road on it, for its middle lines, and the roundabouts on it.
function layRoads(world: World): World {
  const plates = [...world.neighbourhoods, ...world.wilds]
  const W = world.halfWidth
  // The paved squares of all the buildings.
  const squares = world.neighbourhoods.flatMap((n) =>
    n.layout.lots.map((l) => {
      const half = l.width / 2 + PLAZA_MARGIN
      return {
        x0: n.x + l.x - half,
        x1: n.x + l.x + half,
        z0: n.z + l.z - half,
        z1: n.z + l.z + half,
      }
    }),
  )
  const blocked = (x0: number, x1: number, z0: number, z1: number) =>
    squares.some((q) => q.x0 < x1 && q.x1 > x0 && q.z0 < z1 && q.z1 > z0)

  // Along X: from its own plate on, both ways, a tile at a time, as long as
  // it neither meets a building nor runs too close to another road along X.
  const spans = world.neighbourhoods.flatMap((n) =>
    n.layout.roads.map((road) => ({
      at: n.z + road.z,
      from: n.x - n.layout.halfWidth,
      to: n.x + n.layout.halfWidth,
    })),
  )
  const lines = new Map<number, [number, number][]>()
  for (const span of spans) {
    const { at } = span
    const free = (x0: number, x1: number) =>
      !blocked(x0, x1, at - 1.5, at + 1.5) &&
      spans.every(
        (o) =>
          o.at === at ||
          Math.abs(o.at - at) >= 2 * ROUNDABOUT + 1 ||
          o.from >= x1 ||
          o.to <= x0,
      )
    while (span.from > -W + 1e-6 && free(span.from - 1, span.from)) {
      span.from--
    }
    while (span.to < W - 1e-6 && free(span.to, span.to + 1)) span.to++
    lines.set(at, [...(lines.get(at) ?? []), [span.from, span.to]])
  }
  const horizontal: Way[] = [...lines].flatMap(([at, spans]) => {
    // Overlapping or touching spans make one road.
    const merged: [number, number][] = []
    for (const [from, to] of spans.sort((a, b) => a[0] - b[0])) {
      const last = merged[merged.length - 1]
      if (last && from <= last[1] + 1e-6) last[1] = Math.max(last[1], to)
      else merged.push([from, to])
    }
    return merged.map(([from, to]) => ({ vertical: false, at, from, to }))
  })

  // Along Z: on the edges between tiles, through the roads along X that
  // reach them with room for a roundabout, between as many of them as no
  // building stands in the way.
  const [first] = plates[0].layout.tiles
  const edge = plates[0].x + first.x + 0.5
  const candidates: Way[] = []
  for (
    let x = edge + Math.ceil(-W + ROUNDABOUT - edge);
    x <= W - ROUNDABOUT;
    x++
  ) {
    const crossing = horizontal
      .filter((h) => h.from <= x - ROUNDABOUT && h.to >= x + ROUNDABOUT)
      .map((h) => h.at)
      .sort((a, b) => a - b)
    let best: [number, number] | null = null
    let start = 0
    for (let k = 0; k + 1 < crossing.length; k++) {
      const open = !blocked(
        x - CLEARANCE,
        x + CLEARANCE,
        crossing[k] - CLEARANCE,
        crossing[k + 1] + CLEARANCE,
      )
      if (!open) {
        start = k + 1
        continue
      }
      if (!best || k + 1 - start > best[1] - best[0]) best = [start, k + 1]
    }
    if (best) {
      candidates.push({
        vertical: true,
        at: x,
        from: crossing[best[0]],
        to: crossing[best[1]],
      })
    }
  }
  // About evenly spread: in each stretch of the map, the longest one, the
  // nearest to the middle of the stretch.
  const count = Math.max(1, Math.round((2 * W) / WAY_SPACING))
  const vertical: Way[] = []
  for (let k = 0; k < count; k++) {
    const left = -W + (k * 2 * W) / count
    const middle = left + W / count
    const best = candidates
      .filter(
        (c) =>
          c.at >= left &&
          c.at < left + (2 * W) / count &&
          vertical.every((v) => Math.abs(v.at - c.at) > 2 * CLEARANCE + 2),
      )
      .sort(
        (a, b) =>
          b.to - b.from - (a.to - a.from) ||
          Math.abs(a.at - middle) - Math.abs(b.at - middle),
      )[0]
    if (best) vertical.push(best)
  }
  const roundabouts = vertical.flatMap((v) =>
    horizontal
      .filter(
        (h) => h.at >= v.from && h.at <= v.to && h.from < v.at && h.to > v.at,
      )
      .map((h) => ({ x: v.at, z: h.at })),
  )

  // What a tile of the map becomes.
  const paint = (x: number, z: number): 'road' | 'island' | null => {
    // The nearest roundabout.
    let [dx, dz] = [Infinity, Infinity]
    for (const r of roundabouts) {
      const [ax, az] = [Math.abs(x - r.x), Math.abs(z - r.z)]
      if (Math.max(ax, az) < Math.max(dx, dz)) [dx, dz] = [ax, az]
    }
    if (dx < 1 && dz < 1) return 'island'
    if (dx < ROUNDABOUT && dz < ROUNDABOUT && (dx < 2 || dz < 2)) return 'road'
    const on = (w: Way, along: number, across: number) =>
      Math.abs(across - w.at) < 1 && along > w.from && along < w.to
    if (horizontal.some((h) => on(h, x, z))) return 'road'
    if (vertical.some((v) => on(v, z, x))) return 'road'
    return null
  }
  // Hills beside a road are levelled, for it to run on flat ground.
  const beside = (x: number, z: number) =>
    [-1, 0, 1].some((dx) => [-1, 0, 1].some((dz) => paint(x + dx, z + dz)))
  // The pieces of a road that have a middle line: between its roundabouts, apart from them.
  const pieces = (w: Way): [number, number][] => {
    const stops = roundabouts
      .map((r) =>
        w.vertical ? (r.x === w.at ? r.z : null) : r.z === w.at ? r.x : null,
      )
      .filter((c): c is number => c !== null)
      .sort((a, b) => a - b)
    const bounds = [
      w.from,
      ...stops.flatMap((c) => [c - ROUNDABOUT, c + ROUNDABOUT]),
      w.to,
    ]
    const list: [number, number][] = []
    for (let k = 0; k < bounds.length; k += 2) {
      if (bounds[k + 1] - bounds[k] >= 1) list.push([bounds[k], bounds[k + 1]])
    }
    return list
  }
  const ways = [...horizontal, ...vertical]
  const lay = (n: Neighbourhood): Neighbourhood => {
    const painted = new Set<string>()
    const levelled = new Set<string>()
    const at = (x: number, z: number) =>
      `${Math.round(2 * x)},${Math.round(2 * z)}`
    const tiles = n.layout.tiles.map((t): Tile => {
      const kind = paint(n.x + t.x, n.z + t.z)
      if (kind) {
        painted.add(at(t.x, t.z))
        return { ...t, kind, top: kind === 'island' ? ISLAND_TOP : ROAD_TOP }
      }
      if (t.kind === 'hill' && beside(n.x + t.x, n.z + t.z)) {
        levelled.add(at(t.x, t.z))
        return { ...t, kind: 'grass', top: GRASS_TOP }
      }
      return t
    })
    // Whether a point stands on a tile painted or levelled: tiles are on
    // whole or half coordinates, the same for the whole plate.
    const [own] = n.layout.tiles
    const fx = own.x - Math.floor(own.x)
    const fz = own.z - Math.floor(own.z)
    const tileKey = (p: { x: number; z: number }) =>
      at(Math.round(p.x - fx) + fx, Math.round(p.z - fz) + fz)
    const gone = (p: { x: number; z: number }) =>
      painted.has(tileKey(p)) || levelled.has(tileKey(p))
    // A structure on a road goes, and its ground with it.
    const crossed = (s: {
      x: number
      z: number
      width: number
      depth: number
    }) =>
      [...Array(s.width).keys()].some((di) =>
        [...Array(s.depth).keys()].some((dj) =>
          painted.has(
            at(s.x - (s.width - 1) / 2 + di, s.z - (s.depth - 1) / 2 + dj),
          ),
        ),
      )
    // A road through a tennis club takes the whole club.
    const club = (s: { kind: string }) =>
      s.kind === 'tennis' || s.kind === 'clubhouse'
    const clubCrossed = n.layout.structures.some((s) => club(s) && crossed(s))
    const goes = (s: (typeof n.layout.structures)[number]) =>
      crossed(s) || (clubCrossed && club(s))
    const structures = n.layout.structures.filter((s) => !goes(s))
    const removed = n.layout.structures.filter(goes)
    const under = (t: Tile) =>
      removed.some(
        (s) =>
          Math.abs(t.x - s.x) < s.width / 2 &&
          Math.abs(t.z - s.z) < s.depth / 2,
      )
    const [hw, hd] = [n.layout.halfWidth, n.layout.halfDepth]
    const roads: Road[] = ways.flatMap((w) => {
      const [centre, along, halfAlong, halfAcross] = w.vertical
        ? [n.x, n.z, hd, hw]
        : [n.z, n.x, hw, hd]
      if (Math.abs(w.at - centre) >= halfAcross) return []
      return pieces(w).flatMap(([from, to]) => {
        const xMin = Math.max(from, along - halfAlong) - along
        const xMax = Math.min(to, along + halfAlong) - along
        return xMax - xMin >= 1
          ? [
              {
                z: w.at - centre,
                amplitude: 0,
                phase: 0,
                xMin,
                xMax,
                ...(w.vertical ? { vertical: true } : {}),
              },
            ]
          : []
      })
    })
    const mine: Point[] = roundabouts
      .filter(
        (r) =>
          r.x >= n.x - hw &&
          r.x < n.x + hw &&
          r.z >= n.z - hd &&
          r.z < n.z + hd,
      )
      .map((r) => ({ x: r.x - n.x, y: ISLAND_TOP, z: r.z - n.z }))
    return {
      ...n,
      layout: {
        ...n.layout,
        tiles: tiles.map((t) =>
          !painted.has(at(t.x, t.z)) && under(t)
            ? { ...t, kind: 'grass', top: GRASS_TOP }
            : t,
        ),
        roads,
        roundabouts: mine,
        trees: n.layout.trees.filter((p) => !gone(p)),
        flowers: n.layout.flowers.filter((p) => !gone(p)),
        reeds: n.layout.reeds.filter((p) => !gone(p)),
        rocks: n.layout.rocks.filter((p) => !gone(p)),
        umbrellas: n.layout.umbrellas.filter((p) => !gone(p)),
        structures,
      },
    }
  }
  return {
    ...world,
    neighbourhoods: world.neighbourhoods.map(lay),
    wilds: world.wilds.map(lay),
    ways,
    roundabouts,
  }
}

// Ground on which the biomes of two plates mix.
const LAND = new Set<TileKind>(['grass', 'hill', 'sand', 'snow'])
// How many tiles into a plate the biome of its neighbour reaches.
const SEAM = 4
const DIRECTIONS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
]

// Where two plates meet, their biomes are dithered over a few tiles, the more
// of the other one the closer to the edge, instead of changing at once. The
// trees of a tile that changes grow as its new biome says.
function blendSeams(world: World): World {
  const plates = [...world.neighbourhoods, ...world.wilds]
  const at = (x: number, z: number) =>
    `${Math.round(2 * x)},${Math.round(2 * z)}`
  const owner = new Map<string, { plate: number; tile: Tile }>()
  plates.forEach((n, plate) => {
    for (const tile of n.layout.tiles) {
      owner.set(at(n.x + tile.x, n.z + tile.z), { plate, tile })
    }
  })
  const blended = plates.map((n, plate) => {
    const changed = new Map<string, Biome>()
    const tiles = n.layout.tiles.map((tile) => {
      if (!LAND.has(tile.kind)) return tile
      const x = n.x + tile.x
      const z = n.z + tile.z
      // The nearest tile of another plate, straight along X or Z.
      let nearest: { steps: number; biome: Biome } | null = null
      for (const [dx, dz] of DIRECTIONS) {
        for (let steps = 1; steps <= SEAM; steps++) {
          const other = owner.get(at(x + dx * steps, z + dz * steps))
          if (!other) break
          if (other.plate === plate) continue
          if (
            LAND.has(other.tile.kind) &&
            (!nearest || steps < nearest.steps)
          ) {
            nearest = { steps, biome: other.tile.biome }
          }
          break
        }
      }
      if (!nearest || nearest.biome === tile.biome) return tile
      const chance = 0.5 * (1 - (nearest.steps - 1) / SEAM)
      if (noise(`seam:${at(x, z)}`) >= chance) return tile
      changed.set(at(tile.x, tile.z), nearest.biome)
      return { ...tile, biome: nearest.biome }
    })
    if (changed.size === 0) return n
    // Tiles are on whole or half coordinates, the same for the whole plate.
    const [first] = n.layout.tiles
    const ox = first.x - Math.floor(first.x)
    const oz = first.z - Math.floor(first.z)
    const trees = n.layout.trees.map((tree) => {
      const biome = changed.get(
        at(Math.round(tree.x - ox) + ox, Math.round(tree.z - oz) + oz),
      )
      if (!biome) return tree
      const kind = treeFor(biome, tree.kind, noise(`tree:${tree.x},${tree.z}`))
      return {
        ...tree,
        kind,
        height: tree.y + TREE_HEIGHTS[kind] * tree.scale,
      }
    })
    return { ...n, layout: { ...n.layout, tiles, trees } }
  })
  return {
    ...world,
    neighbourhoods: blended.slice(0, world.neighbourhoods.length),
    wilds: blended.slice(world.neighbourhoods.length),
  }
}

// Wild ground never hides a building: its hills are levelled there, and its
// trees, rocks and structures left out.
function clearWilds(world: World): World {
  const lots = world.neighbourhoods.flatMap((n) =>
    n.layout.lots.map((l) => ({ ...l, x: l.x + n.x, z: l.z + n.z })),
  )
  const wilds = world.wilds.map((n) => {
    const clear = (o: {
      x: number
      z: number
      height: number
      radius: number
    }) => lots.every((lot) => !hides({ ...o, x: o.x + n.x, z: o.z + n.z }, lot))
    const flattened = new Set<string>()
    const at = (x: number, z: number) =>
      `${Math.round(2 * x)},${Math.round(2 * z)}`
    const tiles = n.layout.tiles.map((t) => {
      if (t.kind !== 'hill' || clear({ ...t, height: t.top, radius: 0.7 })) {
        return t
      }
      flattened.add(at(t.x, t.z))
      return { ...t, kind: 'grass' as const, top: GRASS_TOP }
    })
    // Whether a point stands on a levelled hill.
    const [first] = tiles
    const ox = first.x - Math.floor(first.x)
    const oz = first.z - Math.floor(first.z)
    const levelled = (p: { x: number; z: number }) =>
      flattened.has(at(Math.round(p.x - ox) + ox, Math.round(p.z - oz) + oz))
    const structures = n.layout.structures.filter((s) =>
      clear({ ...s, radius: Math.hypot(s.width, s.depth) / 2 }),
    )
    // The ground of a structure left out goes back to grass.
    const gone = n.layout.structures.filter((s) => !structures.includes(s))
    const under = (t: Tile) =>
      gone.some(
        (s) =>
          Math.abs(t.x - s.x) < s.width / 2 &&
          Math.abs(t.z - s.z) < s.depth / 2,
      )
    return {
      ...n,
      layout: {
        ...n.layout,
        tiles: tiles.map((t) =>
          under(t) ? { ...t, kind: 'grass' as const, top: GRASS_TOP } : t,
        ),
        trees: n.layout.trees.filter(
          (t) => !levelled(t) && clear({ ...t, radius: 0.45 * t.scale }),
        ),
        rocks: n.layout.rocks.filter((r) => !levelled(r)),
        structures,
      },
    }
  })
  return { ...world, wilds }
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
    natural.map((l) => ({ width: 2 * l.halfWidth, depth: 2 * l.halfDepth })),
    specs.map((s) => sizeScore(s.buildings)),
  )
  // The tallest buildings stand at the back, where they hide the least.
  const tallest = (row: number[]) =>
    Math.max(...row.flatMap((i) => natural[i].lots.map((l) => l.height)))
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
  const mains = specs.map((s, i) => mainBiome(s.id, spots[i]))
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
      ways: [],
      roundabouts: [],
      track: null,
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
        width: l.width,
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
    placeMonuments(placeAirport(blendSeams(layTracks(layRoads(world))))),
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
