import { describe, expect, it } from 'vitest'
import { BIOMES, type Biome } from '../../../src/city/biomes'
import { hides, type Tile } from '../../../src/city/layout'
import { worldLayout, type Neighbourhood } from '../../../src/city/world'
import { big } from './helpers'

const share = (tiles: Tile[], biome: Biome) =>
  tiles.filter((t) => t.biome === biome).length / tiles.length

describe('the biomes of the map', () => {
  const world = worldLayout(big)
  const plates: Neighbourhood[] = [...world.neighbourhoods, ...world.wilds]
  const atFront = (neighbourhood: Neighbourhood) =>
    Math.abs(
      neighbourhood.z + neighbourhood.layout.halfDepth - world.halfDepth,
    ) < 1e-6
  const allTiles = plates.flatMap((neighbourhood) =>
    neighbourhood.layout.tiles.map((t) => ({
      ...t,
      x: t.x + neighbourhood.x,
      z: t.z + neighbourhood.z,
    })),
  )

  it('gives every plate one or two biomes', () => {
    for (const neighbourhood of plates) {
      const { main, second } = neighbourhood.layout.biomes
      expect(BIOMES).toContain(main)
      if (second) expect(second).not.toBe(main)
    }
    expect(
      plates.some((neighbourhood) => neighbourhood.layout.biomes.second),
    ).toBe(true)
    expect(
      new Set(plates.map((neighbourhood) => neighbourhood.layout.biomes.main))
        .size,
    ).toBeGreaterThanOrEqual(4)
  })

  it('only has coastal plates along the front edge, and the sea along the front or a side edge', () => {
    for (const neighbourhood of plates) {
      const { main, second } = neighbourhood.layout.biomes
      if (main === 'coastal' || second === 'coastal') {
        expect(atFront(neighbourhood)).toBe(true)
      }
    }
    expect(
      plates.some(
        (neighbourhood) =>
          neighbourhood.layout.biomes.main === 'coastal' ||
          neighbourhood.layout.biomes.second === 'coastal',
      ),
    ).toBe(true)
    for (const t of allTiles) {
      if (t.kind === 'water' || t.kind === 'shallow') {
        // The sea is along the front edge, or along a side edge (see `carveSeas`).
        expect(
          Math.min(world.halfDepth - t.z, world.halfWidth - Math.abs(t.x)),
        ).toBeLessThan(10)
      }
    }
  })

  it('has more mountains at the middle than at the edges', () => {
    const land = allTiles.filter((t) => t.kind !== 'road')
    const outward = (t: { x: number; z: number }) =>
      Math.max(Math.abs(t.x) / world.halfWidth, Math.abs(t.z) / world.halfDepth)
    const mean = (list: typeof land) =>
      list.reduce((sum, t) => sum + outward(t), 0) / list.length
    const mountains = land.filter((t) => t.biome === 'mountain')
    expect(mountains.length).toBeGreaterThan(0)
    expect(mean(mountains)).toBeLessThan(mean(land))
  })

  it('makes deserts and tundras rarer than forests and cities', () => {
    for (const rare of ['desert', 'tundra'] as const) {
      expect(share(allTiles, rare)).toBeLessThan(share(allTiles, 'forest'))
      expect(share(allTiles, rare)).toBeLessThan(share(allTiles, 'city'))
    }
  })

  it('mixes the biomes of two plates near the edge they share', () => {
    const owner = new Map<string, Neighbourhood>()
    const key = (x: number, z: number) =>
      `${Math.round(2 * x)},${Math.round(2 * z)}`
    for (const neighbourhood of plates) {
      for (const t of neighbourhood.layout.tiles)
        owner.set(
          key(t.x + neighbourhood.x, t.z + neighbourhood.z),
          neighbourhood,
        )
    }
    let borrowed = 0
    for (const neighbourhood of plates) {
      const { main, second } = neighbourhood.layout.biomes
      for (const t of neighbourhood.layout.tiles) {
        if (t.biome === main || t.biome === second) continue
        borrowed++
        // A biome of its own plate's, or taken from a plate a few tiles away.
        const near = [-1, 1].flatMap((s) =>
          [1, 2, 3, 4].flatMap((k) => [
            owner.get(
              key(t.x + neighbourhood.x + s * k, t.z + neighbourhood.z),
            ),
            owner.get(
              key(t.x + neighbourhood.x, t.z + neighbourhood.z + s * k),
            ),
          ]),
        )
        expect(
          near.some(
            (o) =>
              o &&
              o !== neighbourhood &&
              (o.layout.biomes.main === t.biome ||
                o.layout.biomes.second === t.biome),
          ),
        ).toBe(true)
      }
    }
    expect(borrowed).toBeGreaterThan(0)
  })

  it('never hides a building behind wild ground', () => {
    const lots = world.neighbourhoods.flatMap((neighbourhood) =>
      neighbourhood.layout.lots.map((lot) => ({
        ...lot,
        x: lot.x + neighbourhood.x,
        z: lot.z + neighbourhood.z,
      })),
    )
    for (const w of world.wilds) {
      const objects = [
        ...w.layout.tiles
          .filter((t) => t.kind === 'hill')
          .map((t) => ({ ...t, height: t.top, radius: 0.7 })),
        ...w.layout.trees.map((t) => ({ ...t, radius: 0.45 * t.scale })),
        ...w.layout.structures.map((structure) => ({
          ...structure,
          radius: Math.hypot(structure.width, structure.depth) / 2,
        })),
      ]
      for (const o of objects) {
        const placed = { ...o, x: o.x + w.x, z: o.z + w.z }
        for (const lot of lots) expect(hides(placed, lot)).toBe(false)
      }
    }
  })

  it('still builds every monitored building', () => {
    for (const neighbourhood of world.neighbourhoods) {
      expect(
        neighbourhood.layout.lots
          .filter((lot) => !lot.decor)
          .map((lot) => lot.id),
      ).toEqual(
        big
          .find(
            (neighbourhoodSpec) => neighbourhoodSpec.id === neighbourhood.id,
          )!
          .buildings.map((hostSpec) => hostSpec.id),
      )
    }
  })
})
