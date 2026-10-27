// The seas along the left and right edges of the map.
import { noise } from '../biomes'
import {
  GRASS_TOP,
  PLAZA_MARGIN,
  SHALLOW_TOP,
  WATER_TOP,
  type Tile,
  type TileKind,
} from '../layout'
import type { Neighbourhood, World } from '../world'

// Ground the sea of a side edge may cover.
const SEA_GROUND = new Set<TileKind>([
  'grass',
  'hill',
  'sand',
  'snow',
  'pond',
  'ice',
  'path',
  'court',
])

// The chance of a sea along each of the left and right edges of the map, and
// how deep (in tiles) it is at least, and by how much more at most.
const SEA_CHANCE = 0.5

const SEA_DEPTH = 4

const SEA_EXTRA = 4

// Tiles kept dry around the paved square of a monitored building.
const SEA_KEEPOUT = 2
// Tiles kept dry between the sea and what stands near it (a house, a shop, a tennis club).
const SEA_SHORE = 1

// A sea may lie along the left or the right edge of the map, whatever the
// biomes there: its shore is wavy, and it leaves roads, the railway, monitored
// buildings and what is around them dry. What stood in it is gone, a tennis club whole.
export function carveSeas(world: World): World {
  const seas = (['left', 'right'] as const).flatMap((side) =>
    noise(`sea:${side}`) < SEA_CHANCE
      ? [
          {
            side,
            depth: SEA_DEPTH + SEA_EXTRA * noise(`sea:${side}:depth`),
            phase: 6 * noise(`sea:${side}:phase`),
          },
        ]
      : [],
  )
  if (seas.length === 0) return world
  const W = world.halfWidth
  const lots = world.neighbourhoods.flatMap((neighbourhood) =>
    neighbourhood.layout.lots.map((lot) => ({
      ...lot,
      x: lot.x + neighbourhood.x,
      z: lot.z + neighbourhood.z,
    })),
  )
  const wet = (t: Tile, x: number, z: number): 'water' | 'shallow' | null => {
    if (!SEA_GROUND.has(t.kind)) return null
    if (
      lots.some(
        (l) =>
          Math.max(Math.abs(x - l.x), Math.abs(z - l.z)) <
          l.width / 2 + PLAZA_MARGIN + SEA_KEEPOUT,
      )
    ) {
      return null
    }
    for (const { side, depth, phase } of seas) {
      const from = side === 'left' ? x + W : W - x
      const reach =
        depth + 1.2 * Math.sin(z / 4.1 + phase) + 0.6 * Math.sin(z / 1.9)
      if (from < reach) return from < reach - 1.5 ? 'water' : 'shallow'
    }
    return null
  }
  const at = (x: number, z: number) =>
    `${Math.round(2 * x)},${Math.round(2 * z)}`
  const carve = (neighbourhood: Neighbourhood): Neighbourhood => {
    const drowned = new Set<string>()
    const tiles = neighbourhood.layout.tiles.map((t): Tile => {
      const kind = wet(t, neighbourhood.x + t.x, neighbourhood.z + t.z)
      if (!kind) return t
      drowned.add(at(t.x, t.z))
      return { ...t, kind, top: kind === 'water' ? WATER_TOP : SHALLOW_TOP }
    })
    if (drowned.size === 0) return neighbourhood
    // Tiles are on whole or half coordinates, the same for the whole plate.
    const [own] = neighbourhood.layout.tiles
    const fx = own.x - Math.floor(own.x)
    const fz = own.z - Math.floor(own.z)
    const under = (p: { x: number; z: number }) =>
      drowned.has(at(Math.round(p.x - fx) + fx, Math.round(p.z - fz) + fz))
    const covers = (s: {
      x: number
      z: number
      width: number
      depth: number
    }) =>
      // The tiles of its footprint and the ring of tiles around it: nothing stands right at the
      // water's edge, where it would look as if it stood on the sea.
      [...Array(s.width + 2 * SEA_SHORE).keys()].some((di) =>
        [...Array(s.depth + 2 * SEA_SHORE).keys()].some((dj) =>
          drowned.has(
            at(
              s.x - (s.width - 1) / 2 + di - SEA_SHORE,
              s.z - (s.depth - 1) / 2 + dj - SEA_SHORE,
            ),
          ),
        ),
      )
    const club = (s: { kind: string }) =>
      s.kind === 'tennis' || s.kind === 'clubhouse'
    const clubHit = neighbourhood.layout.structures.some(
      (structure) => club(structure) && covers(structure),
    )
    const goes = (
      structure: (typeof neighbourhood.layout.structures)[number],
    ) => covers(structure) || (clubHit && club(structure))
    const removed = neighbourhood.layout.structures.filter(goes)
    const bare = (t: Tile) =>
      removed.some(
        (structure) =>
          Math.abs(t.x - structure.x) < structure.width / 2 &&
          Math.abs(t.z - structure.z) < structure.depth / 2,
      )
    return {
      ...neighbourhood,
      layout: {
        ...neighbourhood.layout,
        tiles: tiles.map((t) =>
          !drowned.has(at(t.x, t.z)) && bare(t)
            ? { ...t, kind: 'grass', top: GRASS_TOP }
            : t,
        ),
        trees: neighbourhood.layout.trees.filter((tree) => !under(tree)),
        flowers: neighbourhood.layout.flowers.filter(
          (flower) => !under(flower),
        ),
        reeds: neighbourhood.layout.reeds.filter((point) => !under(point)),
        rocks: neighbourhood.layout.rocks.filter((point) => !under(point)),
        umbrellas: neighbourhood.layout.umbrellas.filter(
          (umbrella) => !under(umbrella),
        ),
        structures: neighbourhood.layout.structures.filter(
          (structure) => !goes(structure),
        ),
      },
    }
  }
  return {
    ...world,
    neighbourhoods: world.neighbourhoods.map(carve),
    wilds: world.wilds.map(carve),
  }
}
