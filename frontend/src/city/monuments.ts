// The monuments of the map, independent of three.js. Every tile (neighbourhood or wild tile) may
// have one, never more, except the biggest tile, which has one for sure and may have a second:
// the smaller the tile, the less likely it is to have one. A monument stands once at most on the
// whole map. Its size follows the size of the tile, and its kind goes with the biome of the ground
// it stands on. It is placed like the airport (footprint.ts): on land, away from roads, water and
// the railway, never over a monitored building nor hiding one on screen; whatever else stands
// there (trees, houses, a tennis club...) makes way for it. The drawing is in monumentShapes.ts.
import type { Biome } from './biomes'
import {
  centreOf,
  clearFootprint,
  groundOf,
  level,
  rectSums,
  type Ground,
} from './footprint'
import { shapeOf } from './monumentShapes'
import { hash, hides, type Structure } from './layout'
import type { Neighbourhood, World } from './world'

export type MonumentSize = 'small' | 'medium' | 'big'
export const SIZES: MonumentSize[] = ['small', 'medium', 'big']

// Side of the footprint of each size, in tiles (odd, so that the monument is on a tile).
const FOOTPRINT: Record<MonumentSize, number> = {
  small: 7,
  medium: 11,
  big: 15,
}

// A tile of at least this area (full width times full depth) may hold a monument of the size.
const FROM_AREA: Record<MonumentSize, number> = {
  small: 0,
  medium: 1200,
  big: 2800,
}

// The chance of a monument on a tile of any size, and how fast it rises from there to 1 with the
// area of the tile, against the biggest one (the square root: the smaller tiles keep a good share).
const MIN_CHANCE = 0.5
const CHANCE_POWER = 0.5
// The chance that the biggest tile has a second monument.
const SECOND_CHANCE = 0.5

export type MonumentKind =
  | 'statue-of-liberty'
  | 'big-ben'
  | 'pisa-tower'
  | 'arc-de-triomphe'
  | 'brandenburg-gate'
  | 'christ-the-redeemer'
  | 'eiffel-tower'
  | 'montparnasse-tower'
  | 'one-world-trade-center'
  | 'washington-monument'
  | 'sydney-opera'
  | 'atomium'
  | 'space-needle'
  | 'tokyo-tower'
  | 'fourviere-basilica'
  | 'tower-bridge'
  | 'petronas-towers'
  | 'taj-mahal'
  | 'sagrada-familia'
  | 'stonehenge'
  | 'burj-al-arab'
  | 'parthenon'
  | 'us-congress'
  | 'vatican-square'
  | 'bellecour-square'
  | 'colosseum'
  | 'pyramids'
  | 'red-square'
  | 'mont-saint-michel'
  | 'mount-rushmore'
  | 'mount-fuji'

// The size of each monument and the biomes it goes with.
const LIST: Record<MonumentKind, [MonumentSize, Biome[]]> = {
  'statue-of-liberty': ['small', ['coastal']],
  'big-ben': ['small', ['city']],
  'pisa-tower': ['small', ['city', 'forest']],
  'arc-de-triomphe': ['small', ['city']],
  'brandenburg-gate': ['small', ['city', 'forest']],
  'christ-the-redeemer': ['small', ['mountain', 'coastal']],
  'eiffel-tower': ['medium', ['city']],
  'montparnasse-tower': ['medium', ['city']],
  'one-world-trade-center': ['medium', ['city', 'coastal']],
  'washington-monument': ['medium', ['city']],
  'sydney-opera': ['medium', ['coastal']],
  atomium: ['medium', ['city']],
  'space-needle': ['medium', ['city', 'coastal']],
  'tokyo-tower': ['medium', ['city']],
  'fourviere-basilica': ['medium', ['city', 'forest']],
  'tower-bridge': ['medium', ['city', 'coastal']],
  'petronas-towers': ['medium', ['city', 'desert']],
  'taj-mahal': ['medium', ['city', 'desert']],
  'sagrada-familia': ['medium', ['city']],
  stonehenge: ['medium', ['forest', 'tundra']],
  'burj-al-arab': ['medium', ['coastal', 'desert']],
  parthenon: ['medium', ['city', 'mountain']],
  'us-congress': ['big', ['city']],
  'vatican-square': ['big', ['city']],
  'bellecour-square': ['big', ['city']],
  colosseum: ['big', ['city']],
  pyramids: ['big', ['desert']],
  'red-square': ['big', ['city', 'tundra']],
  'mont-saint-michel': ['big', ['coastal']],
  'mount-rushmore': ['big', ['mountain']],
  'mount-fuji': ['big', ['mountain', 'tundra']],
}

