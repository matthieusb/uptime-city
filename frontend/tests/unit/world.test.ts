import { describe, expect, it } from 'vitest'
import { HALF_SCREEN_WIDTH } from '../../src/city/layout'
import {
  nukedLayout,
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

  it('gives neighbouring neighbourhoods different themes', () => {
    const themes = worldLayout(hosts).neighbourhoods.map((n) => n.layout.theme)
    expect(themes[0]).toBe('coastal')
    expect(new Set(themes).size).toBeGreaterThanOrEqual(3)
    for (let i = 1; i < themes.length; i++) {
      expect(themes[i]).not.toBe(themes[i - 1])
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

  it('makes the plates of a row as deep as each other, and the rows as wide', () => {
    const world = worldLayout(hosts)
    const rows = new Map<number, typeof world.neighbourhoods>()
    for (const n of world.neighbourhoods) {
      rows.set(n.z, [...(rows.get(n.z) ?? []), n])
    }
    for (const row of rows.values()) {
      expect(new Set(row.map((p) => p.layout.halfDepth)).size).toBe(1)
    }
    const widths = [...rows.values()].map((row) =>
      row.reduce((sum, p) => sum + 2 * p.layout.halfWidth, 0),
    )
    expect(new Set(widths).size).toBe(1)
  })

  it('has no wilderness: every plate is a neighbourhood', () => {
    expect(worldLayout(hosts).wilds).toEqual([])
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

  it('links the plates of a row with a straight road', () => {
    const { neighbourhoods } = worldLayout(hosts)
    const [a, b] = neighbourhoods
    expect(a.z).toBe(b.z)
    // Two tile rows are roads right to the edge of both plates, at the same
    // place along Z.
    const row = Math.ceil(a.layout.roads[0].z - 1)
    const edge = Math.round(a.layout.halfWidth - 0.5)
    const kind = (n: typeof a, x: number, z: number) =>
      n.layout.tiles.find((t) => t.x === x && t.z === z)?.kind
    expect(b.layout.roads[0].z).toBe(a.layout.roads[0].z)
    for (const z of [row, row + 1]) {
      expect(kind(a, edge, z)).toBe('road')
      expect(kind(b, -edge, z)).toBe('road')
    }
  })

  it('links the rows with a road along the edge of the plates', () => {
    const { neighbourhoods } = worldLayout(hosts)
    // Two plates, one above the other, in the same column.
    const top = neighbourhoods[0]
    const below = neighbourhoods.find(
      (n) =>
        n.z > top.z &&
        n.x - n.layout.halfWidth === top.x - top.layout.halfWidth,
    )!
    const roadsAt = (n: (typeof neighbourhoods)[number]) =>
      n.layout.tiles
        .filter(
          (t) =>
            t.x === Math.round(-n.layout.halfWidth + 0.5) + 2 &&
            t.kind === 'road',
        )
        .map((t) => t.z + n.z)
    const joined = [...roadsAt(top), ...roadsAt(below)].sort((p, q) => p - q)
    // One unbroken line of tiles from the first road to the second one.
    const span = joined[joined.length - 1] - joined[0]
    expect(joined.length).toBeGreaterThan(top.layout.halfDepth)
    expect(new Set(joined).size).toBe(joined.length)
    expect(span).toBeGreaterThanOrEqual(joined.length - 1)
    for (let i = 1; i < joined.length; i++) {
      expect(joined[i] - joined[i - 1]).toBeLessThanOrEqual(1 + 1e-9)
    }
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
        const reach = a.height * Math.sqrt(3) + 2 * HALF_SCREEN_WIDTH
        expect(
          sideways >= 2 * HALF_SCREEN_WIDTH + 1 || depth <= 0 || depth >= reach,
        ).toBe(true)
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
