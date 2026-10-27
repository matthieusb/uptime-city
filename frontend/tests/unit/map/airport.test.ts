import { describe, expect, it } from 'vitest'
import {
  EDGE,
  MAX_LENGTH,
  MIN_LENGTH,
  airportBoxes,
  airportLayout,
  findAirport,
  runwayLength,
  solids,
  standCount,
  turned,
  type BoxOut,
} from '../../../src/city/airport'
import { hides, PLAZA_MARGIN } from '../../../src/city/layout'
import { worldLayout, type NeighbourhoodSpec } from '../../../src/city/world'

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

const world = worldLayout(homelab)
const biggestOf = (w: typeof world) =>
  w.neighbourhoods.reduce((best, neighbourhood) =>
    neighbourhood.layout.halfWidth * neighbourhood.layout.halfDepth >
    best.layout.halfWidth * best.layout.halfDepth
      ? neighbourhood
      : best,
  )

describe('runwayLength', () => {
  it('grows with the size of the tile, within limits', () => {
    const lengths = [5, 15, 20, 30, 40, 60].map((h) => runwayLength(h, h))
    for (let k = 1; k < lengths.length; k++) {
      expect(lengths[k]).toBeGreaterThanOrEqual(lengths[k - 1])
    }
    expect(lengths[0]).toBe(MIN_LENGTH)
    expect(lengths[lengths.length - 1]).toBe(MAX_LENGTH)
    expect(lengths.every((n) => n % 2 === 0)).toBe(true)
  })

  it('gives more stands to a longer runway', () => {
    expect(standCount(MIN_LENGTH)).toBe(2)
    expect(standCount(MAX_LENGTH)).toBeGreaterThan(standCount(MIN_LENGTH))
    expect(airportLayout(MAX_LENGTH).standX).toHaveLength(
      standCount(MAX_LENGTH),
    )
  })
})

