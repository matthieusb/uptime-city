// Pure layout of the planet, independent of three.js: one island per physical host, each a
// neighbourhood like the ones of the flat map (same generators, so the same biomes, buildings
// and effects), standing flat on a sphere of sea, with bridges between them. There is no
// continuous ground here: the sea lies between the islands, and the roads, the railway and the
// airport of the flat map do not exist.
import {
  noise,
  mainBiome,
  secondBiome,
  type Biomes,
  type Spot,
} from '../biomes'
import { cityLayout } from '../layout'
import { sizeScore, sizesOf } from '../map/sizing'
import { setWorldSeed, worldSeed } from '../seed'
import { withDecor, type NeighbourhoodSpec } from '../world'
import { layBridges, type Bridge } from './bridges'
import { islandReach, type Island } from './island'
import {
  add,
  angleBetween,
  dot,
  fibonacciPoints,
  scale,
  sub,
  tangentFrame,
  unit,
  type Vec3,
} from './sphere'

export { islandPoint, type Island } from './island'
export type { Bridge } from './bridges'

export interface Planet {
  // The radius of the sea level.
  radius: number
  islands: Island[]
  bridges: Bridge[]
}

// The share of the sphere that islands cover at first, before they are pushed apart.
const COVERAGE = 0.25
// A flat island of reach r over a sphere of radius R floats r²/2R above it at its corners:
// this many reaches keeps that under a sixth of the reach.
const MIN_RADIUS_IN_REACHES = 3
// The sea kept free between two islands, for a bridge.
const GAP = 8
// The sphere grows by this much each time the islands do not fit.
const GROWTH = 1.05
const SPREAD_PASSES = 400

// Pushes the directions apart until no two are closer than their `room` says, or gives up.
function spread(points: Vec3[], radius: number, room: number[]): boolean {
  const spots = points.map((point) => unit(point))
  for (let pass = 0; pass < SPREAD_PASSES; pass++) {
    let moved = false
    for (let i = 0; i < spots.length; i++) {
      for (let j = i + 1; j < spots.length; j++) {
        const angle = angleBetween(spots[i], spots[j])
        const wanted = (room[i] + room[j] + GAP) / radius
        if (angle >= wanted - 1e-9) continue
        moved = true
        const push = (wanted - angle) / 2 + 1e-6
        const away = (from: Vec3, other: Vec3) => {
          const sideways = sub(from, scale(other, dot(from, other)))
          const norm = Math.hypot(...sideways)
          // Exactly on top of each other: any direction will do.
          const direction: Vec3 =
            norm < 1e-9
              ? tangentFrame(from, 0).xAxis
              : scale(sideways, 1 / norm)
          return unit(add(from, scale(direction, Math.tan(push))))
        }
        const [a, b] = [away(spots[i], spots[j]), away(spots[j], spots[i])]
        spots[i] = a
        spots[j] = b
      }
    }
    if (!moved) {
      points.forEach((_, i) => (points[i] = spots[i]))
      return true
    }
  }
  return false
}

export function planetLayout(specs: NeighbourhoodSpec[], seed: string): Planet {
  // The seed of the flat city is not ours to change.
  const previous = worldSeed()
  setWorldSeed(seed)
  try {
    return lay(specs)
  } finally {
    setWorldSeed(previous)
  }
}

function lay(specs: NeighbourhoodSpec[]): Planet {
  if (specs.length === 0) return { radius: 0, islands: [], bridges: [] }
  const items = specs.map(withDecor)
  const natural = items.map((hosts) => cityLayout(hosts))
  const sizes = sizesOf(
    natural.map((layout) => ({
      width: 2 * layout.halfWidth,
      depth: 2 * layout.halfDepth,
    })),
    specs.map((neighbourhoodSpec) => sizeScore(neighbourhoodSpec.buildings)),
  )
  // Room each island takes: the circle round its plate, a little more than the plate itself.
  const room = sizes.map(({ width, depth }) => Math.hypot(width, depth) / 2 + 2)

  // Spread over the sphere in an order that does not depend on the sizes.
  const slots = fibonacciPoints(specs.length)
  const order = specs
    .map((_, i) => i)
    .sort(
      (a, b) =>
        noise(`planet-slot:${specs[a].id}`) -
        noise(`planet-slot:${specs[b].id}`),
    )
  const area = room.reduce((sum, r) => sum + Math.PI * r * r, 0)
  let radius = Math.max(
    Math.sqrt(area / (4 * Math.PI * COVERAGE)),
    MIN_RADIUS_IN_REACHES * Math.max(...room),
  )
  let directions: Vec3[]
  for (;;) {
    directions = order.map((_, i) => slots[i])
    // The island at slot i is order[i]: `room` follows the directions.
    const rooms = order.map((island) => room[island])
    if (specs.length === 1 || spread(directions, radius, rooms)) break
    radius *= GROWTH
  }

  // Latitude and longitude are known now: the biomes follow them.
  const biomes: Biomes[] = []
  order.forEach((index, slot) => {
    const [x, y, z] = directions[slot]
    const spot: Spot = {
      u: (Math.atan2(z, x) / (2 * Math.PI) + 1) % 1,
      v: (1 - y) / 2,
      front: false,
      latitude: Math.abs(y),
    }
    const id = specs[index].id
    const main = mainBiome(id, spot)
    biomes[index] = { main, ...secondBiome(id, main, spot, []) }
  })

  const islands: Island[] = specs.map((neighbourhoodSpec, index) => {
    const slot = order.indexOf(index)
    const normal = unit(directions[slot])
    const { xAxis, zAxis } = tangentFrame(
      normal,
      noise(`planet-spin:${neighbourhoodSpec.id}`) * 2 * Math.PI,
    )
    return {
      id: neighbourhoodSpec.id,
      layout: cityLayout(
        items[index],
        biomes[index],
        (sizes[index].width - 1) / 2,
        sizes[index].depth / 2,
      ),
      normal,
      center: scale(normal, radius),
      xAxis,
      zAxis,
    }
  })
  // The real plates may be a little bigger than the sizes: the sea grows if they touch.
  for (;;) {
    const touching = islands.some((a, i) =>
      islands
        .slice(i + 1)
        .some(
          (b) =>
            angleBetween(a.normal, b.normal) * radius <
            islandReach(a) + islandReach(b) + GAP / 2,
        ),
    )
    if (!touching) break
    radius *= GROWTH
    islands.forEach((island) => (island.center = scale(island.normal, radius)))
  }
  return { radius, islands, bridges: layBridges(radius, islands) }
}
