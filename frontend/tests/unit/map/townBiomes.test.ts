import { describe, expect, it } from 'vitest'
import { type Biome } from '../../../src/city/biomes'
import { cityLayout, hides, type CityLayout } from '../../../src/city/layout'
import { worldLayout } from '../../../src/city/world'
import { big } from './helpers'

const town = Array.from({ length: 7 }, (_, i) => ({
  id: `host-${i}`,
  services: i % 5,
}))

describe('the biomes of a town', () => {
  const kinds = (layout: CityLayout) => new Set(layout.trees.map((t) => t.kind))

  it('is a city by default', () => {
    expect(cityLayout(town).biomes).toEqual({ main: 'city' })
    expect(new Set(cityLayout(town).tiles.map((t) => t.biome))).toEqual(
      new Set(['city']),
    )
  })

  it('fills a city with houses, shops, car parks and tennis courts', () => {
    const layout = cityLayout(town, { main: 'city' })
    const structures = new Set(
      layout.structures.map((structure) => structure.kind),
    )
    for (const kind of ['house', 'shop', 'parking', 'tennis', 'clubhouse']) {
      expect(structures).toContain(kind)
    }
    expect(layout.tiles.some((t) => t.kind === 'court')).toBe(true)
  })

  it('groups the tennis courts of a tile in one club, with a club house', () => {
    const world = worldLayout(big)
    let clubs = 0
    for (const neighbourhood of [...world.neighbourhoods, ...world.wilds]) {
      const courts = neighbourhood.layout.structures.filter(
        (structure) => structure.kind === 'tennis',
      )
      const houses = neighbourhood.layout.structures.filter(
        (structure) => structure.kind === 'clubhouse',
      )
      expect(courts.length).toBeLessThanOrEqual(4)
      expect(houses.length).toBeLessThanOrEqual(1)
      if (courts.length === 0) continue
      clubs++
      expect(courts.length).toBeGreaterThanOrEqual(2)
      // The courts touch in a row, one after the other.
      const xs = courts.map((structure) => structure.x).sort((a, b) => a - b)
      for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBe(3)
      for (const structure of courts) expect(structure.z).toBe(courts[0].z)
      // The club house is against the front of the first court.
      expect(houses.length).toBe(1)
      expect(houses[0].x).toBe(xs[0])
      expect(houses[0].z - courts[0].z).toBe(3.5)
    }
    expect(clubs).toBeGreaterThan(0)
  })

  it('builds up to one football stadium per tile, in the built-up ones', () => {
    const world = worldLayout(big)
    let stadiums = 0
    for (const neighbourhood of [...world.neighbourhoods, ...world.wilds]) {
      const found = neighbourhood.layout.structures.filter(
        (structure) => structure.kind === 'stadium',
      )
      expect(found.length).toBeLessThanOrEqual(1)
      stadiums += found.length
      const { main, second } = neighbourhood.layout.biomes
      if (found.length > 0) {
        expect(
          [main, second].some((b) => b === 'city' || b === 'coastal'),
        ).toBe(true)
      }
      if (![main, second].some((b) => b === 'city' || b === 'coastal')) {
        expect(found).toEqual([])
      }
    }
    expect(stadiums).toBeGreaterThan(0)
  })

  it('gives a coastal city a beach, the sea and shops on the beach', () => {
    const layout = cityLayout(town, { main: 'coastal' })
    expect(layout.tiles.some((t) => t.kind === 'water')).toBe(true)
    expect(layout.tiles.some((t) => t.kind === 'sand')).toBe(true)
    expect(
      layout.structures.some((structure) => structure.kind === 'kiosk'),
    ).toBe(true)
    expect(layout.pier.length).toBeGreaterThan(0)
  })

  it('grows a green forest with ponds', () => {
    const layout = cityLayout(town, { main: 'forest' })
    expect(layout.trees.length).toBeGreaterThan(
      cityLayout(town, { main: 'city' }).trees.length,
    )
    expect(layout.tiles.some((t) => t.kind === 'pond')).toBe(true)
    expect(kinds(layout).has('fir')).toBe(false)
  })

  it('grows firs in the mountains, with frozen lakes and snow', () => {
    const layout = cityLayout(town, { main: 'mountain' })
    expect([...kinds(layout)]).toEqual(['fir'])
    expect(layout.tiles.some((t) => t.kind === 'ice')).toBe(true)
    expect(layout.tiles.some((t) => t.kind === 'snow')).toBe(true)
    expect(layout.tiles.some((t) => t.kind === 'pond')).toBe(false)
    // Higher hills than elsewhere.
    const top = (cityLayout: CityLayout) =>
      Math.max(...cityLayout.tiles.map((t) => t.top))
    expect(top(layout)).toBeGreaterThan(
      top(cityLayout(town, { main: 'forest' })),
    )
  })

  it('grows cacti in the desert, without water', () => {
    const layout = cityLayout(town, { main: 'desert' })
    expect([...kinds(layout)]).toEqual(['cactus'])
    expect(layout.trees.length).toBeGreaterThan(5)
    expect(
      layout.tiles.some((t) => ['water', 'shallow', 'pond'].includes(t.kind)),
    ).toBe(false)
  })

  it('grows a bit of vegetation in the tundra', () => {
    const layout = cityLayout(town, { main: 'tundra' })
    expect(kinds(layout).has('shrub')).toBe(true)
    for (const kind of kinds(layout)) expect(['shrub', 'fir']).toContain(kind)
  })

  it('has no sea away from a coast', () => {
    for (const main of [
      'forest',
      'mountain',
      'city',
      'desert',
      'tundra',
    ] as const) {
      const layout = cityLayout(town, { main })
      expect(
        layout.tiles.filter((t) => t.kind === 'water' || t.kind === 'shallow'),
      ).toEqual([])
      expect(layout.boats).toEqual([])
    }
  })

  it('puts the second biome on its side, with a band of both between', () => {
    const layout = cityLayout(town, {
      main: 'forest',
      second: 'desert',
      side: 'right',
    })
    const mean = (biome: Biome) => {
      const xs = layout.tiles.filter((t) => t.biome === biome).map((t) => t.x)
      return xs.reduce((a, b) => a + b, 0) / xs.length
    }
    expect(mean('desert')).toBeGreaterThan(mean('forest') + 5)
    // Several columns mix both biomes.
    const mixed = new Set(
      layout.tiles
        .filter((t) => t.biome === 'desert')
        .map((t) => t.x)
        .filter((x) =>
          layout.tiles.some((t) => t.x === x && t.biome === 'forest'),
        ),
    )
    expect(mixed.size).toBeGreaterThanOrEqual(3)
  })

  it('narrows the sea towards a land biome on the side', () => {
    const layout = cityLayout(town, {
      main: 'coastal',
      second: 'forest',
      side: 'right',
    })
    const sea = layout.tiles.filter((t) => t.kind === 'water')
    expect(sea.length).toBeGreaterThan(0)
    expect(Math.max(...sea.map((t) => t.x))).toBeLessThan(layout.halfWidth - 3)
  })

  it('never hides a building behind a structure', () => {
    for (const main of ['city', 'coastal'] as const) {
      const layout = cityLayout(town, { main })
      for (const structure of layout.structures) {
        for (const lot of layout.lots) {
          expect(
            hides(
              {
                ...structure,
                radius: Math.hypot(structure.width, structure.depth) / 2,
              },
              lot,
            ),
          ).toBe(false)
        }
      }
    }
  })

  it('keeps the structures off the roads and the lots', () => {
    const layout = cityLayout(town, { main: 'city' })
    const kind = new Map(layout.tiles.map((t) => [`${t.x},${t.z}`, t.kind]))
    for (const structure of layout.structures) {
      for (
        let dx = -(structure.width - 1) / 2;
        dx <= (structure.width - 1) / 2;
        dx++
      ) {
        for (
          let dz = -(structure.depth - 1) / 2;
          dz <= (structure.depth - 1) / 2;
          dz++
        ) {
          expect(kind.get(`${structure.x + dx},${structure.z + dz}`)).not.toBe(
            'road',
          )
        }
      }
    }
  })
})
