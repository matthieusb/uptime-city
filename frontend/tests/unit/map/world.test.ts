import { describe, expect, it } from 'vitest'
import { sizeScore, worldLayout } from '../../../src/city/world'
import { spec, hosts } from './helpers'

// A homelab: from a lone host to one with many vm-hosts, as hosts can differ a lot.
const homelab = [
  spec('macro1', 5, 6, 4, 4),
  spec('macro3', 1),
  spec('msi', 9, 9, 9),
  spec('nas', 6, 6, 6, 6, 6, 6, 6, 6),
  spec('pi3'),
  spec('pi5'),
  spec('zima1'),
  spec('zima2'),
  spec('zima3'),
]

describe('worldLayout', () => {
  it('has no neighbourhood without hosts', () => {
    expect(worldLayout([]).neighbourhoods).toEqual([])
  })

  it('makes one neighbourhood per physical host, in order', () => {
    expect(
      worldLayout(hosts).neighbourhoods.map(
        (neighbourhood) => neighbourhood.id,
      ),
    ).toEqual(['a', 'b', 'c', 'd', 'e'])
  })

  it('builds every monitored building, among decoration that is not monitored', () => {
    for (const neighbourhood of worldLayout(hosts).neighbourhoods) {
      const lots = neighbourhood.layout.lots
      const monitored = lots.filter((lot) => !lot.decor).map((lot) => lot.id)
      expect(monitored).toEqual(
        hosts
          .find(
            (neighbourhoodSpec) => neighbourhoodSpec.id === neighbourhood.id,
          )!
          .buildings.map((hostSpec) => hostSpec.id),
      )
      const decor = new Set(lots.map((lot) => lot.decor).filter(Boolean))
      expect(decor).toEqual(new Set(['supermarket', 'parking', 'houses']))
    }
  })

  it('puts the neighbourhoods side by side on one ground, without a gap', () => {
    const { neighbourhoods: plates } = worldLayout(hosts)
    expect(plates.length).toBe(5)
    for (const neighbourhood of plates) {
      // Every plate touches another one, to the side or above.
      const touching = plates.filter((b) => {
        if (neighbourhood === b) return false
        const dx = Math.abs(neighbourhood.x - b.x)
        const dz = Math.abs(neighbourhood.z - b.z)
        const width = neighbourhood.layout.halfWidth + b.layout.halfWidth
        const depth = neighbourhood.layout.halfDepth + b.layout.halfDepth
        return (
          (Math.abs(dx - width) < 1e-6 && dz < 1e-6) ||
          (Math.abs(dz - depth) < 1e-6 &&
            dx < neighbourhood.layout.halfWidth + b.layout.halfWidth)
        )
      })
      expect(touching.length).toBeGreaterThan(0)
    }
  })

  it('makes a neighbourhood smaller when its host has fewer services and vms', () => {
    const [small] = worldLayout([spec('small')]).neighbourhoods
    const [big] = worldLayout([spec('big', 3, 4, 5, 6, 7, 8, 9)]).neighbourhoods
    expect(small.layout.halfWidth).toBeLessThan(big.layout.halfWidth)
  })

  it('gives every neighbourhood its own area, bigger with a bigger size score', () => {
    const world = worldLayout(homelab)
    const area = (id: string) => {
      const cityLayout = world.neighbourhoods.find(
        (neighbourhood) => neighbourhood.id === id,
      )!.layout
      return 4 * cityLayout.halfWidth * cityLayout.halfDepth
    }
    const byScore = homelab
      .map((neighbourhoodSpec) => ({
        id: neighbourhoodSpec.id,
        score: sizeScore(neighbourhoodSpec.buildings),
      }))
      .sort((p, q) => p.score - q.score)
    for (let i = 1; i < byScore.length; i++) {
      if (byScore[i].score > byScore[i - 1].score) {
        expect(area(byScore[i].id)).toBeGreaterThan(area(byScore[i - 1].id))
      }
    }
  })

  it('does not stretch a small neighbourhood to the size of the others', () => {
    const world = worldLayout([
      spec('big', 3, 4, 5, 6, 7, 8, 9, 6, 6),
      spec('small'),
    ])
    const [big, small] = world.neighbourhoods
    expect(small.layout.halfWidth * small.layout.halfDepth).toBeLessThan(
      (big.layout.halfWidth * big.layout.halfDepth) / 2,
    )
  })

  it('joins the neighbourhoods with wild tiles, none for a lone neighbourhood', () => {
    expect(worldLayout([spec('a', 3)]).wilds).toEqual([])
    const { wilds, neighbourhoods } = worldLayout(homelab)
    expect(wilds.length).toBeGreaterThan(0)
    for (const w of wilds) {
      expect(w.layout.lots).toEqual([])
      expect(
        neighbourhoods.map((neighbourhood) => neighbourhood.id),
      ).not.toContain(w.id)
    }
  })

  it('does not overlap any ground', () => {
    const world = worldLayout(homelab)
    const keys: string[] = []
    for (const neighbourhood of [...world.neighbourhoods, ...world.wilds]) {
      for (const t of neighbourhood.layout.tiles)
        keys.push(`${neighbourhood.x + t.x},${neighbourhood.z + t.z}`)
    }
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('makes a map close to a square', () => {
    const world = worldLayout(homelab)
    const aspect = world.halfWidth / world.halfDepth
    expect(aspect).toBeGreaterThan(0.6)
    expect(aspect).toBeLessThan(1.6)
  })

  it('weighs a host by its services, its vm-hosts and their services', () => {
    expect(sizeScore([{ id: 'h', services: 0 }])).toBe(20)
    expect(sizeScore([{ id: 'h', services: 3 }])).toBe(20 + 3 * 5)
    expect(
      sizeScore([
        { id: 'h', services: 3 },
        { id: 'v1', services: 2 },
        { id: 'v2', services: 0 },
      ]),
    ).toBe(20 + 3 * 5 + (15 + 2 * 6) + 15)
  })

  it('leaves no void on the ground, even with very tall hosts', () => {
    const homelab = [
      spec('a', 3, 9, 4),
      spec('b', 12),
      spec('c'),
      spec('d', 2, 20),
      spec('e', 5),
      spec('f'),
      spec('g', 30),
    ]
    const world = worldLayout(homelab)
    const tiles = new Set<string>()
    for (const neighbourhood of [...world.neighbourhoods, ...world.wilds]) {
      for (const t of neighbourhood.layout.tiles)
        tiles.add(`${neighbourhood.x + t.x},${neighbourhood.z + t.z}`)
    }
    const xs = [...tiles].map((k) => Number(k.split(',')[0]))
    const zs = [...tiles].map((k) => Number(k.split(',')[1]))
    const [x0, x1] = [Math.min(...xs), Math.max(...xs)]
    const [z0, z1] = [Math.min(...zs), Math.max(...zs)]
    expect(tiles.size).toBe((x1 - x0 + 1) * (z1 - z0 + 1))
  })

  it('plants nothing on the roads that link the plates', () => {
    const { neighbourhoods, wilds } = worldLayout(hosts)
    for (const neighbourhood of [...neighbourhoods, ...wilds]) {
      const roads = new Set(
        neighbourhood.layout.tiles
          .filter((t) => t.kind === 'road')
          .map((t) => `${t.x},${t.z}`),
      )
      for (const tree of neighbourhood.layout.trees) {
        expect(roads.has(`${Math.round(tree.x)},${Math.round(tree.z)}`)).toBe(
          false,
        )
      }
    }
  })

  it('never hides a building behind one of another neighbourhood', () => {
    const { neighbourhoods } = worldLayout(hosts)
    const lots = neighbourhoods.flatMap((neighbourhood) =>
      neighbourhood.layout.lots.map((lot) => ({
        ...lot,
        x: lot.x + neighbourhood.x,
        z: lot.z + neighbourhood.z,
        n: neighbourhood.id,
      })),
    )
    for (const a of lots) {
      for (const b of lots) {
        if (a.n === b.n) continue
        const sideways = Math.abs(a.x - b.x - (a.z - b.z)) / Math.SQRT2
        const depth = (a.x - b.x + (a.z - b.z)) / Math.SQRT2
        const halves = (a.width + b.width) / Math.SQRT2
        const reach = a.height * Math.sqrt(3) + halves
        expect(sideways >= halves + 1 || depth <= 0 || depth >= reach).toBe(
          true,
        )
      }
    }
  })

  it('fits every neighbourhood in the world', () => {
    const world = worldLayout(hosts)
    for (const neighbourhood of [...world.neighbourhoods, ...world.wilds]) {
      expect(
        Math.abs(neighbourhood.x) + neighbourhood.layout.halfWidth,
      ).toBeLessThanOrEqual(world.halfWidth)
      expect(
        Math.abs(neighbourhood.z) + neighbourhood.layout.halfDepth,
      ).toBeLessThanOrEqual(world.halfDepth)
    }
  })

  it('looks the same on every call', () => {
    expect(worldLayout(hosts)).toEqual(worldLayout(hosts))
  })
})

describe('the shape of the map', () => {
  it.each([2, 3, 5, 7, 9])(
    'is about as wide as it is deep with %i hosts',
    (n) => {
      const world = worldLayout(
        Array.from({ length: n }, (_, i) => spec(`host-${i}`, 1)),
      )
      const ratio = world.halfWidth / world.halfDepth
      expect(ratio).toBeGreaterThan(0.5)
      expect(ratio).toBeLessThan(2.5)
    },
  )
})
