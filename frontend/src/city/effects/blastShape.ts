// The blast of a nuclear strike, as pure functions of time, independent of three.js: a shock wave
// runs out from the impact across the tile, and the fires it sets off burn on the ground behind
// it. Times are in seconds from the impact (`since`), Infinity for a tile seen nuked from the
// start, where all has long burnt.
import { hash, seededRandom } from '../layout'
import { fireStage } from './fireShape'

// The wave crosses the tile, to its farthest corner, in this time.
export const BLAST_S = 2.4
// The wall of the wave is this high at first.
const WALL_HEIGHT = 3.2

const progress = (since: number) => Math.min(1, Math.max(0, since / BLAST_S))

// Whether the wave still shows.
export const blastActive = (since: number): boolean =>
  since >= 0 && since < BLAST_S

// How far the wave has run, up to `max`: fast at first, then slower.
export function blastRadius(since: number, max: number): number {
  return max * (1 - (1 - progress(since)) ** 3)
}

// 1 for a fresh wave, down to 0 once it has run out.
export const blastFade = (since: number): number =>
  blastActive(since) ? 1 - progress(since) : 0

// The wall of the wave gets lower as it spreads.
export const blastWallHeight = (since: number): number =>
  WALL_HEIGHT * (1 - 0.8 * progress(since))

// Roughly one fire for each this many tiles of ground, so that a bigger tile burns more, with at
// least a few fires on the smallest and no more than this many on the biggest.
const TILES_PER_FIRE = 26
export const MIN_FLAMES = 8
export const MAX_FLAMES = 140
// Each fire is a column of this many cubes.
export const CUBES = 6

// How many fires burn on a tile of the given half sizes: the bigger it is, the more.
export function flameCount(halfWidth: number, halfDepth: number): number {
  const area = 4 * halfWidth * halfDepth
  return Math.min(
    MAX_FLAMES,
    Math.max(MIN_FLAMES, Math.round(area / TILES_PER_FIRE)),
  )
}
// A fire takes this long to grow once lit.
export const FLAME_GROW_S = 1.2

export interface Flame {
  // Where it burns, from the middle of the tile.
  x: number
  z: number
  // When the wave sets it alight.
  ignite: number
  // How high it rises and how big its cubes are.
  height: number
  size: number
  speed: number
  phase: number
}

// The fires of a tile: spread over it, each lit as the wave reaches it.
export function fireFlames(halfWidth: number, halfDepth: number): Flame[] {
  const random = seededRandom(hash(`blast:${halfWidth}:${halfDepth}`))
  const reach = Math.hypot(halfWidth, halfDepth)
  return Array.from({ length: flameCount(halfWidth, halfDepth) }, () => {
    const x = (random() * 2 - 1) * halfWidth * 0.92
    const z = (random() * 2 - 1) * halfDepth * 0.92
    return {
      x,
      z,
      ignite: (Math.hypot(x, z) / reach) * BLAST_S + random() * 0.4,
      height: 1.8 + random() * 1.4,
      size: 0.5 + random() * 0.4,
      speed: 0.5 + random() * 0.5,
      phase: random(),
    }
  })
}

// How much a fire burns, 0 before the wave lights it, up to 1 once it has grown.
export function flameBurn(flame: Flame, since: number): number {
  const x = Math.min(1, Math.max(0, (since - flame.ignite) / FLAME_GROW_S))
  return x * x * (3 - 2 * x)
}

// A cube of a fire at time t: they rise from the ground in turn, shrinking, and go from bright
// to dark as they burn out. Fire only, so the stage is an index into the colors of fireShape.
export function flameCube(
  flame: Flame,
  k: number,
  t: number,
): { x: number; y: number; z: number; scale: number; stage: number } {
  const life = (((t * flame.speed + flame.phase + k / CUBES) % 1) + 1) % 1
  const sway = 0.3 * (1 - 0.5 * life)
  return {
    x: flame.x + sway * Math.sin(t * 3 + flame.phase * 6 + k),
    y: 0.2 + life * flame.height,
    z: flame.z + sway * Math.cos(t * 2.4 + flame.phase * 6 + k * 1.7),
    scale: flame.size * (1 - 0.7 * life),
    stage: fireStage(life),
  }
}

// How wide the fiery band of the wave is across, at the given radius of the wave: thin at the
// start, wider as the wave spreads up to a limit, and never wider than the radius itself.
export function waveThickness(radius: number): number {
  return Math.max(0, Math.min(radius, 3, 0.8 + 0.06 * radius))
}

// Where the wave is on the ramp of colours, 0 white-hot to 1 smoke: white at the impact, red as it
// spends itself.
export const blastHeat = (since: number): number => 0.1 + 0.55 * progress(since)
