import { afterEach, describe, expect, it } from 'vitest'
import { BIOMES } from '../../../src/city/biomes'
import { hides, PLAZA_MARGIN } from '../../../src/city/layout'
import {
  MONUMENTS,
  SIZES,
  findMonuments,
  monumentBoxes,
  monumentChance,
  sizeClass,
  solids,
  type MonumentKind,
} from '../../../src/city/monuments'
import { setWorldSeed } from '../../../src/city/seed'
import {
  nukedLayout,
  worldLayout,
  type Neighbourhood,
  type NeighbourhoodSpec,
  type World,
} from '../../../src/city/world'

// A physical host, with a building for itself and one per vm-host.
const spec = (id: string, ...vms: number[]): NeighbourhoodSpec => ({
  id,
  buildings: [
    { id, services: 2 },
    ...vms.map((services, i) => ({ id: `${id}-vm${i}`, services })),
  ],
})

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
const medium = [spec('a', 4, 4), spec('b', 3), spec('c'), spec('d', 5, 5, 5)]

const SEEDS = ['', 'one', 'two', 'three', 'four', 'five']
const worlds = (specs: NeighbourhoodSpec[]) =>
  SEEDS.map((seed) => {
    setWorldSeed(seed)
    return worldLayout(specs)
  })

afterEach(() => setWorldSeed(''))

const area = (n: Neighbourhood) => 4 * n.layout.halfWidth * n.layout.halfDepth
const plates = (w: World) => [...w.neighbourhoods, ...w.wilds]
const biggestOf = (w: World) =>
  plates(w).reduce((best, n) => (area(n) > area(best) ? n : best))
const monumentsOf = (n: Neighbourhood) =>
  n.layout.structures.filter((s) => s.kind === 'monument')

describe('the monuments', () => {
  const kinds = Object.keys(MONUMENTS) as MonumentKind[]

  it('include every one that was asked for', () => {
    for (const kind of [
      'eiffel-tower',
      'montparnasse-tower',
      'sydney-opera',
      'one-world-trade-center',
      'washington-monument',
      'us-congress',
      'vatican-square',
      'bellecour-square',
      'statue-of-liberty',
      'big-ben',
      'pisa-tower',
      'arc-de-triomphe',
      'brandenburg-gate',
      'atomium',
      'space-needle',
      'tokyo-tower',
      'fourviere-basilica',
      'tower-bridge',
      'petronas-towers',
      'taj-mahal',
      'sagrada-familia',
      'colosseum',
      'pyramids',
      'parthenon',
      'red-square',
      'stonehenge',
      'mont-saint-michel',
      'burj-al-arab',
      'christ-the-redeemer',
      'mount-rushmore',
      'mount-fuji',
    ]) {
      expect(kinds, kind).toContain(kind)
    }
  })

  it('each belong to at least one biome, and every biome has some', () => {
    for (const kind of kinds) {
      expect(MONUMENTS[kind].biomes.length, kind).toBeGreaterThan(0)
    }
    for (const biome of BIOMES) {
      expect(
        kinds.filter((k) => MONUMENTS[k].biomes.includes(biome)).length,
        biome,
      ).toBeGreaterThan(0)
    }
  })

  it('stand on a footprint that grows with their size', () => {
    const footprint = (size: (typeof SIZES)[number]) =>
      kinds
        .filter((k) => MONUMENTS[k].size === size)
        .map((k) => MONUMENTS[k].footprint)
    expect(SIZES).toEqual(['small', 'medium', 'big'])
    for (const size of SIZES) {
      expect(footprint(size).length, size).toBeGreaterThan(2)
      expect(new Set(footprint(size)).size, size).toBe(1)
    }
    const [small, medium, big] = SIZES.map((s) => footprint(s)[0])
    expect(small).toBeLessThan(medium)
    expect(medium).toBeLessThan(big)
    expect(small % 2).toBe(1)
    expect(medium % 2).toBe(1)
    expect(big % 2).toBe(1)
  })
})

