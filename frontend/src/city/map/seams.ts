// The mixing of the biomes where two plates meet.
import { noise, treeFor, type Biome } from '../biomes'
import { TREE_HEIGHTS, type Tile, type TileKind } from '../layout'
import type { World } from '../world'

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
export function blendSeams(world: World): World {
  const plates = [...world.neighbourhoods, ...world.wilds]
  const at = (x: number, z: number) =>
    `${Math.round(2 * x)},${Math.round(2 * z)}`
  const owner = new Map<string, { plate: number; tile: Tile }>()
  plates.forEach((neighbourhood, plate) => {
    for (const tile of neighbourhood.layout.tiles) {
      owner.set(at(neighbourhood.x + tile.x, neighbourhood.z + tile.z), {
        plate,
        tile,
      })
    }
  })
  const blended = plates.map((neighbourhood, plate) => {
    const changed = new Map<string, Biome>()
    const tiles = neighbourhood.layout.tiles.map((tile) => {
      if (!LAND.has(tile.kind)) return tile
      const x = neighbourhood.x + tile.x
      const z = neighbourhood.z + tile.z
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
    if (changed.size === 0) return neighbourhood
    // Tiles are on whole or half coordinates, the same for the whole plate.
    const [first] = neighbourhood.layout.tiles
    const ox = first.x - Math.floor(first.x)
    const oz = first.z - Math.floor(first.z)
    const trees = neighbourhood.layout.trees.map((tree) => {
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
    return {
      ...neighbourhood,
      layout: { ...neighbourhood.layout, tiles, trees },
    }
  })
  return {
    ...world,
    neighbourhoods: blended.slice(0, world.neighbourhoods.length),
    wilds: blended.slice(world.neighbourhoods.length),
  }
}
