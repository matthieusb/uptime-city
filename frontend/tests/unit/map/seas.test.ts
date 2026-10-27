import { describe, expect, it } from 'vitest'
import { setWorldSeed } from '../../../src/city/seed'
import { worldLayout, type NeighbourhoodSpec } from '../../../src/city/world'

const spec = (id: string, ...vms: number[]): NeighbourhoodSpec => ({
  id,
  buildings: [
    { id, services: 2 },
    ...vms.map((services, i) => ({ id: `${id}-vm${i}`, services })),
  ],
})

// A homelab of a few hosts, for the sea to have room.
const homelab = [
  spec('macro1', 5, 6, 4, 4),
  spec('macro3', 1),
  spec('msi', 9, 9, 9),
  spec('nas', 6, 6, 6, 6, 6, 6, 6, 6),
  spec('pi3'),
  spec('pi5'),
]

describe('seas on the side edges', () => {
  const seeds = Array.from({ length: 40 }, (_, i) => `sea-${i}`)
  const wet = (kind: string) => kind === 'water' || kind === 'shallow'
  // Whether the left or right edge columns of the map hold sea.
  const edges = (seed: string) => {
    setWorldSeed(seed)
    const world = worldLayout(homelab)
    const plates = [...world.neighbourhoods, ...world.wilds]
    const tiles = plates.flatMap((neighbourhood) =>
      neighbourhood.layout.tiles.map((t) => ({
        ...t,
        x: neighbourhood.x + t.x,
        z: neighbourhood.z + t.z,
      })),
    )
    const sea = (side: 1 | -1) =>
      tiles.some((t) => wet(t.kind) && side * t.x > world.halfWidth - 3)
    return { world, left: sea(-1), right: sea(1) }
  }

  it('lies along the left or right edge on some maps and not on others', () => {
    const all = seeds.map(edges)
    expect(all.some((e) => e.left)).toBe(true)
    expect(all.some((e) => e.right)).toBe(true)
    expect(all.some((e) => !e.left && !e.right)).toBe(true)
    setWorldSeed('')
  })

  it('never covers a monitored building, a road or a tree', () => {
    for (const seed of seeds.slice(0, 15)) {
      const { world } = edges(seed)
      for (const neighbourhood of [...world.neighbourhoods, ...world.wilds]) {
        const [first] = neighbourhood.layout.tiles
        // Tiles are on whole or half coordinates, the same for the whole plate.
        const fraction = (value: number) => value - Math.floor(value)
        const fx = fraction(first.x)
        const fz = fraction(first.z)
        const tileOf = (point: { x: number; z: number }) =>
          `${Math.round(point.x - fx) + fx},${Math.round(point.z - fz) + fz}`
        const water = new Set(
          neighbourhood.layout.tiles
            .filter((tile) => wet(tile.kind))
            .map(tileOf),
        )
        for (const point of [
          ...neighbourhood.layout.trees,
          ...neighbourhood.layout.structures,
          ...neighbourhood.layout.lots,
        ]) {
          expect(water.has(tileOf(point))).toBe(false)
        }
      }
    }
    setWorldSeed('')
  })
  it('keeps a tile of dry ground between the sea and the houses, so that none looks built on water', () => {
    for (const seed of seeds.slice(0, 15)) {
      const { world } = edges(seed)
      for (const neighbourhood of [...world.neighbourhoods, ...world.wilds]) {
        const water = neighbourhood.layout.tiles.filter((tile) =>
          wet(tile.kind),
        )
        for (const house of neighbourhood.layout.structures.filter(
          (structure) => structure.kind === 'house',
        )) {
          for (const tile of water) {
            // The tiles of the footprint and the ring around it are at less than half a tile
            // plus one from its middle.
            const near =
              Math.abs(tile.x - house.x) < house.width / 2 + 1 &&
              Math.abs(tile.z - house.z) < house.depth / 2 + 1
            expect(near, `${seed} ${neighbourhood.id}`).toBe(false)
          }
        }
      }
    }
    setWorldSeed('')
  })
})