describe('the size of a monument on a tile', () => {
  it('grows with the area of the tile', () => {
    const order = { small: 0, medium: 1, big: 2 }
    let last = -1
    for (let a = 100; a <= 8000; a += 100) {
      const now = order[sizeClass(a)]
      expect(now).toBeGreaterThanOrEqual(last)
      last = now
    }
    expect(sizeClass(100)).toBe('small')
    expect(sizeClass(8000)).toBe('big')
  })

  it('is the biggest one, always, on the biggest tile', () => {
    expect(monumentChance(5000, 5000)).toBe(1)
  })

  it('is less likely the smaller the tile, down to nothing', () => {
    const chances = [0, 500, 1000, 2000, 3000, 4000, 5000].map((a) =>
      monumentChance(a, 5000),
    )
    for (let k = 1; k < chances.length; k++) {
      expect(chances[k]).toBeGreaterThan(chances[k - 1] - 1e-12)
    }
    expect(chances[0]).toBe(0)
    // Even a small tile has a fair chance, and only the biggest one is sure.
    expect(chances[1]).toBeGreaterThan(0.5)
    expect(chances[1]).toBeLessThan(chances[4])
    expect(chances[4]).toBeLessThan(1)
    expect(chances[chances.length - 1]).toBe(1)
  })
})

