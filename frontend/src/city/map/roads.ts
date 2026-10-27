// The roads of the map: straight roads along X through the plates, roads along Z that link
// them, and a roundabout wherever two roads meet.
import {
  GRASS_TOP,
  ISLAND_TOP,
  PLAZA_MARGIN,
  ROAD_TOP,
  type Point,
  type Road,
  type Tile,
} from '../layout'
import type { Neighbourhood, World, Way } from '../world'

// Half the side of a roundabout, and how far from the middle of a road along
// Z buildings stand, so that a roundabout fits wherever it meets a road.
export const ROUNDABOUT = 3

export const CLEARANCE = ROUNDABOUT + 0.5

// About how far apart, along X, the roads along Z are.
const WAY_SPACING = 28

// The roads of the map. Each road of a neighbourhood runs on along X, as far
// as no building is in the way: the roads at the front of a row cross the
// whole map. Roads along Z link them where no building is in the way either,
// and a roundabout stands wherever two roads meet. The roads are then painted
// on the plates, over whatever was there, and each plate gets the pieces of
// road on it, for its middle lines, and the roundabouts on it.
export function layRoads(world: World): World {
  const plates = [...world.neighbourhoods, ...world.wilds]
  const W = world.halfWidth
  // The paved squares of all the buildings.
  const squares = world.neighbourhoods.flatMap((neighbourhood) =>
    neighbourhood.layout.lots.map((lot) => {
      const half = lot.width / 2 + PLAZA_MARGIN
      return {
        x0: neighbourhood.x + lot.x - half,
        x1: neighbourhood.x + lot.x + half,
        z0: neighbourhood.z + lot.z - half,
        z1: neighbourhood.z + lot.z + half,
      }
    }),
  )
  const blocked = (x0: number, x1: number, z0: number, z1: number) =>
    squares.some((q) => q.x0 < x1 && q.x1 > x0 && q.z0 < z1 && q.z1 > z0)

  // Along X: from its own plate on, both ways, a tile at a time, as long as
  // it neither meets a building nor runs too close to another road along X.
  const spans = world.neighbourhoods.flatMap((neighbourhood) =>
    neighbourhood.layout.roads.map((road) => ({
      at: neighbourhood.z + road.z,
      from: neighbourhood.x - neighbourhood.layout.halfWidth,
      to: neighbourhood.x + neighbourhood.layout.halfWidth,
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
      .filter((way) => way.from <= x - ROUNDABOUT && way.to >= x + ROUNDABOUT)
      .map((way) => way.at)
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
        (way) =>
          way.at >= left &&
          way.at < left + (2 * W) / count &&
          vertical.every((v) => Math.abs(v.at - way.at) > 2 * CLEARANCE + 2),
      )
      .sort(
        (way, b) =>
          b.to - b.from - (way.to - way.from) ||
          Math.abs(way.at - middle) - Math.abs(b.at - middle),
      )[0]
    if (best) vertical.push(best)
  }
  const roundabouts = vertical.flatMap((v) =>
    horizontal
      .filter(
        (way) =>
          way.at >= v.from &&
          way.at <= v.to &&
          way.from < v.at &&
          way.to > v.at,
      )
      .map((way) => ({ x: v.at, z: way.at })),
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
    if (horizontal.some((way) => on(way, x, z))) return 'road'
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
  const lay = (neighbourhood: Neighbourhood): Neighbourhood => {
    const painted = new Set<string>()
    const levelled = new Set<string>()
    const at = (x: number, z: number) =>
      `${Math.round(2 * x)},${Math.round(2 * z)}`
    const tiles = neighbourhood.layout.tiles.map((t): Tile => {
      const kind = paint(neighbourhood.x + t.x, neighbourhood.z + t.z)
      if (kind) {
        painted.add(at(t.x, t.z))
        return { ...t, kind, top: kind === 'island' ? ISLAND_TOP : ROAD_TOP }
      }
      if (
        t.kind === 'hill' &&
        beside(neighbourhood.x + t.x, neighbourhood.z + t.z)
      ) {
        levelled.add(at(t.x, t.z))
        return { ...t, kind: 'grass', top: GRASS_TOP }
      }
      return t
    })
    // Whether a point stands on a tile painted or levelled: tiles are on
    // whole or half coordinates, the same for the whole plate.
    const [own] = neighbourhood.layout.tiles
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
    const clubCrossed = neighbourhood.layout.structures.some(
      (structure) => club(structure) && crossed(structure),
    )
    const goes = (
      structure: (typeof neighbourhood.layout.structures)[number],
    ) => crossed(structure) || (clubCrossed && club(structure))
    const structures = neighbourhood.layout.structures.filter(
      (structure) => !goes(structure),
    )
    const removed = neighbourhood.layout.structures.filter(goes)
    const under = (t: Tile) =>
      removed.some(
        (structure) =>
          Math.abs(t.x - structure.x) < structure.width / 2 &&
          Math.abs(t.z - structure.z) < structure.depth / 2,
      )
    const [hw, hd] = [
      neighbourhood.layout.halfWidth,
      neighbourhood.layout.halfDepth,
    ]
    const roads: Road[] = ways.flatMap((w) => {
      const [centre, along, halfAlong, halfAcross] = w.vertical
        ? [neighbourhood.x, neighbourhood.z, hd, hw]
        : [neighbourhood.z, neighbourhood.x, hw, hd]
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
          r.x >= neighbourhood.x - hw &&
          r.x < neighbourhood.x + hw &&
          r.z >= neighbourhood.z - hd &&
          r.z < neighbourhood.z + hd,
      )
      .map((r) => ({
        x: r.x - neighbourhood.x,
        y: ISLAND_TOP,
        z: r.z - neighbourhood.z,
      }))
    return {
      ...neighbourhood,
      layout: {
        ...neighbourhood.layout,
        tiles: tiles.map((t) =>
          !painted.has(at(t.x, t.z)) && under(t)
            ? { ...t, kind: 'grass', top: GRASS_TOP }
            : t,
        ),
        roads,
        roundabouts: mine,
        trees: neighbourhood.layout.trees.filter((tree) => !gone(tree)),
        flowers: neighbourhood.layout.flowers.filter((flower) => !gone(flower)),
        reeds: neighbourhood.layout.reeds.filter((point) => !gone(point)),
        rocks: neighbourhood.layout.rocks.filter((point) => !gone(point)),
        umbrellas: neighbourhood.layout.umbrellas.filter(
          (umbrella) => !gone(umbrella),
        ),
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
