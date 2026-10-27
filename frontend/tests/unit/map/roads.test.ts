import { describe, expect, it } from 'vitest'
import { carPoint, cityLayout, type Tile } from '../../../src/city/layout'
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

// A big homelab, for the network to spread over several rows.
const big = Array.from({ length: 30 }, (_, i) =>
  spec(`host-${i}`, ...Array.from({ length: i % 4 }, (_, n) => (i + n) % 6)),
)

const world = worldLayout(big)
const plates: Neighbourhood[] = [...world.neighbourhoods, ...world.wilds]
// Every tile of the map, by where it stands.
const key = (x: number, z: number) =>
  `${Math.round(2 * x)},${Math.round(2 * z)}`
const ground = new Map<string, Tile>()
for (const neighbourhood of plates) {
  for (const t of neighbourhood.layout.tiles) {
    ground.set(key(neighbourhood.x + t.x, neighbourhood.z + t.z), {
      ...t,
      x: neighbourhood.x + t.x,
      z: neighbourhood.z + t.z,
    })
  }
}
const tiles = [...ground.values()]
// The tile a point stands on: tiles are on whole or half coordinates.
const [fx, fz] = [tiles[0].x, tiles[0].z].map((v) => v - Math.floor(v))
const tileOf = (x: number, z: number) =>
  ground.get(key(Math.round(x - fx) + fx, Math.round(z - fz) + fz))
const kindAt = (x: number, z: number) => ground.get(key(x, z))?.kind
const near = (t: { x: number; z: number }, kind: Tile['kind'], reach = 1) => {
  for (let dx = -reach; dx <= reach; dx++) {
    for (let dz = -reach; dz <= reach; dz++) {
      if ((dx || dz) && kindAt(t.x + dx, t.z + dz) === kind) return true
    }
  }
  return false
}

// Where an object of a plate stands on the map.
const placed = <T extends { x: number; z: number }>(
  neighbourhood: Neighbourhood,
  o: T,
) => ({
  ...o,
  x: o.x + neighbourhood.x,
  z: o.z + neighbourhood.z,
})
const monitored = world.neighbourhoods.flatMap((neighbourhood) =>
  neighbourhood.layout.lots
    .filter((lot) => !lot.decor)
    .map((lot) => placed(neighbourhood, lot)),
)

describe('the roads of the map', () => {
  const horizontal = world.ways.filter((w) => !w.vertical)
  const vertical = world.ways.filter((w) => w.vertical)

  it('runs straight roads along X through several neighbourhoods', () => {
    expect(horizontal.length).toBeGreaterThan(0)
    const crossed = (w: (typeof horizontal)[number]) =>
      world.neighbourhoods.filter(
        (neighbourhood) =>
          Math.abs(w.at - neighbourhood.z) < neighbourhood.layout.halfDepth &&
          w.from < neighbourhood.x + neighbourhood.layout.halfWidth &&
          w.to > neighbourhood.x - neighbourhood.layout.halfWidth,
      ).length
    expect(Math.max(...horizontal.map(crossed))).toBeGreaterThanOrEqual(2)
    // Two tiles wide, all the way.
    for (const w of horizontal) {
      for (let x = w.from + 0.5; x < w.to; x++) {
        for (const z of [w.at - 0.5, w.at + 0.5]) {
          expect(['road', 'island']).toContain(kindAt(x, z))
        }
      }
    }
  })

  it('runs a row road from one edge of the map to the other', () => {
    expect(
      horizontal.some(
        (w) =>
          w.from <= -world.halfWidth + 1e-6 && w.to >= world.halfWidth - 1e-6,
      ),
    ).toBe(true)
  })

  it('links the rows with straight roads along Z', () => {
    expect(vertical.length).toBeGreaterThan(0)
    for (const w of vertical) {
      for (let z = w.from + 0.5; z < w.to; z++) {
        for (const x of [w.at - 0.5, w.at + 0.5]) {
          expect(['road', 'island']).toContain(kindAt(x, z))
        }
      }
      // From one road to another.
      const ends = [w.from, w.to].map((z) =>
        horizontal.some(
          (way) =>
            Math.abs(way.at - z) < 1e-6 && way.from < w.at && way.to > w.at,
        ),
      )
      expect(ends).toEqual([true, true])
    }
  })

  it('puts a roundabout where two roads meet', () => {
    let crossings = 0
    for (const v of vertical) {
      for (const way of horizontal) {
        if (
          way.at < v.from ||
          way.at > v.to ||
          way.from > v.at ||
          way.to < v.at
        ) {
          continue
        }
        crossings++
        expect(
          world.roundabouts.some(
            (r) => Math.abs(r.x - v.at) < 1e-6 && Math.abs(r.z - way.at) < 1e-6,
          ),
        ).toBe(true)
        // An island in the middle, ringed by road.
        for (const [dx, dz] of [
          [-0.5, -0.5],
          [0.5, 0.5],
        ]) {
          expect(kindAt(v.at + dx, way.at + dz)).toBe('island')
        }
        for (const [dx, dz] of [
          [-1.5, -1.5],
          [1.5, 1.5],
          [-2.5, 0.5],
          [0.5, 2.5],
        ]) {
          expect(kindAt(v.at + dx, way.at + dz)).toBe('road')
        }
      }
    }
    expect(crossings).toBeGreaterThan(0)
    expect(world.roundabouts.length).toBe(crossings)
  })

  it('never runs a road over a monitored building', () => {
    for (const lot of monitored) {
      expect(tileOf(lot.x, lot.z)?.kind).toBe('plaza')
      for (const [dx, dz] of [
        [0.9, 0.9],
        [-0.9, -0.9],
      ]) {
        expect(tileOf(lot.x + dx, lot.z + dz)?.kind).toBe('plaza')
      }
    }
  })

  it('grows nothing and builds nothing on the roads', () => {
    for (const neighbourhood of plates) {
      for (const tree of neighbourhood.layout.trees) {
        const t = placed(neighbourhood, tree)
        expect(['road', 'island', 'path']).not.toContain(tileOf(t.x, t.z)?.kind)
      }
      for (const structure of neighbourhood.layout.structures) {
        const c = placed(neighbourhood, structure)
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
            expect(['road', 'island']).not.toContain(kindAt(c.x + dx, c.z + dz))
          }
        }
      }
    }
  })

  it('gives each neighbourhood the pieces of road that cross it, for its traffic', () => {
    for (const neighbourhood of world.neighbourhoods) {
      for (const road of neighbourhood.layout.roads) {
        expect(road.amplitude).toBe(0)
        expect(road.xMax).toBeGreaterThan(road.xMin)
        const [along, across] = road.vertical
          ? [neighbourhood.layout.halfDepth, neighbourhood.layout.halfWidth]
          : [neighbourhood.layout.halfWidth, neighbourhood.layout.halfDepth]
        expect(Math.abs(road.z)).toBeLessThan(across)
        expect(road.xMin).toBeGreaterThanOrEqual(-along - 1e-6)
        expect(road.xMax).toBeLessThanOrEqual(along + 1e-6)
      }
    }
    expect(
      plates.some((neighbourhood) =>
        neighbourhood.layout.roads.some((road) => road.vertical),
      ),
    ).toBe(true)
  })
})