describe('the monuments of a world', () => {
  const all = [...worlds(homelab), ...worlds(medium)]

  it('are at most one per tile, and two on the biggest tile at most', () => {
    for (const w of all) {
      const biggest = biggestOf(w)
      for (const n of plates(w)) {
        expect(monumentsOf(n).length, n.id).toBeLessThanOrEqual(
          n === biggest ? 2 : 1,
        )
      }
    }
  })

  it('include one on the biggest tile, always, and sometimes a second', () => {
    for (const w of all) {
      const biggest = biggestOf(w)
      expect(monumentsOf(biggest).length, biggest.id).toBeGreaterThanOrEqual(1)
    }
    const counts = all.map((w) => monumentsOf(biggestOf(w)).length)
    expect(counts.filter((c) => c === 2).length).toBeGreaterThan(0)
    expect(counts.filter((c) => c === 1).length).toBeGreaterThan(0)
  })

  it('are each there once at most on the whole map', () => {
    for (const w of all) {
      const kinds = findMonuments(w).map((m) => m.kind)
      expect(new Set(kinds).size, kinds.join(', ')).toBe(kinds.length)
    }
  })

  it('run out with the kinds, on a map with more tiles than monuments', () => {
    const many = Array.from({ length: 45 }, (_, i) => spec(`host${i}`, 1))
    const found = findMonuments(worldLayout(many)).map((m) => m.kind)
    expect(found.length).toBeGreaterThan(5)
    expect(found.length).toBeLessThanOrEqual(Object.keys(MONUMENTS).length)
    expect(new Set(found).size).toBe(found.length)
  })

  it('are not on every tile, and wild tiles can have one', () => {
    const counts = all.flatMap((w) =>
      plates(w).map((n) => monumentsOf(n).length),
    )
    expect(counts.filter((c) => c === 0).length).toBeGreaterThan(0)
    expect(counts.filter((c) => c >= 1).length).toBeGreaterThan(all.length)
    const wild = all.flatMap((w) => w.wilds.flatMap((n) => monumentsOf(n)))
    expect(wild.length).toBeGreaterThan(0)
  })

  it('come the less often the smaller the tile', () => {
    const rows = worlds(homelab).flatMap((w) =>
      plates(w).map((n) => ({ a: area(n), has: monumentsOf(n).length })),
    )
    rows.sort((p, q) => p.a - q.a)
    const third = Math.floor(rows.length / 3)
    const share = (part: typeof rows) =>
      part.filter((r) => r.has > 0).length / part.length
    const small = share(rows.slice(0, third))
    const middle = share(rows.slice(third, 2 * third))
    const big = share(rows.slice(2 * third))
    expect(small).toBeLessThan(middle + 1e-9)
    expect(middle).toBeLessThan(big + 1e-9)
    expect(small).toBeLessThan(big)
  })

  it('are no bigger than what the size of their tile allows', () => {
    const order = { small: 0, medium: 1, big: 2 }
    for (const w of all) {
      for (const n of plates(w)) {
        for (const s of monumentsOf(n)) {
          const size = MONUMENTS[s.monument!].size
          expect(order[size]).toBeLessThanOrEqual(order[sizeClass(area(n))])
        }
      }
    }
  })

  it('are of a kind that goes with the biome of the ground under them', () => {
    for (const w of all) {
      for (const n of plates(w)) {
        for (const s of monumentsOf(n)) {
          const { biomes } = MONUMENTS[s.monument!]
          const under = n.layout.tiles.filter(
            (t) =>
              Math.abs(t.x - s.x) < s.width / 2 &&
              Math.abs(t.z - s.z) < s.depth / 2,
          )
          expect(under.length).toBe(s.width * s.depth)
          expect(
            under.filter((t) => !biomes.includes(t.biome)),
            `${s.monument} on ${n.id}`,
          ).toEqual([])
        }
      }
    }
  })

  it('stand on their tile, on the footprint of their size', () => {
    for (const w of all) {
      for (const n of plates(w)) {
        for (const s of monumentsOf(n)) {
          const spec = MONUMENTS[s.monument!]
          expect([s.width, s.depth]).toEqual([spec.footprint, spec.footprint])
          expect(Math.abs(s.x) + s.width / 2).toBeLessThanOrEqual(
            n.layout.halfWidth,
          )
          expect(Math.abs(s.z) + s.depth / 2).toBeLessThanOrEqual(
            n.layout.halfDepth,
          )
        }
      }
    }
  })

  it('have no road, roundabout, water or rail under them, nor a road right by', () => {
    const water = new Set(['water', 'shallow', 'pond', 'ice'])
    const ways = new Set(['road', 'island', 'track'])
    for (const w of all) {
      for (const n of plates(w)) {
        for (const s of monumentsOf(n)) {
          const within = (margin: number) => (t: { x: number; z: number }) =>
            Math.abs(t.x - s.x) < s.width / 2 + margin &&
            Math.abs(t.z - s.z) < s.depth / 2 + margin
          const under = n.layout.tiles.filter(
            (t) => (water.has(t.kind) || ways.has(t.kind)) && within(0)(t),
          )
          expect(under, `${s.monument} on ${n.id}`).toEqual([])
          // Water may lap at the foot of a monument, a road keeps a tile away.
          const near = n.layout.tiles.filter(
            (t) => ways.has(t.kind) && within(1)(t),
          )
          expect(near, `${s.monument} on ${n.id}`).toEqual([])
        }
      }
    }
  })

  it('never cover a building, a structure, the airport or a tree', () => {
    for (const w of all) {
      for (const n of plates(w)) {
        for (const s of monumentsOf(n)) {
          for (const lot of n.layout.lots) {
            const half = lot.width / 2 + PLAZA_MARGIN
            expect(
              Math.abs(lot.x - s.x) >= s.width / 2 + half ||
                Math.abs(lot.z - s.z) >= s.depth / 2 + half,
              lot.id,
            ).toBe(true)
          }
          for (const other of n.layout.structures) {
            if (other === s) continue
            expect(
              Math.abs(other.x - s.x) >= (other.width + s.width) / 2 ||
                Math.abs(other.z - s.z) >= (other.depth + s.depth) / 2,
              other.kind,
            ).toBe(true)
          }
          for (const tree of n.layout.trees) {
            expect(
              Math.abs(tree.x - s.x) >= s.width / 2 ||
                Math.abs(tree.z - s.z) >= s.depth / 2,
            ).toBe(true)
          }
        }
      }
    }
  })

  it('hide no monitored building on screen', () => {
    for (const w of all) {
      const lots = w.neighbourhoods.flatMap((n) =>
        n.layout.lots.map((l) => ({
          x: n.x + l.x,
          z: n.z + l.z,
          width: l.width,
        })),
      )
      for (const n of plates(w)) {
        for (const s of monumentsOf(n)) {
          for (const o of solids(s.monument!)) {
            const object = { ...o, x: n.x + s.x + o.x, z: n.z + s.z + o.z }
            expect(lots.filter((lot) => hides(object, lot))).toEqual([])
          }
        }
      }
    }
  })

  it('leave every monitored building and the airport as they were', () => {
    for (const w of worlds(homelab)) {
      const ids = w.neighbourhoods.flatMap((n) =>
        n.layout.lots.map((l) => l.id),
      )
      for (const host of homelab) {
        for (const b of host.buildings) expect(ids).toContain(b.id)
      }
      expect(
        w.neighbourhoods.filter((n) =>
          n.layout.structures.some((s) => s.kind === 'airport'),
        ),
      ).toHaveLength(1)
    }
  })

  it('are found by findMonuments, with their kind', () => {
    for (const w of all) {
      const found = findMonuments(w)
      expect(found.length).toBe(
        plates(w).reduce((sum, n) => sum + monumentsOf(n).length, 0),
      )
      for (const m of found) expect(m.kind).toBe(m.structure.monument)
    }
  })

  it('go with the tile when it is nuked', () => {
    const [w] = worlds(homelab)
    const n = plates(w).find((p) => monumentsOf(p).length > 0)!
    expect(nukedLayout(n.layout).structures).toEqual([])
  })

  it('are laid the same for the same seed, and not for another', () => {
    const lay = (seed: string) => {
      setWorldSeed(seed)
      return JSON.stringify(
        findMonuments(worldLayout(homelab)).map((m) => [
          m.kind,
          m.structure.x,
          m.structure.z,
        ]),
      )
    }
    expect(lay('one')).toBe(lay('one'))
    expect(lay('one')).not.toBe(lay('two'))
  })

  it('are left out when there is no tile big enough', () => {
    const tiny = worldLayout([spec('a')])
    for (const n of plates(tiny)) {
      for (const s of monumentsOf(n)) {
        expect(MONUMENTS[s.monument!].footprint).toBeLessThanOrEqual(
          Math.min(2 * n.layout.halfWidth, 2 * n.layout.halfDepth),
        )
      }
    }
    expect(worldLayout([]).neighbourhoods).toHaveLength(0)
  })
})