export interface MonumentSpec {
  size: MonumentSize
  // Side of its square footprint, in tiles.
  footprint: number
  biomes: Biome[]
  // How high its tallest part rises from the ground.
  height: number
}

const topOf = (kind: MonumentKind) =>
  Math.max(...shapeOf(kind).map((p) => p.y + p.sy / 2))

export const MONUMENTS = Object.fromEntries(
  (Object.keys(LIST) as MonumentKind[]).map((kind) => {
    const [size, biomes] = LIST[kind]
    const spec: MonumentSpec = {
      size,
      footprint: FOOTPRINT[size],
      biomes,
      height: topOf(kind),
    }
    return [kind, spec]
  }),
) as Record<MonumentKind, MonumentSpec>

const KINDS = Object.keys(MONUMENTS) as MonumentKind[]

// The biggest size of monument a tile of this area (full width times full depth) may hold.
export function sizeClass(area: number): MonumentSize {
  return [...SIZES].reverse().find((s) => area >= FROM_AREA[s]) ?? 'small'
}

// How likely a tile of this area is to have a monument, when the biggest tile has this one: 1 for
// the biggest, then falling with the area down to MIN_CHANCE, and 0 for no area at all.
export function monumentChance(area: number, biggest: number): number {
  if (biggest <= 0 || area <= 0) return 0
  const share = Math.pow(Math.min(1, area / biggest), CHANCE_POWER)
  return MIN_CHANCE + (1 - MIN_CHANCE) * share
}

const areaOf = (n: Neighbourhood) => 4 * n.layout.halfWidth * n.layout.halfDepth

// What rises from the ground and could hide a building behind it, by blocks of 2 tiles, in the
// frame of the monument: the height of the tallest box over the block.
export interface Solid {
  x: number
  z: number
  height: number
  radius: number
}

const SOLID_STEP = 2
// Lower than this, a block hides nothing worth a thought.
const SOLID_FROM = 1

const solidCache = new Map<MonumentKind, Solid[]>()

export function solids(kind: MonumentKind): Solid[] {
  let out = solidCache.get(kind)
  if (out) return out
  out = []
  const parts = shapeOf(kind)
  const { footprint } = MONUMENTS[kind]
  const cells = footprint / SOLID_STEP
  for (let i = 0; i < cells; i++) {
    for (let j = 0; j < cells; j++) {
      const x = -footprint / 2 + SOLID_STEP * (i + 0.5)
      const z = -footprint / 2 + SOLID_STEP * (j + 0.5)
      let height = 0
      for (const p of parts) {
        if (
          Math.abs(p.x - x) < p.sx / 2 + SOLID_STEP / 2 &&
          Math.abs(p.z - z) < p.sz / 2 + SOLID_STEP / 2
        ) {
          height = Math.max(height, p.y + p.sy / 2)
        }
      }
      if (height > SOLID_FROM) {
        out.push({ x, z, height, radius: SOLID_STEP / 2 })
      }
    }
  }
  solidCache.set(kind, out)
  return out
}

// A stable value in [0, 1) for a text, tied to the seed of the world.
const unit = (text: string) => hash(text) / 4294967296

// Puts a monument on the biggest tile for sure, and on each other tile by chance. A monument is
// there once at most on the whole map, and the biggest tile may have a second one.
export function placeMonuments(world: World): World {
  const all = [...world.neighbourhoods, ...world.wilds]
  if (all.length === 0) return world
  const biggest = all.reduce((best, n) => (areaOf(n) > areaOf(best) ? n : best))
  const top = areaOf(biggest)
  // The bigger tiles choose first, so that they get the bigger monuments.
  const order = [...all].sort(
    (a, b) => areaOf(b) - areaOf(a) || (a.id < b.id ? -1 : 1),
  )
  const used = new Set<MonumentKind>()
  const laid = new Map<Neighbourhood, Neighbourhood>()
  for (const n of order) {
    const sure = n === biggest
    let plate = n
    if (sure || unit(`monument:${n.id}`) < monumentChance(areaOf(n), top)) {
      plate = withMonument(world, plate, used)
    }
    if (sure && unit(`monument:second:${n.id}`) < SECOND_CHANCE) {
      plate = withMonument(world, plate, used)
    }
    laid.set(n, plate)
  }
  return {
    ...world,
    neighbourhoods: world.neighbourhoods.map((n) => laid.get(n)!),
    wilds: world.wilds.map((n) => laid.get(n)!),
  }
}

