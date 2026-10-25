import { describe, expect, it } from 'vitest'
import {
  nukedLayout,
  sizeScore,
  worldFrame,
  worldLayout,
  type NeighbourhoodSpec,
} from '../../src/city/world'

// A physical host, with a building for itself and one per vm-host.
const spec = (id: string, ...vms: number[]): NeighbourhoodSpec => ({
  id,
  buildings: [
    { id, services: 2 },
    ...vms.map((services, i) => ({ id: `${id}-vm${i}`, services })),
  ],
})

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

const hosts = [spec('a', 3), spec('b'), spec('c'), spec('d'), spec('e', 3, 18)]

describe('worldLayout', () => {
  it('has no neighbourhood without hosts', () => {
    expect(worldLayout([]).neighbourhoods).toEqual([])
  })

  it('makes one neighbourhood per physical host, in order', () => {
    expect(worldLayout(hosts).neighbourhoods.map((n) => n.id)).toEqual([
      'a',
      'b',
      'c',
      'd',
      'e',
    ])
  })

  it('builds every monitored building, among decoration that is not monitored', () => {
    for (const n of worldLayout(hosts).neighbourhoods) {
      const lots = n.layout.lots
      const monitored = lots.filter((l) => !l.decor).map((l) => l.id)
      expect(monitored).toEqual(
        hosts.find((h) => h.id === n.id)!.buildings.map((b) => b.id),
      )
      const decor = new Set(lots.map((l) => l.decor).filter(Boolean))
      expect(decor).toEqual(new Set(['supermarket', 'parking', 'houses']))
    }
  })

  it('puts the neighbourhoods side by side on one ground, without a gap', () => {
    const { neighbourhoods: plates } = worldLayout(hosts)
    expect(plates.length).toBe(5)
    for (const a of plates) {
      // Every plate touches another one, to the side or above.
      const touching = plates.filter((b) => {
        if (a === b) return false
        const dx = Math.abs(a.x - b.x)
        const dz = Math.abs(a.z - b.z)
        const width = a.layout.halfWidth + b.layout.halfWidth
        const depth = a.layout.halfDepth + b.layout.halfDepth
        return (
          (Math.abs(dx - width) < 1e-6 && dz < 1e-6) ||
          (Math.abs(dz - depth) < 1e-6 &&
            dx < a.layout.halfWidth + b.layout.halfWidth)
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
      const l = world.neighbourhoods.find((n) => n.id === id)!.layout
      return 4 * l.halfWidth * l.halfDepth
    }
    const byScore = homelab
      .map((h) => ({ id: h.id, score: sizeScore(h.buildings) }))
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
      expect(neighbourhoods.map((n) => n.id)).not.toContain(w.id)
    }
  })

  it('does not overlap any ground', () => {
    const world = worldLayout(homelab)
    const keys: string[] = []
    for (const n of [...world.neighbourhoods, ...world.wilds]) {
      for (const t of n.layout.tiles) keys.push(`${n.x + t.x},${n.z + t.z}`)
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
    for (const n of [...world.neighbourhoods, ...world.wilds]) {
      for (const t of n.layout.tiles) tiles.add(`${n.x + t.x},${n.z + t.z}`)
    }
    const xs = [...tiles].map((k) => Number(k.split(',')[0]))
    const zs = [...tiles].map((k) => Number(k.split(',')[1]))
    const [x0, x1] = [Math.min(...xs), Math.max(...xs)]
    const [z0, z1] = [Math.min(...zs), Math.max(...zs)]
    expect(tiles.size).toBe((x1 - x0 + 1) * (z1 - z0 + 1))
  })

  it('plants nothing on the roads that link the plates', () => {
    const { neighbourhoods, wilds } = worldLayout(hosts)
    for (const n of [...neighbourhoods, ...wilds]) {
      const roads = new Set(
        n.layout.tiles
          .filter((t) => t.kind === 'road')
          .map((t) => `${t.x},${t.z}`),
      )
      for (const tree of n.layout.trees) {
        expect(roads.has(`${Math.round(tree.x)},${Math.round(tree.z)}`)).toBe(
          false,
        )
      }
    }
  })

  it('never hides a building behind one of another neighbourhood', () => {
    const { neighbourhoods } = worldLayout(hosts)
    const lots = neighbourhoods.flatMap((n) =>
      n.layout.lots.map((l) => ({ ...l, x: l.x + n.x, z: l.z + n.z, n: n.id })),
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
    for (const n of [...world.neighbourhoods, ...world.wilds]) {
      expect(Math.abs(n.x) + n.layout.halfWidth).toBeLessThanOrEqual(
        world.halfWidth,
      )
      expect(Math.abs(n.z) + n.layout.halfDepth).toBeLessThanOrEqual(
        world.halfDepth,
      )
    }
  })

  it('looks the same on every call', () => {
    expect(worldLayout(hosts)).toEqual(worldLayout(hosts))
  })
})

// Where a point of the map is on screen, seen from the isometric camera: to
// the right along (1, 0, -1), up with Y, and lower the closer to the camera.
const project = (x: number, y: number, z: number) => ({
  sx: (x - z) / Math.SQRT2,
  sy:
    y * Math.cos(Math.PI / 6) - ((x + z) / Math.SQRT2) * Math.sin(Math.PI / 6),
})

describe('worldFrame', () => {
  const world = worldLayout(hosts)

  it('frames an empty world', () => {
    const frame = worldFrame(worldLayout([]), 6)
    expect(frame.width).toBeGreaterThan(0)
    expect(frame.height).toBeGreaterThan(0)
  })

  it('is centered on the middle of what it shows', () => {
    const frame = worldFrame(world, 12)
    const center = project(...frame.target)
    for (const n of [...world.neighbourhoods, ...world.wilds]) {
      for (const dx of [-1, 1]) {
        for (const dz of [-1, 1]) {
          const x = n.x + dx * n.layout.halfWidth
          const z = n.z + dz * n.layout.halfDepth
          for (const y of [0, 12]) {
            const { sx, sy } = project(x, y, z)
            expect(Math.abs(sx - center.sx)).toBeLessThanOrEqual(
              frame.width / 2 + 1e-6,
            )
            expect(Math.abs(sy - center.sy)).toBeLessThanOrEqual(
              frame.height / 2 + 1e-6,
            )
          }
        }
      }
    }
  })

  it('is never wider than the bounding square of the map', () => {
    const frame = worldFrame(world, 6)
    expect(frame.width).toBeLessThanOrEqual(
      (world.halfWidth + world.halfDepth) * Math.SQRT2 + 1e-6,
    )
  })

  it('makes room for taller buildings', () => {
    expect(worldFrame(world, 40).height).toBeGreaterThan(
      worldFrame(world, 6).height,
    )
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

describe('nukedLayout', () => {
  const plate = worldLayout(hosts).neighbourhoods[0].layout
  const nuked = nukedLayout(plate)

  it('keeps the ground and the monitored buildings', () => {
    expect(nuked.halfWidth).toBe(plate.halfWidth)
    expect(nuked.halfDepth).toBe(plate.halfDepth)
    expect(nuked.tiles.length).toBe(plate.tiles.length)
    expect(nuked.lots.map((l) => l.id)).toEqual(
      plate.lots.filter((l) => !l.decor).map((l) => l.id),
    )
  })

  it('burns the trees and the flowers, and stops the traffic', () => {
    expect(plate.trees.length).toBeGreaterThan(0)
    expect(nuked.trees).toEqual([])
    expect(nuked.flowers).toEqual([])
    expect(nuked.reeds).toEqual([])
    expect(nuked.umbrellas).toEqual([])
    expect(nuked.boats).toEqual([])
    expect(nuked.roads).toEqual([])
  })

  it('digs a crater at the middle, but not under a building', () => {
    const craters = nuked.tiles.filter((t) => t.kind === 'crater')
    expect(craters.length).toBeGreaterThan(5)
    const middle = Math.max(...craters.map((t) => Math.hypot(t.x, t.z)))
    expect(middle).toBeLessThan(10)
    for (const c of craters) {
      for (const lot of nuked.lots) {
        expect(Math.hypot(c.x - lot.x, c.z - lot.z)).toBeGreaterThan(2.5)
      }
    }
  })

  it('leaves the original layout alone', () => {
    expect(plate.tiles.some((t) => t.kind === 'crater')).toBe(false)
    expect(plate.trees.length).toBeGreaterThan(0)
  })
})
