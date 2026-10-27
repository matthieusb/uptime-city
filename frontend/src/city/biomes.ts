// Pure biomes of the map, independent of three.js. Every plate, neighbourhood
// or wild tile, has a main biome and may have a second one on one of its
// sides, with a band where both mix in between. Each tile of the ground ends
// up with one biome, which decides its colors and what grows on it.
import { seeded } from './seed'
import type { TreeKind } from './layout'

export type Biome =
  'forest' | 'mountain' | 'city' | 'coastal' | 'desert' | 'tundra'

export const BIOMES: Biome[] = [
  'forest',
  'mountain',
  'city',
  'coastal',
  'desert',
  'tundra',
]

// A side of a plate: left is -X, back is -Z, front is +Z, towards the camera.
export type Side = 'left' | 'right' | 'back' | 'front'

export interface Biomes {
  main: Biome
  second?: Biome
  // Where the second biome lies.
  side?: Side
}

// Where a plate stands on the map: the middle of the map is at (0.5, 0.5),
// and v grows towards the front. A plate at the front touches the front edge
// of the map, the only one where the sea may be.
export interface Spot {
  u: number
  v: number
  front: boolean
}

function hash(plain: string): number {
  const text = seeded(plain)
  // FNV-1a
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

// Stable value in [0, 1) for a text.
export function noise(text: string): number {
  // mulberry32, one step.
  const a = (hash(text) + 0x6d2b79f5) | 0
  let t = Math.imul(a ^ (a >>> 15), 1 | a)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

// How likely each biome is at a spot: forests and cities anywhere,
// mountains mostly at the middle, deserts and tundras rarely, and coastal
// cities only at the front.
function weights({ u, v, front }: Spot): Record<Biome, number> {
  const middle = Math.max(
    0,
    1 - 2 * Math.max(Math.abs(u - 0.5), Math.abs(v - 0.5)),
  )
  return {
    forest: 3,
    city: 3,
    mountain: 0.2 + 5 * middle * middle,
    coastal: front ? 7 : 0,
    desert: 0.45,
    tundra: 0.45,
  }
}

function pick(roll: number, options: Partial<Record<Biome, number>>): Biome {
  const list = BIOMES.filter((biome) => (options[biome] ?? 0) > 0)
  const total = list.reduce((sum, biome) => sum + options[biome]!, 0)
  let left = roll * total
  for (const biome of list) {
    left -= options[biome]!
    if (left < 0) return biome
  }
  return list[list.length - 1]
}

export function mainBiome(id: string, spot: Spot): Biome {
  return pick(noise(`biome:${id}`), weights(spot))
}

// The sea stays at the front edge of the map: a coastal biome lies at the
// front of its plate or to one side, and never gives the front to another.
function allowed(main: Biome, second: Biome, side: Side, spot: Spot) {
  if (second === main) return false
  if (second === 'coastal') return spot.front && side !== 'back'
  if (main === 'coastal') return side !== 'front'
  return true
}

const SIDES: Side[] = ['left', 'right', 'back', 'front']

// Most plates get a second biome, preferably the one of a neighbour, on the
// side of that neighbour, so that the plates flow into each other.
export function secondBiome(
  id: string,
  main: Biome,
  spot: Spot,
  neighbours: { side: Side; biome: Biome }[],
): Pick<Biomes, 'second' | 'side'> {
  const roll = (salt: string) => noise(`${salt}:${id}`)
  if (roll('second') > 0.8) return {}
  const near = neighbours.filter((n) => allowed(main, n.biome, n.side, spot))
  if (near.length > 0 && roll('near') < 0.85) {
    const n = near[Math.floor(roll('which') * near.length)]
    return { second: n.biome, side: n.side }
  }
  const options = weights(spot)
  options[main] = 0
  const second = pick(roll('other'), options)
  // On the side of a neighbour that has it, when there is one.
  const along = near.find((n) => n.biome === second)
  if (along) return { second, side: along.side }
  const sides = SIDES.filter((side) => allowed(main, second, side, spot))
  if (sides.length === 0) return {}
  return { second, side: sides[Math.floor(roll('side') * sides.length)] }
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

// How much of the second biome there is at (u, v) of a plate, each in
// [0, 1]: none on the far side, all of it on its own side, and a wavy band
// where both mix in between.
export function secondShare(biomes: Biomes, u: number, v: number): number {
  if (!biomes.second || !biomes.side) return 0
  const [along, across] =
    biomes.side === 'right'
      ? [u, v]
      : biomes.side === 'left'
        ? [1 - u, v]
        : biomes.side === 'front'
          ? [v, u]
          : [1 - v, u]
  const wave = 0.07 * Math.sin(across * 9 + 1.3) + 0.04 * Math.sin(across * 23)
  return smoothstep(0.3, 0.7, along + wave)
}

// How much of a biome there is at (u, v).
export function weightOf(
  biomes: Biomes,
  biome: Biome,
  u: number,
  v: number,
): number {
  const s = secondShare(biomes, u, v)
  return (biomes.main === biome ? 1 - s : 0) + (biomes.second === biome ? s : 0)
}

// The biome of a tile at (u, v): in the band, the tiles are dithered between
// the two, the more of the second the closer to its side. `dither` is a
// stable random value in [0, 1) for the tile.
export function biomeAt(
  biomes: Biomes,
  u: number,
  v: number,
  dither: number,
): Biome {
  return biomes.second && dither < secondShare(biomes, u, v)
    ? biomes.second
    : biomes.main
}

// What a tree becomes in a biome: firs in the mountains, cacti in the desert,
// shrubs and a few firs in the tundra, no palms in a forest.
export function treeFor(
  biome: Biome,
  wanted: TreeKind,
  roll: number,
): TreeKind {
  switch (biome) {
    case 'mountain':
      return 'fir'
    case 'desert':
      return 'cactus'
    case 'tundra':
      return roll < 0.25 ? 'fir' : 'shrub'
    case 'forest':
      return wanted === 'palm' ||
        wanted === 'fir' ||
        wanted === 'cactus' ||
        wanted === 'shrub'
        ? 'oak'
        : wanted
    default:
      return wanted === 'fir' || wanted === 'cactus' || wanted === 'shrub'
        ? 'oak'
        : wanted
  }
}
