import { describe, expect, it } from 'vitest'
import {
  BIOMES,
  biomeAt,
  mainBiome,
  secondBiome,
  treeFor,
  type Biome,
} from '../../../src/city/biomes'

describe('choosing the biomes', () => {
  const ids = Array.from({ length: 600 }, (_, i) => `plate-${i}`)
  const middle = { u: 0.5, v: 0.5, front: false }
  const corner = { u: 0.05, v: 0.05, front: false }
  const count = (spot: typeof middle, biome: Biome) =>
    ids.filter((id) => mainBiome(id, spot) === biome).length

  it('picks one of the six biomes, the same for the same plate', () => {
    for (const id of ids.slice(0, 50)) {
      expect(BIOMES).toContain(mainBiome(id, middle))
      expect(mainBiome(id, middle)).toBe(mainBiome(id, middle))
    }
  })

  it('puts mountains mostly at the middle of the map', () => {
    expect(count(middle, 'mountain')).toBeGreaterThan(
      2 * count(corner, 'mountain'),
    )
  })

  it('makes deserts and tundras rare, but possible', () => {
    for (const rare of ['desert', 'tundra'] as const) {
      expect(count(corner, rare)).toBeGreaterThan(0)
      expect(count(corner, rare)).toBeLessThan(count(corner, 'forest') / 3)
      expect(count(corner, rare)).toBeLessThan(count(corner, 'city') / 3)
    }
  })

  it('keeps coastal cities to the front edge of the map', () => {
    expect(count(middle, 'coastal')).toBe(0)
    expect(count({ ...middle, front: true }, 'coastal')).toBeGreaterThan(0)
  })

  it('takes a second biome from a neighbour, on its side', () => {
    const seconds = ids.map((id) =>
      secondBiome(id, 'forest', middle, [{ side: 'right', biome: 'city' }]),
    )
    expect(seconds.filter((s) => s.second === 'city').length).toBeGreaterThan(
      ids.length / 3,
    )
    for (const s of seconds.filter((s) => s.second === 'city')) {
      expect(s.side).toBe('right')
    }
    for (const s of seconds) expect(s.second).not.toBe('forest')
  })

  it('only puts the sea of a second coastal biome at the front', () => {
    for (const id of ids) {
      const s = secondBiome(id, 'city', { ...middle, front: true }, [])
      if (s.second === 'coastal') expect(s.side).not.toBe('back')
      const t = secondBiome(id, 'coastal', { ...middle, front: true }, [])
      expect(t.side).not.toBe('front')
      expect(secondBiome(id, 'city', middle, []).second).not.toBe('coastal')
    }
  })

  it('blends two biomes over a band in the middle', () => {
    const biomes = { main: 'forest', second: 'desert', side: 'right' } as const
    expect(biomeAt(biomes, 0.05, 0.5, 0.5)).toBe('forest')
    expect(biomeAt(biomes, 0.95, 0.5, 0.5)).toBe('desert')
    // In the middle, it depends on the tile.
    expect(biomeAt(biomes, 0.5, 0.5, 0.05)).not.toBe(
      biomeAt(biomes, 0.5, 0.5, 0.95),
    )
  })

  it('grows the trees of each biome', () => {
    expect(treeFor('mountain', 'oak', 0.5)).toBe('fir')
    expect(treeFor('desert', 'oak', 0.5)).toBe('cactus')
    expect(['shrub', 'fir']).toContain(treeFor('tundra', 'oak', 0.5))
    expect(treeFor('forest', 'pine', 0.5)).toBe('pine')
  })
})
