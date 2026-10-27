// The bridges of the planet: they link the islands over the sea, so that all of them are
// reachable, with a few more than the fewest, to make loops.
import { islandPoint, islandReach, type Island } from './island'
import {
  angleBetween,
  dot,
  length,
  scale,
  slerp,
  sub,
  unit,
  type Vec3,
} from './sphere'

export interface Bridge {
  from: string
  to: string
  // The deck, from the edge of one island to the edge of the other, over the sea.
  points: Vec3[]
}

// A bridge starts and ends on an island's edge, and its deck stands this high over the sea.
export const DECK_HEIGHT = 0.6
// Points of a deck.
const STEPS = 12
// Beyond this much sea between two islands, no more bridge than the fewest is built.
const EXTRA_RANGE = 24
// No island gets more bridges than this.
const MAX_DEGREE = 4

// The sea between two islands, along the surface.
const seaBetween = (radius: number, a: Island, b: Island) =>
  angleBetween(a.normal, b.normal) * radius - islandReach(a) - islandReach(b)

// Where the line to `other` leaves the plate of `island`, on its edge.
function edgePoint(island: Island, other: Island): Vec3 {
  const toward = sub(other.center, island.center)
  const [dx, dz] = [dot(toward, island.xAxis), dot(toward, island.zAxis)]
  const { halfWidth, halfDepth } = island.layout
  const t = Math.min(
    dx === 0 ? Infinity : halfWidth / Math.abs(dx),
    dz === 0 ? Infinity : halfDepth / Math.abs(dz),
  )
  return islandPoint(island, dx * t, dz * t)
}

function deck(radius: number, from: Vec3, to: Vec3): Vec3[] {
  const [a, b] = [unit(from), unit(to)]
  const [lengthA, lengthB] = [length(from), length(to)]
  // The ends sit on the flat plates, a little further out than the sea level.
  return Array.from({ length: STEPS + 1 }, (_, i) => {
    const t = i / STEPS
    if (i === 0) return from
    if (i === STEPS) return to
    const level = Math.max(radius, lengthA + (lengthB - lengthA) * t)
    return scale(slerp(a, b, t), level + DECK_HEIGHT)
  })
}

export function layBridges(radius: number, islands: Island[]): Bridge[] {
  const pairs = islands.flatMap((a, i) =>
    islands.slice(i + 1).map((b) => ({
      a,
      b,
      sea: seaBetween(radius, a, b),
    })),
  )
  pairs.sort((x, y) => x.sea - y.sea)
  const degree = new Map<string, number>()
  const linked = new Set<string>()
  const joined = new Map(islands.map((island) => [island.id, island.id]))
  const root = (id: string): string => {
    let at = id
    while (joined.get(at) !== at) at = joined.get(at)!
    return at
  }
  const chosen: typeof pairs = []
  const keep = (pair: (typeof pairs)[number]) => {
    chosen.push(pair)
    for (const { id } of [pair.a, pair.b])
      degree.set(id, (degree.get(id) ?? 0) + 1)
    linked.add(`${pair.a.id}|${pair.b.id}`)
  }
  // The shortest links that join the islands into one, then the short ones that make loops.
  for (const pair of pairs) {
    const [ra, rb] = [root(pair.a.id), root(pair.b.id)]
    if (ra === rb) continue
    joined.set(ra, rb)
    keep(pair)
  }
  for (const pair of pairs) {
    if (pair.sea > EXTRA_RANGE) break
    if (linked.has(`${pair.a.id}|${pair.b.id}`)) continue
    if (
      (degree.get(pair.a.id) ?? 0) >= MAX_DEGREE ||
      (degree.get(pair.b.id) ?? 0) >= MAX_DEGREE
    )
      continue
    keep(pair)
  }
  return chosen.map(({ a, b }) => ({
    from: a.id,
    to: b.id,
    points: deck(radius, edgePoint(a, b), edgePoint(b, a)),
  }))
}
