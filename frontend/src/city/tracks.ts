// Pure layout of the railway of the map, independent of three.js: one double track runs in a straight
// line from one edge of the map to the opposite one, through the plates, along a strip near the back
// edge (-Z) or the left edge (-X). It is laid after the roads: it crosses them on level crossings,
// never goes over a monitored building, a roundabout or the sea, and takes the trees, structures and
// hills that stand on it, as roads do.
import {
  GRASS_TOP,
  PLAZA_MARGIN,
  ROAD_TOP,
  type Tile,
  type TileKind,
} from './layout'
import { ROUNDABOUT } from './traffic'
import type { Neighbourhood, World } from './world'

// How many tiles wide the railway is: a ballast bed with two tracks on it.
export const CORRIDOR = 3
// How far from the center line of the railway each of its two tracks is. A train keeps to the same
// hand as the cars.
export const GAUGE_OFFSET = 0.75
// How near the edge of the map the railway lies, in tiles: its inner side is at most this far.
const STRIP = 6
// Keeps the railway away from a roundabout, and from the end of a road.
const CLEARANCE = 1

// The railway of the whole map.
export interface Track {
  // Whether it runs along Z (otherwise along X).
  vertical: boolean
  // Where its center line is, across.
  at: number
  // From one edge of the map to the other, along.
  from: number
  to: number
  // Where it crosses a road, along its length: the middles of the level crossings.
  crossings: number[]
}

// The part of the railway on one plate, relative to the middle of the plate.
export interface TrackPiece {
  vertical: boolean
  at: number
  from: number
  to: number
  crossings: number[]
}

const frac = (v: number) => v - Math.floor(v)

interface Cell {
  kind: TileKind
  // What it costs to lay the railway there: what has to go.
  cost: number
  // Where it cannot go at all.
  hard: boolean
}

// Ground that the railway fills in, at a price: the more of it, the less the strip suits it.
const KIND_COST: Partial<Record<TileKind, number>> = {
  hill: 1,
  path: 1,
  plaza: 2,
  court: 2,
  pond: 3,
  ice: 3,
}
const SEA = new Set<TileKind>(['water', 'shallow'])
const COST_TREE = 1
const COST_STRUCTURE = 3