describe('the airport of a world', () => {
  const airport = findAirport(world)!

  it('stands on the biggest neighbourhood', () => {
    expect(airport).not.toBeNull()
    expect(airport.plate.id).toBe(biggestOf(world).id)
    expect(
      world.neighbourhoods.filter((neighbourhood) =>
        neighbourhood.layout.structures.some(
          (structure) => structure.kind === 'airport',
        ),
      ),
    ).toHaveLength(1)
  })

  it('is as long as its tile calls for, or shorter if that does not fit', () => {
    const { halfWidth, halfDepth } = airport.plate.layout
    expect(airport.layout.length).toBeLessThanOrEqual(
      runwayLength(halfWidth, halfDepth),
    )
    expect(airport.layout.length).toBeGreaterThanOrEqual(MIN_LENGTH)
  })

  it('is longer on a bigger tile', () => {
    const small = findAirport(worldLayout(medium))
    const big = airport
    if (small)
      expect(big.layout.length).toBeGreaterThanOrEqual(small.layout.length)
    expect(
      runwayLength(
        biggestOf(world).layout.halfWidth,
        biggestOf(world).layout.halfDepth,
      ),
    ).toBeGreaterThanOrEqual(
      runwayLength(
        biggestOf(worldLayout(medium)).layout.halfWidth,
        biggestOf(worldLayout(medium)).layout.halfDepth,
      ),
    )
  })

  it('is on its plate and at least 8 tiles from every edge of the map', () => {
    const { plate, structure: s } = airport
    const { halfWidth, halfDepth } = plate.layout
    expect(Math.abs(s.x) + s.width / 2).toBeLessThanOrEqual(halfWidth)
    expect(Math.abs(s.z) + s.depth / 2).toBeLessThanOrEqual(halfDepth)
    expect(Math.abs(plate.x + s.x) + s.width / 2).toBeLessThanOrEqual(
      world.halfWidth - EDGE,
    )
    expect(Math.abs(plate.z + s.z) + s.depth / 2).toBeLessThanOrEqual(
      world.halfDepth - EDGE,
    )
  })

  it('is as wide as its runway, turned or not', () => {
    const { structure: s, layout } = airport
    const [along, across] =
      airport.turn % 2 === 0 ? [s.width, s.depth] : [s.depth, s.width]
    expect(along).toBe(layout.width)
    expect(across).toBe(layout.depth)
  })

  it('has no road, roundabout, water or rail under it', () => {
    const { plate, structure: s } = airport
    const under = plate.layout.tiles.filter(
      (t) =>
        Math.abs(t.x - s.x) < s.width / 2 && Math.abs(t.z - s.z) < s.depth / 2,
    )
    expect(under.length).toBe(s.width * s.depth)
    const bad = new Set([
      'road',
      'island',
      'water',
      'shallow',
      'pond',
      'ice',
      'track',
    ])
    expect(under.filter((t) => bad.has(t.kind))).toEqual([])
  })

  it('keeps a tile away from the roads', () => {
    const { plate, structure: s } = airport
    const near = plate.layout.tiles.filter(
      (t) =>
        (t.kind === 'road' || t.kind === 'island') &&
        Math.abs(t.x - s.x) < s.width / 2 + 1 &&
        Math.abs(t.z - s.z) < s.depth / 2 + 1,
    )
    expect(near).toEqual([])
  })

  it('never covers a building, nor an other structure', () => {
    const { plate, structure: s } = airport
    for (const lot of plate.layout.lots) {
      const half = lot.width / 2 + PLAZA_MARGIN
      expect(
        Math.abs(lot.x - s.x) >= s.width / 2 + half ||
          Math.abs(lot.z - s.z) >= s.depth / 2 + half,
        lot.id,
      ).toBe(true)
    }
    for (const other of plate.layout.structures) {
      if (other === s) continue
      expect(
        Math.abs(other.x - s.x) >= (other.width + s.width) / 2 ||
          Math.abs(other.z - s.z) >= (other.depth + s.depth) / 2,
        other.kind,
      ).toBe(true)
    }
    for (const tree of plate.layout.trees) {
      expect(
        Math.abs(tree.x - s.x) >= s.width / 2 ||
          Math.abs(tree.z - s.z) >= s.depth / 2,
      ).toBe(true)
    }
  })

  it('hides no building on screen', () => {
    const { plate, structure: s, layout, turn } = airport
    const lots = world.neighbourhoods.flatMap((neighbourhood) =>
      neighbourhood.layout.lots.map((lot) => ({
        x: neighbourhood.x + lot.x,
        z: neighbourhood.z + lot.z,
        width: lot.width,
      })),
    )
    for (const o of solids(layout)) {
      const [dx, dz] = turned(turn, o.x, o.z)
      const object = { ...o, x: plate.x + s.x + dx, z: plate.z + s.z + dz }
      expect(lots.filter((lot) => hides(object, lot))).toEqual([])
    }
  })

  it('leaves every monitored building as it was', () => {
    const ids = (w: typeof world) =>
      w.neighbourhoods.flatMap((neighbourhood) =>
        neighbourhood.layout.lots.map((lot) => lot.id),
      )
    expect(ids(world).length).toBeGreaterThan(0)
    for (const host of homelab) {
      for (const hostSpec of host.buildings)
        expect(ids(world)).toContain(hostSpec.id)
    }
  })

  it('has its ground paved and levelled', () => {
    const { plate, structure: s } = airport
    const tiles = plate.layout.tiles.filter(
      (t) =>
        Math.abs(t.x - s.x) < s.width / 2 && Math.abs(t.z - s.z) < s.depth / 2,
    )
    expect(tiles.filter((t) => t.kind === 'plaza').length).toBeGreaterThan(20)
    expect(tiles.filter((t) => t.kind === 'hill')).toEqual([])
  })

  it('knows how far the edges of the map are along its runway', () => {
    const { reach, turn } = airport
    const along = turn % 2 === 0 ? world.halfWidth : world.halfDepth
    expect(reach.pos + reach.neg).toBeCloseTo(2 * along)
    expect(reach.pos).toBeGreaterThan(EDGE)
    expect(reach.neg).toBeGreaterThan(EDGE)
  })
})

describe('the drawing', () => {
  it('stays within the footprint, whatever the turn', () => {
    for (const length of [14, 24, 40]) {
      for (let turn = 0; turn < 4; turn++) {
        const l = airportLayout(length)
        const [w, d] = turn % 2 === 0 ? [l.width, l.depth] : [l.depth, l.width]
        const s = { x: 3, y: 0.09, z: -5, width: w, depth: d, turn }
        const boxes: BoxOut[] = []
        airportBoxes(s, (_, boxOut) => boxes.push(boxOut))
        expect(boxes.length).toBeGreaterThan(20)
        for (const boxOut of boxes) {
          expect(Math.abs(boxOut.x - s.x) + boxOut.sx / 2).toBeLessThanOrEqual(
            w / 2 + 1e-6,
          )
          expect(Math.abs(boxOut.z - s.z) + boxOut.sz / 2).toBeLessThanOrEqual(
            d / 2 + 1e-6,
          )
          expect(boxOut.y - boxOut.sy / 2).toBeGreaterThanOrEqual(s.y - 1e-6)
        }
      }
    }
  })
})

describe('a world without room for an airport', () => {
  it('has none, and is otherwise the same', () => {
    const tiny = worldLayout([spec('a')])
    expect(findAirport(tiny)).toBeNull()
    expect(tiny.neighbourhoods).toHaveLength(1)
  })

  it('has none without hosts', () => {
    expect(findAirport(worldLayout([]))).toBeNull()
  })
})