// The plate with the biggest monument its size allows, among those not used yet that go with a
// biome of its ground and fit; a smaller one if none does, and none if even the smallest does not
// fit. The monument is added to `used`.
function withMonument(
  world: World,
  plate: Neighbourhood,
  used: Set<MonumentKind>,
): Neighbourhood {
  const ground = groundOf(
    world,
    plate,
    0,
    (s) => s.kind === 'airport' || s.kind === 'monument',
  )
  const present = new Set(plate.layout.tiles.map((t) => t.biome))
  for (let k = SIZES.indexOf(sizeClass(areaOf(plate))); k >= 0; k--) {
    const kinds = KINDS.filter(
      (kind) =>
        !used.has(kind) &&
        MONUMENTS[kind].size === SIZES[k] &&
        MONUMENTS[kind].biomes.some((b) => present.has(b)),
    ).sort(
      (a, b) =>
        hash(`monument:${plate.id}:${a}`) - hash(`monument:${plate.id}:${b}`),
    )
    for (const kind of kinds) {
      const spot = search(plate, ground, kind)
      if (spot) {
        used.add(kind)
        return build(plate, kind, spot)
      }
    }
  }
  return plate
}

interface Spot {
  ix: number
  iz: number
}

function search(
  plate: Neighbourhood,
  ground: Ground,
  kind: MonumentKind,
): Spot | null {
  const { grid, badIn, costIn, lots } = ground
  const { footprint: f, biomes } = MONUMENTS[kind]
  // Only the ground of a biome it goes with.
  const wrong = new Uint8Array(grid.nx * grid.nz).fill(1)
  for (const t of plate.layout.tiles) {
    if (!biomes.includes(t.biome)) continue
    wrong[Math.round(t.z - grid.minZ) * grid.nx + Math.round(t.x - grid.minX)] =
      0
  }
  const wrongIn = rectSums(grid.nx, grid.nz, wrong)
  const spots: (Spot & { cost: number })[] = []
  for (let iz = 0; iz + f <= grid.nz; iz++) {
    for (let ix = 0; ix + f <= grid.nx; ix++) {
      if (badIn(ix, iz, f, f) > 0 || wrongIn(ix, iz, f, f) > 0) continue
      spots.push({ ix, iz, cost: costIn(ix, iz, f, f) })
    }
  }
  spots.sort(
    (a, b) =>
      a.cost - b.cost ||
      hash(`monument:${plate.id}:${kind}:${a.ix}:${a.iz}`) -
        hash(`monument:${plate.id}:${kind}:${b.ix}:${b.iz}`),
  )
  const parts = solids(kind)
  return (
    spots.find((s) => {
      const c = centreOf(grid, s.ix, s.iz, f, f)
      return parts.every((o) => {
        const object = {
          ...o,
          x: plate.x + c.x + o.x,
          z: plate.z + c.z + o.z,
        }
        return lots.every((lot) => !hides(object, lot))
      })
    }) ?? null
  )
}

function build(
  plate: Neighbourhood,
  kind: MonumentKind,
  spot: Spot,
): Neighbourhood {
  const { layout } = plate
  const grid = {
    minX: Math.min(...layout.tiles.map((t) => t.x)),
    minZ: Math.min(...layout.tiles.map((t) => t.z)),
    nx: 0,
    nz: 0,
  }
  const { footprint: f, height } = MONUMENTS[kind]
  const c = centreOf(grid, spot.ix, spot.iz, f, f)
  const monument: Structure = {
    kind: 'monument',
    monument: kind,
    x: c.x,
    y: 0,
    z: c.z,
    width: f,
    depth: f,
    height,
  }
  return { ...plate, layout: clearFootprint(layout, c, level, monument) }
}

// The monuments of a world, with the plate each one stands on.
export interface Monument {
  plate: Neighbourhood
  structure: Structure
  kind: MonumentKind
}

export function findMonuments(world: World): Monument[] {
  return [...world.neighbourhoods, ...world.wilds].flatMap((plate) =>
    plate.layout.structures
      .filter((s) => s.kind === 'monument' && s.monument)
      .map((structure) => ({ plate, structure, kind: structure.monument! })),
  )
}

export interface BoxOut {
  x: number
  y: number
  z: number
  sx: number
  sy: number
  sz: number
}

// The boxes of a monument structure on its plate, moved, for the scenery to draw.
export function monumentBoxes(
  s: Pick<Structure, 'x' | 'y' | 'z' | 'monument'>,
  emit: (color: string, box: BoxOut) => void,
) {
  if (!s.monument) return
  for (const p of shapeOf(s.monument)) {
    emit(p.color, {
      x: s.x + p.x,
      y: s.y + p.y,
      z: s.z + p.z,
      sx: p.sx,
      sy: p.sy,
      sz: p.sz,
    })
  }
}
