// The clouds that drift over the map, as cubes like the rest of the town, and
// how they move: pure functions, independent of three.js. The same clouds
// every time.
//
// They all blow the same way, from left to right on screen, along the
// (1, 0, -1) diagonal of the ground. Each follows its own lane, across the map
// and a little further, and grows out of nothing as it enters the map and
// shrinks back to nothing as it leaves it. Some are rain clouds, and some are
// storm clouds (see stormShape.ts).
import { hash, seededRandom } from '../layout'

// Cubes, relative to the middle of the cloud, in tiles. `y` counts layers.
export interface Block {
  x: number
  y: number
  z: number
}

// Fair clouds are white and dry, rain clouds grey, storm clouds dark.
export type CloudKind = 'fair' | 'rain' | 'storm'

export interface Cloud {
  kind: CloudKind
  // How far the lane is to the side of the middle of the map, along the
  // (1, 0, 1) diagonal.
  lane: number
  // How high the cloud floats above the clouds' base height.
  y: number
  // Tiles per second.
  speed: number
  // Tiles of wind it waits for, past the edge of the map, before it comes back.
  gap: number
  // Where it is in its trip at time 0, between 0 and 1.
  offset: number
  blocks: Block[]
}

export interface Bounds {
  halfWidth: number
  halfDepth: number
}

export interface CloudPose {
  x: number
  y: number
  z: number
  // 0 when it is gone, 1 when it is fully grown.
  scale: number
}

// How far, in tiles, a cloud takes to grow or to shrink at the edges.
const FADE = 8

// One cloud for about this many tiles of ground.
const GROUND_PER_CLOUD = 250
const MIN_CLOUDS = 4
const MAX_CLOUDS = 12

// In turn: so the sky always has some of each, the fair ones the most.
const KINDS: CloudKind[] = ['fair', 'rain', 'fair', 'storm']

// Lanes stay clear of the corners of the map, where there is no room for a
// cloud to show.
const LANE_REACH = 0.7

// A cloud: a wide flat ellipse of cubes with smaller ones piled on top, a
// little ragged.
function cloudBlocks(random: () => number): Block[] {
  const rx = 4 + Math.floor(random() * 4)
  const rz = 2 + Math.floor(random() * 3)
  const blocks: Block[] = []
  const layer = (y: number, shrink: number, ragged: number) => {
    const ax = (rx + 0.5) * shrink
    const az = (rz + 0.5) * shrink
    const shiftX = y === 0 ? 0 : Math.round((random() - 0.5) * 2)
    const shiftZ = y === 0 ? 0 : Math.round((random() - 0.5) * 2)
    for (let i = -rx; i <= rx; i++) {
      for (let j = -rz; j <= rz; j++) {
        const inside = ((i - shiftX) / ax) ** 2 + ((j - shiftZ) / az) ** 2 <= 1
        if (inside && random() >= ragged) blocks.push({ x: i, y, z: j })
      }
    }
  }
  layer(0, 1, 0.12)
  layer(1, 0.75, 0.1)
  layer(2, 0.45, 0)
  return blocks
}

// How many clouds a map of this size has.
export function cloudCount({ halfWidth, halfDepth }: Bounds): number {
  const ground = 4 * halfWidth * halfDepth
  if (ground === 0) return 0
  return Math.min(
    MAX_CLOUDS,
    Math.max(MIN_CLOUDS, Math.round(ground / GROUND_PER_CLOUD)),
  )
}

// `density` multiplies the normal count: 0 for a clear sky, 2 for twice as many clouds.
export function cloudsFor(
  halfWidth: number,
  halfDepth: number,
  density = 1,
): Cloud[] {
  const count = Math.round(cloudCount({ halfWidth, halfDepth }) * density)
  const random = seededRandom(hash('clouds'))
  const reach = LANE_REACH * ((halfWidth + halfDepth) / Math.SQRT2)
  return Array.from({ length: count }, (_, i) => ({
    kind: KINDS[i % KINDS.length],
    // Spread over the map, not drawn at random: no two clouds in one lane.
    lane: ((i + random() * 0.8) / count - 0.5) * 2 * reach,
    y: random() * 2,
    speed: 0.6 + random() * 0.6,
    gap: 8 + random() * 20,
    offset: random(),
    blocks: cloudBlocks(random),
  }))
}

// The part of a lane that is over the map, along the wind: from where it
// enters the rectangle of the ground to where it leaves it.
export function laneSpan(
  lane: number,
  { halfWidth, halfDepth }: Bounds,
): { lo: number; hi: number } {
  return {
    lo: Math.max(-Math.SQRT2 * halfWidth - lane, lane - Math.SQRT2 * halfDepth),
    hi: Math.min(Math.SQRT2 * halfWidth - lane, lane + Math.SQRT2 * halfDepth),
  }
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))
const smooth = (n: number) => n * n * (3 - 2 * n)

// Where a cloud is at time t, in seconds, and how grown: it enters the map on
// the left, drifts across, leaves on the right and waits a while out of sight
// before coming back.
export function cloudPose(cloud: Cloud, t: number, bounds: Bounds): CloudPose {
  const { lo, hi } = laneSpan(cloud.lane, bounds)
  const length = Math.max(0, hi - lo)
  const cycle = length + cloud.gap
  const progress = ((((t * cloud.speed) / cycle + cloud.offset) % 1) + 1) % 1
  const along = progress * cycle
  const fade = Math.min(FADE, length / 3)
  const grown =
    fade > 0 ? clamp01(along / fade) * clamp01((length - along) / fade) : 0
  // Along the wind, then across it.
  const w = lo + along
  const p = cloud.lane
  return {
    x: (w + p) / Math.SQRT2,
    y: cloud.y,
    z: (p - w) / Math.SQRT2,
    scale: smooth(grown),
  }
}