export function layTracks(world: World): World {
  const plates = [...world.neighbourhoods, ...world.wilds]
  if (plates.length === 0) return world
  // Tiles are on one lattice for the whole map.
  const [first] = plates[0].layout.tiles
  const fx = frac(plates[0].x + first.x)
  const fz = frac(plates[0].z + first.z)
  const ix = (x: number) => Math.round(x - fx)
  const iz = (z: number) => Math.round(z - fz)
  const key = (a: number, b: number) => `${a},${b}`
  const cellKey = (x: number, z: number) => key(ix(x), iz(z))

  const cells = new Map<string, Cell>()
  for (const n of plates) {
    for (const t of n.layout.tiles) {
      cells.set(cellKey(n.x + t.x, n.z + t.z), {
        kind: t.kind,
        cost: KIND_COST[t.kind] ?? 0,
        hard: SEA.has(t.kind) || t.kind === 'island',
      })
    }
  }
  const bounds = {
    ix: [Infinity, -Infinity],
    iz: [Infinity, -Infinity],
  }
  for (const id of cells.keys()) {
    const [a, b] = id.split(',').map(Number)
    bounds.ix = [Math.min(bounds.ix[0], a), Math.max(bounds.ix[1], a)]
    bounds.iz = [Math.min(bounds.iz[0], b), Math.max(bounds.iz[1], b)]
  }
  // What costs, and what is out of reach.
  const price = (x: number, z: number, cost: number) => {
    const cell = cells.get(cellKey(x, z))
    if (cell) cell.cost += cost
  }
  for (const n of plates) {
    for (const t of n.layout.trees) price(n.x + t.x, n.z + t.z, COST_TREE)
    for (const s of n.layout.structures) {
      for (let di = 0; di < s.width; di++) {
        for (let dj = 0; dj < s.depth; dj++) {
          price(
            n.x + s.x - (s.width - 1) / 2 + di,
            n.z + s.z - (s.depth - 1) / 2 + dj,
            COST_STRUCTURE,
          )
        }
      }
    }
  }
  // The paved squares of the buildings (monitored or not) and the roundabouts, and half a tile of room
  // around them.
  const forbid = (x0: number, x1: number, z0: number, z1: number) => {
    for (let a = ix(x0) - 1; a <= ix(x1) + 1; a++) {
      for (let b = iz(z0) - 1; b <= iz(z1) + 1; b++) {
        const [cx, cz] = [fx + a, fz + b]
        if (cx > x0 && cx < x1 && cz > z0 && cz < z1) {
          const cell = cells.get(key(a, b))
          if (cell) cell.hard = true
        }
      }
    }
  }
  for (const n of world.neighbourhoods) {
    for (const l of n.layout.lots) {
      const half = l.width / 2 + PLAZA_MARGIN + 1
      forbid(
        n.x + l.x - half,
        n.x + l.x + half,
        n.z + l.z - half,
        n.z + l.z + half,
      )
    }
  }
  const reach = ROUNDABOUT + CLEARANCE + 0.5
  for (const r of world.roundabouts) {
    forbid(r.x - reach, r.x + reach, r.z - reach, r.z + reach)
  }

  // A railway whose center line is on the row (or column) `r` of the lattice: its price and its
  // crossings, or null when it cannot go there.
  const tryRow = (vertical: boolean, r: number) => {
    const [aLo, aHi] = vertical ? bounds.iz : bounds.ix
    const centre = (vertical ? fx : fz) + r
    let cost = 0
    for (let a = aLo; a <= aHi; a++) {
      for (let d = -1; d <= 1; d++) {
        const cell = cells.get(vertical ? key(r + d, a) : key(a, r + d))
        if (!cell || cell.hard) return null
        cost += cell.cost
      }
    }
    const half = CORRIDOR / 2
    const crossings: number[] = []
    for (const w of world.ways) {
      if (w.vertical === vertical) {
        // Along the railway, or too close to it.
        if (Math.abs(w.at - centre) < half + 1 + CLEARANCE) return null
        continue
      }
      const touches =
        w.to > centre - half - CLEARANCE && w.from < centre + half + CLEARANCE
      if (!touches) continue
      // A road that ends at the railway cannot have a level crossing.
      if (w.from > centre - half - CLEARANCE) return null
      if (w.to < centre + half + CLEARANCE) return null
      crossings.push(w.at)
      cost += 1
    }
    return { cost, centre, crossings: crossings.sort((p, q) => p - q) }
  }

  // The strip nearest to the back and left edges first; the whole map as a last resort.
  const widest = Math.max(
    bounds.ix[1] - bounds.ix[0],
    bounds.iz[1] - bounds.iz[0],
  )
  let best: {
    vertical: boolean
    cost: number
    centre: number
    crossings: number[]
    r: number
  } | null = null
  for (let strip = STRIP; strip <= STRIP + widest && !best; strip += 4) {
    for (const vertical of [false, true]) {
      const edge = vertical ? bounds.ix[0] : bounds.iz[0]
      for (let r = edge + 1; r + 2 - edge <= strip; r++) {
        const found = tryRow(vertical, r)
        if (!found) continue
        // The cheapest one; the first found in a tie (along X, nearest the edge).
        if (!best || found.cost < best.cost) best = { vertical, r, ...found }
      }
    }
  }
  if (!best) return world

  const half = CORRIDOR / 2
  const { vertical, centre, crossings } = best
  const [aLo, aHi] = vertical ? bounds.iz : bounds.ix
  const alongOrigin = vertical ? fz : fx
  const track: Track = {
    vertical,
    at: centre,
    from: alongOrigin + aLo - 0.5,
    to: alongOrigin + aHi + 0.5,
    crossings,
  }

  const onTrack = (x: number, z: number) =>
    Math.abs((vertical ? x : z) - centre) < half
  const besideTrack = (x: number, z: number) =>
    Math.abs((vertical ? x : z) - centre) < half + 1

  const lay = (n: Neighbourhood): Neighbourhood => {
    const painted = new Set<string>()
    const levelled = new Set<string>()
    const tiles = n.layout.tiles.map((t): Tile => {
      const [x, z] = [n.x + t.x, n.z + t.z]
      if (onTrack(x, z) && t.kind !== 'road') {
        painted.add(cellKey(x, z))
        return { ...t, kind: 'track', top: ROAD_TOP }
      }
      if (t.kind === 'hill' && besideTrack(x, z)) {
        levelled.add(cellKey(x, z))
        return { ...t, kind: 'grass', top: GRASS_TOP }
      }
      return t
    })
    const gone = (p: { x: number; z: number }) => {
      const id = cellKey(n.x + p.x, n.z + p.z)
      return painted.has(id) || levelled.has(id)
    }
    const crossed = (s: {
      x: number
      z: number
      width: number
      depth: number
    }) =>
      [...Array(s.width).keys()].some((di) =>
        [...Array(s.depth).keys()].some((dj) =>
          painted.has(
            cellKey(
              n.x + s.x - (s.width - 1) / 2 + di,
              n.z + s.z - (s.depth - 1) / 2 + dj,
            ),
          ),
        ),
      )
    // The railway through a tennis club takes the whole club.
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

    const [halfAlong, halfAcross, alongAt, acrossAt] = vertical
      ? [n.layout.halfDepth, n.layout.halfWidth, n.z, n.x]
      : [n.layout.halfWidth, n.layout.halfDepth, n.x, n.z]
    const tracks: TrackPiece[] =
      Math.abs(centre - acrossAt) < halfAcross + half
        ? [
            {
              vertical,
              at: centre - acrossAt,
              from: -halfAlong,
              to: halfAlong,
              crossings: crossings
                .map((c) => c - alongAt)
                .filter((c) => c >= -halfAlong && c < halfAlong),
            },
          ]
        : []
    return {
      ...n,
      layout: {
        ...n.layout,
        tiles: tiles.map((t) =>
          !painted.has(cellKey(n.x + t.x, n.z + t.z)) && under(t)
            ? { ...t, kind: 'grass', top: GRASS_TOP }
            : t,
        ),
        tracks,
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
    track,
  }
}

// Where a train that runs `dir` (+1 for increasing coordinates) is, `u` tiles after the edge it
// came in at: on the track of its way, and where it heads (the rotation around Y that points +X
// along its way).
export function trackPoint(
  track: Track,
  dir: 1 | -1,
  u: number,
): { x: number; z: number; heading: number } {
  const along = dir === 1 ? track.from + u : track.to - u
  const across = track.at + (track.vertical ? -dir : dir) * GAUGE_OFFSET
  return track.vertical
    ? { x: across, z: along, heading: (-dir * Math.PI) / 2 }
    : { x: along, z: across, heading: dir === 1 ? 0 : Math.PI }
}