describe('the drawing', () => {
  it('stays within the footprint, above the ground, with plenty of boxes', () => {
    const offenders: Record<string, unknown[]> = {}
    for (const kind of Object.keys(MONUMENTS) as MonumentKind[]) {
      const { footprint } = MONUMENTS[kind]
      const s = {
        x: 3,
        y: 0.09,
        z: -5,
        width: footprint,
        depth: footprint,
        monument: kind,
      }
      const boxes: {
        x: number
        y: number
        z: number
        sx: number
        sy: number
        sz: number
      }[] = []
      monumentBoxes(s, (_, b) => boxes.push(b))
      expect(boxes.length, kind).toBeGreaterThan(8)
      const half = footprint / 2 + 1e-6
      // Every box that goes out of the footprint or under the ground, so one run lists them all.
      const out = boxes
        .filter(
          (b) =>
            Math.abs(b.x - s.x) + b.sx / 2 > half ||
            Math.abs(b.z - s.z) + b.sz / 2 > half ||
            b.y - b.sy / 2 < s.y - 1e-6,
        )
        .map((b) => ({
          x: b.x - s.x,
          z: b.z - s.z,
          sx: b.sx,
          sz: b.sz,
          bottom: b.y - b.sy / 2 - s.y,
        }))
      if (out.length > 0) offenders[kind] = out
    }
    expect(offenders).toEqual({})
  })

  it('rises as high as the monument says, no higher', () => {
    for (const kind of Object.keys(MONUMENTS) as MonumentKind[]) {
      const { footprint, height } = MONUMENTS[kind]
      const s = {
        x: 0,
        y: 0,
        z: 0,
        width: footprint,
        depth: footprint,
        monument: kind,
      }
      let top = 0
      monumentBoxes(s, (_, b) => (top = Math.max(top, b.y + b.sy / 2)))
      expect(top, kind).toBeLessThanOrEqual(height + 1e-6)
      expect(top, kind).toBeGreaterThan(height * 0.8)
    }
  })
})