describe('the paths', () => {
  const paths = tiles.filter((t) => t.kind === 'path')

  it('winds narrow paths through the town, with turns', () => {
    expect(paths.length).toBeGreaterThan(20)
    // One tile wide: never a square of path.
    for (const t of paths) {
      expect(
        [
          [1, 0],
          [0, 1],
          [1, 1],
        ].every(([dx, dz]) => kindAt(t.x + dx, t.z + dz) === 'path'),
      ).toBe(false)
    }
    const turns = paths.filter(
      (t) =>
        [-1, 1].some((dx) => kindAt(t.x + dx, t.z) === 'path') &&
        [-1, 1].some((dz) => kindAt(t.x, t.z + dz) === 'path'),
    )
    expect(turns.length).toBeGreaterThan(0)
  })

  it('gathers the houses along the paths', () => {
    const houses = plates.flatMap((neighbourhood) =>
      neighbourhood.layout.structures
        .filter((structure) => structure.kind === 'house')
        .map((structure) => placed(neighbourhood, structure)),
    )
    expect(houses.length).toBeGreaterThan(10)
    const byPath = houses.filter((h) =>
      [-0.5, 0.5].some((dx) =>
        [-0.5, 0.5].some((dz) => near({ x: h.x + dx, z: h.z + dz }, 'path')),
      ),
    )
    expect(byPath.length / houses.length).toBeGreaterThan(0.6)
  })

  it('rarely passes by a monitored building', () => {
    // Next to the paved square of the building.
    const byPath = monitored.filter((lot) => {
      const reach = lot.width / 2 + 0.6 + 1.5
      return paths.some(
        (tile) =>
          Math.abs(tile.x - lot.x) <= reach &&
          Math.abs(tile.z - lot.z) <= reach,
      )
    })
    expect(byPath.length).toBeGreaterThan(0)
    expect(byPath.length / monitored.length).toBeLessThan(0.35)
  })

  it('keeps every monitored building on a road', () => {
    for (const neighbourhood of world.neighbourhoods) {
      for (const lot of neighbourhood.layout.lots.filter((lot) => !lot.decor)) {
        const nearest = Math.min(
          ...neighbourhood.layout.roads
            .filter((road) => !road.vertical)
            .map((road) => Math.abs(lot.z - road.z)),
        )
        expect(nearest).toBeLessThan(lot.width / 2 + 2.5)
      }
    }
  })
})

describe('the roads of a town', () => {
  const town = Array.from({ length: 7 }, (_, i) => ({
    id: `host-${i}`,
    services: i % 5,
  }))

  it('runs straight roads, on the edges of the tiles', () => {
    const layout = cityLayout(town)
    for (const road of layout.roads) {
      expect(road.amplitude).toBe(0)
      expect(Math.abs((road.z % 1) + 0.5) % 1).toBeCloseTo(0)
    }
  })

  it('has paths and houses along them in a city', () => {
    const layout = cityLayout(town, { main: 'city' })
    expect(layout.tiles.some((t) => t.kind === 'path')).toBe(true)
    expect(
      layout.structures.some((structure) => structure.kind === 'house'),
    ).toBe(true)
  })
})

describe('carPoint along Z', () => {
  const road = {
    z: 3,
    amplitude: 0,
    phase: 0,
    xMin: -10,
    xMax: 10,
    vertical: true,
  }

  it('drives along Z on both lanes of a road along Z', () => {
    const lanes = new Set<number>()
    for (let t = 0; t < 1; t += 0.01) {
      const { x, z } = carPoint(road, t)
      expect(z).toBeGreaterThanOrEqual(road.xMin)
      expect(z).toBeLessThanOrEqual(road.xMax)
      expect(Math.abs(x - road.z)).toBeLessThan(0.5)
      lanes.add(Math.sign(x - road.z))
    }
    expect(lanes).toEqual(new Set([1, -1]))
  })

  it('faces the way it drives', () => {
    const { heading } = carPoint(road, 0.25)
    // Heading towards +Z: +X turned by -90° around Y.
    expect(Math.cos(heading)).toBeCloseTo(0)
    expect(-Math.sin(heading)).toBeCloseTo(1)
  })
})
