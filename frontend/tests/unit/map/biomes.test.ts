import { describe, expect, it } from 'vitest'
import {
  BIOMES,
  biomeAt,
  mainBiome,
  secondBiome,
  treeFor,
  type Biome,
} from '../../../src/city/biomes'
import {
  cityLayout,
  hides,
  type CityLayout,
  type Tile,
} from '../../../src/city/layout'
import {
  worldLayout,
  type Neighbourhood,
  type NeighbourhoodSpec,
} from '../../../src/city/world'

const spec = (id: string, ...vms: number[]): NeighbourhoodSpec => ({
  id,
  buildings: [
    { id, services: 2 },
    ...vms.map((services, i) => ({ id: `${id}-vm${i}`, services })),
  ],
})

// A big homelab, for the biomes to show their spread.
const big = Array.from({ length: 30 }, (_, i) =>
  spec(`host-${i}`, ...Array.from({ length: i % 4 }, (_, n) => (i + n) % 6)),
)

const town = Array.from({ length: 7 }, (_, i) => ({
  id: `host-${i}`,
  services: i % 5,
}))

const share = (tiles: Tile[], biome: Biome) =>
  tiles.filter((t) => t.biome === biome).length / tiles.length

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
    const structures = new Set(layout.structures.map((s) => s.kind))
    for (const kind of ['house', 'shop', 'parking', 'tennis', 'clubhouse']) {
      expect(structures).toContain(kind)
    }
    expect(layout.tiles.some((t) => t.kind === 'court')).toBe(true)
  })

  it('groups the tennis courts of a tile in one club, with a club house', () => {
    const world = worldLayout(big)
    let clubs = 0
    for (const n of [...world.neighbourhoods, ...world.wilds]) {
      const courts = n.layout.structures.filter((s) => s.kind === 'tennis')
      const houses = n.layout.structures.filter((s) => s.kind === 'clubhouse')
      expect(courts.length).toBeLessThanOrEqual(4)
      expect(houses.length).toBeLessThanOrEqual(1)
      if (courts.length === 0) continue
      clubs++
      expect(courts.length).toBeGreaterThanOrEqual(2)
      // The courts touch in a row, one after the other.
      const xs = courts.map((c) => c.x).sort((a, b) => a - b)
      for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBe(3)
      for (const c of courts) expect(c.z).toBe(courts[0].z)
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
    for (const n of [...world.neighbourhoods, ...world.wilds]) {
      const found = n.layout.structures.filter((s) => s.kind === 'stadium')
      expect(found.length).toBeLessThanOrEqual(1)
      stadiums += found.length
      const { main, second } = n.layout.biomes
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
    expect(layout.structures.some((s) => s.kind === 'kiosk')).toBe(true)
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
    const top = (l: CityLayout) => Math.max(...l.tiles.map((t) => t.top))
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
      for (const s of layout.structures) {
        for (const lot of layout.lots) {
          expect(
            hides({ ...s, radius: Math.hypot(s.width, s.depth) / 2 }, lot),
          ).toBe(false)
        }
      }
    }
  })

  it('keeps the structures off the roads and the lots', () => {
    const layout = cityLayout(town, { main: 'city' })
    const kind = new Map(layout.tiles.map((t) => [`${t.x},${t.z}`, t.kind]))
    for (const s of layout.structures) {
      for (let dx = -(s.width - 1) / 2; dx <= (s.width - 1) / 2; dx++) {
        for (let dz = -(s.depth - 1) / 2; dz <= (s.depth - 1) / 2; dz++) {
          expect(kind.get(`${s.x + dx},${s.z + dz}`)).not.toBe('road')
        }
      }
    }
  })
})

describe('the biomes of the map', () => {
  const world = worldLayout(big)
  const plates: Neighbourhood[] = [...world.neighbourhoods, ...world.wilds]
  const atFront = (n: Neighbourhood) =>
    Math.abs(n.z + n.layout.halfDepth - world.halfDepth) < 1e-6
  const allTiles = plates.flatMap((n) =>
    n.layout.tiles.map((t) => ({ ...t, x: t.x + n.x, z: t.z + n.z })),
  )

  it('gives every plate one or two biomes', () => {
    for (const n of plates) {
      const { main, second } = n.layout.biomes
      expect(BIOMES).toContain(main)
      if (second) expect(second).not.toBe(main)
    }
    expect(plates.some((n) => n.layout.biomes.second)).toBe(true)
    expect(
      new Set(plates.map((n) => n.layout.biomes.main)).size,
    ).toBeGreaterThanOrEqual(4)
  })

  it('only has coastal plates and the sea along the front edge', () => {
    for (const n of plates) {
      const { main, second } = n.layout.biomes
      if (main === 'coastal' || second === 'coastal') {
        expect(atFront(n)).toBe(true)
      }
    }
    expect(
      plates.some(
        (n) =>
          n.layout.biomes.main === 'coastal' ||
          n.layout.biomes.second === 'coastal',
      ),
    ).toBe(true)
    for (const t of allTiles) {
      if (t.kind === 'water' || t.kind === 'shallow') {
        expect(world.halfDepth - t.z).toBeLessThan(10)
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
    for (const n of plates) {
      for (const t of n.layout.tiles) owner.set(key(t.x + n.x, t.z + n.z), n)
    }
    let borrowed = 0
    for (const n of plates) {
      const { main, second } = n.layout.biomes
      for (const t of n.layout.tiles) {
        if (t.biome === main || t.biome === second) continue
        borrowed++
        // A biome of its own plate's, or taken from a plate a few tiles away.
        const near = [-1, 1].flatMap((s) =>
          [1, 2, 3, 4].flatMap((k) => [
            owner.get(key(t.x + n.x + s * k, t.z + n.z)),
            owner.get(key(t.x + n.x, t.z + n.z + s * k)),
          ]),
        )
        expect(
          near.some(
            (o) =>
              o &&
              o !== n &&
              (o.layout.biomes.main === t.biome ||
                o.layout.biomes.second === t.biome),
          ),
        ).toBe(true)
      }
    }
    expect(borrowed).toBeGreaterThan(0)
  })

  it('never hides a building behind wild ground', () => {
    const lots = world.neighbourhoods.flatMap((n) =>
      n.layout.lots.map((l) => ({ ...l, x: l.x + n.x, z: l.z + n.z })),
    )
    for (const w of world.wilds) {
      const objects = [
        ...w.layout.tiles
          .filter((t) => t.kind === 'hill')
          .map((t) => ({ ...t, height: t.top, radius: 0.7 })),
        ...w.layout.trees.map((t) => ({ ...t, radius: 0.45 * t.scale })),
        ...w.layout.structures.map((s) => ({
          ...s,
          radius: Math.hypot(s.width, s.depth) / 2,
        })),
      ]
      for (const o of objects) {
        const placed = { ...o, x: o.x + w.x, z: o.z + w.z }
        for (const lot of lots) expect(hides(placed, lot)).toBe(false)
      }
    }
  })

  it('still builds every monitored building', () => {
    for (const n of world.neighbourhoods) {
      expect(n.layout.lots.filter((l) => !l.decor).map((l) => l.id)).toEqual(
        big.find((s) => s.id === n.id)!.buildings.map((b) => b.id),
      )
    }
  })
})
