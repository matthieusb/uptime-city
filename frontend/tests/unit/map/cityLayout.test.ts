import { describe, expect, it } from 'vitest'
import { BIOMES } from '../../../src/city/biomes'
import {
  BUILDING_WIDTH,
  MAX_BUILDING_WIDTH,
  buildingWidth,
  buildingHeight,
  carPoint,
  cityLayout,
  floorBase,
  floorHeight,
  FLOOR_HEIGHT,
  GROUND_HEIGHT,
  roadZ,
  serviceLabelSides,
  type CityLayout,
  type Lot,
  type Tile,
} from '../../../src/city/layout'

// Hosts with 0 to 4 services, and every seventh one with many.
const ids = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: `host-${i}`,
    services: i % 7 === 6 ? 18 : i % 5,
  }))

// Whether an object standing at (x, z) could cover part of a building, seen
// from the isometric camera looking along the (-1, -1) diagonal.
function hides(
  object: { x: number; z: number; height: number; radius: number },
  lot: Lot,
) {
  const half = lot.width / Math.SQRT2
  const sideways = Math.abs(object.x - object.z - (lot.x - lot.z)) / Math.SQRT2
  const inFront = (object.x + object.z - (lot.x + lot.z)) / Math.SQRT2
  return (
    sideways < half + object.radius &&
    inFront > -object.radius &&
    inFront < object.height * Math.sqrt(3) + half + object.radius
  )
}

function tileMap(layout: CityLayout) {
  const tiles = new Map<string, Tile>()
  for (const tile of layout.tiles) tiles.set(`${tile.x},${tile.z}`, tile)
  return (x: number, z: number) =>
    tiles.get(`${Math.round(x)},${Math.round(z)}`)
}

describe('floors', () => {
  it('stacks one floor per service on a taller ground floor', () => {
    expect(floorBase(0)).toBe(0)
    expect(floorHeight(0)).toBe(GROUND_HEIGHT)
    expect(GROUND_HEIGHT).toBeGreaterThan(FLOOR_HEIGHT)
    expect(floorBase(1)).toBe(GROUND_HEIGHT)
    expect(floorHeight(1)).toBe(FLOOR_HEIGHT)
    expect(floorBase(3)).toBeCloseTo(GROUND_HEIGHT + 2 * FLOOR_HEIGHT)
    expect(buildingHeight(3)).toBeCloseTo(GROUND_HEIGHT + 2 * FLOOR_HEIGHT)
  })

  it('still builds a ground floor for a host without services', () => {
    expect(buildingHeight(1)).toBe(GROUND_HEIGHT)
  })
})

describe('cityLayout', () => {
  it('places one building per host, each on its own lot', () => {
    const { lots } = cityLayout(ids(7))
    expect(lots.map((l) => l.id)).toEqual(ids(7).map((h) => h.id))
    expect(new Set(lots.map((l) => `${l.x},${l.z}`)).size).toBe(7)
  })

  it('gives a building one floor per service above its ground floor', () => {
    const { lots } = cityLayout([
      { id: 'lone', services: 0 },
      { id: 'busy', services: 4 },
    ])
    expect(lots.map((l) => l.floors)).toEqual([1, 5])
    expect(lots.map((l) => l.height)).toEqual([
      buildingHeight(1),
      buildingHeight(5),
    ])
  })

  it('is the same for the same endpoints', () => {
    expect(cityLayout(ids(9))).toEqual(cityLayout(ids(9)))
  })

  it.each([1, 2, 5, 7, 8, 9, 13, 25, 40])(
    'never hides a building behind another with %i hosts',
    (n) => {
      const { lots } = cityLayout(ids(n))
      for (const a of lots) {
        for (const b of lots) {
          if (a === b) continue
          // How far a stands in front of b, and the distance up to which a
          // hides what is behind it.
          const sideways = Math.abs(a.x - b.x - (a.z - b.z)) / Math.SQRT2
          const depth = (a.x - b.x + (a.z - b.z)) / Math.SQRT2
          const halves = (a.width + b.width) / Math.SQRT2
          const reach = a.height * Math.sqrt(3) + halves
          expect(sideways >= halves + 1 || depth <= 0 || depth >= reach).toBe(
            true,
          )
        }
      }
    },
  )

  it('moves the next road further inland behind very tall buildings', () => {
    const tall = Array.from({ length: 9 }, (_, i) => ({
      id: `tower-${i}`,
      services: 30,
    }))
    const low = tall.map((h) => ({ ...h, services: 0 }))
    const gap = (layout: CityLayout) => layout.roads[0].z - layout.roads[1].z
    expect(gap(cityLayout(tall))).toBeGreaterThan(gap(cityLayout(low)))
  })

  it.each([7, 13])(
    'never hides a building behind trees, parasols or hills (%i hosts)',
    (n) => {
      const layout = cityLayout(ids(n))
      const objects = [
        ...layout.trees.map((t) => ({ ...t, radius: 0.45 * t.scale })),
        ...layout.umbrellas.map((u) => ({ ...u, height: 1.3, radius: 0.55 })),
        ...layout.tiles
          .filter((t) => t.kind === 'hill')
          .map((t) => ({ ...t, height: t.top, radius: 0.71 })),
      ]
      for (const lot of layout.lots) {
        for (const object of objects) expect(hides(object, lot)).toBe(false)
      }
    },
  )

  it('lines the buildings along a road, on paved lots', () => {
    const layout = cityLayout(ids(13))
    const tileAt = tileMap(layout)
    expect(layout.roads.length).toBe(3)
    for (const lot of layout.lots) {
      const distances = layout.roads.map((r) =>
        Math.abs(lot.z - roadZ(r, lot.x)),
      )
      const nearest = Math.min(...distances)
      expect(nearest).toBeGreaterThan(2.5)
      expect(nearest).toBeLessThan(lot.width / 2 + 2.5)
      for (const [dx, dz] of [
        [0, 0],
        [0.9, 0.9],
        [-0.9, 0.9],
        [0.9, -0.9],
        [-0.9, -0.9],
      ]) {
        expect(tileAt(lot.x + dx, lot.z + dz)?.kind).toBe('plaza')
      }
    }
  })

  it('has the sea and a beach in front of a coastal town, and hills behind', () => {
    const layout = cityLayout(ids(7), { main: 'coastal' })
    const zs = layout.lots.map((l) => l.z)
    const kinds = (kind: Tile['kind']) =>
      layout.tiles.filter((t) => t.kind === kind)
    expect(kinds('water').length).toBeGreaterThan(0)
    expect(kinds('sand').length).toBeGreaterThan(0)
    expect(kinds('hill').length).toBeGreaterThan(0)
    for (const tile of [...kinds('water'), ...kinds('shallow')]) {
      expect(tile.z).toBeGreaterThan(Math.max(...zs) + 3)
    }
    for (const tile of kinds('hill')) {
      expect(tile.z).toBeLessThan(Math.min(...zs) - 3)
    }
    expect(layout.pier.length).toBeGreaterThan(0)
    expect(layout.boats.length).toBeGreaterThan(0)
  })

  it('mixes parks of several kinds, shapes and sizes', () => {
    const layout = cityLayout(ids(7), { main: 'coastal' })
    expect(
      new Set(layout.patches.map((p) => p.kind)).size,
    ).toBeGreaterThanOrEqual(3)
    expect(
      new Set(layout.patches.map((p) => p.tiles)).size,
    ).toBeGreaterThanOrEqual(4)
    expect(layout.tiles.some((t) => t.kind === 'pond')).toBe(true)
    expect(layout.flowers.length).toBeGreaterThan(0)
    expect(new Set(layout.trees.map((t) => t.kind))).toEqual(
      new Set(['oak', 'pine', 'fruit', 'palm']),
    )
  })

  it('plants trees on land only, never on roads or lots', () => {
    const layout = cityLayout(ids(7))
    const tileAt = tileMap(layout)
    expect(layout.trees.length).toBeGreaterThan(0)
    for (const tree of layout.trees) {
      expect(['grass', 'hill', 'sand', 'snow']).toContain(
        tileAt(tree.x, tree.z)?.kind,
      )
      expect(Math.abs(tree.x)).toBeLessThanOrEqual(layout.halfWidth)
      expect(Math.abs(tree.z)).toBeLessThanOrEqual(layout.halfDepth)
    }
  })

  it('still lays out an empty city', () => {
    const layout = cityLayout([])
    expect(layout.lots).toEqual([])
    expect(layout.roads.length).toBe(1)
    expect(layout.halfWidth).toBeGreaterThan(0)
    expect(layout.halfDepth).toBeGreaterThan(0)
  })
})

describe('decoration and biomes', () => {
  const town = [
    { id: 'a', services: 2 },
    { id: 'a:decor-0', services: 0, decor: 'supermarket' as const },
    { id: 'a:decor-1', services: 0, decor: 'parking' as const },
    { id: 'a:decor-2', services: 0, decor: 'houses' as const },
  ]

  it('lays out decoration lots next to the monitored buildings', () => {
    const { lots } = cityLayout(town)
    expect(lots.map((l) => l.decor)).toEqual([
      undefined,
      'supermarket',
      'parking',
      'houses',
    ])
    for (const lot of lots.filter((l) => l.decor)) {
      expect(lot.floors).toBe(0)
      expect(lot.height).toBeGreaterThan(0)
    }
  })

  it('never hides a building behind a decoration', () => {
    const { lots } = cityLayout(town)
    for (const a of lots) {
      for (const b of lots) {
        if (a === b) continue
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

  it('keeps the ground compact', () => {
    for (const main of BIOMES) {
      const layout = cityLayout(town, { main })
      expect(layout.halfDepth).toBeLessThanOrEqual(15)
      expect(layout.tiles.length).toBeLessThanOrEqual(1100)
    }
  })

  it('has few trees and ponds besides the monitored buildings', () => {
    for (const main of BIOMES) {
      const layout = cityLayout(town, { main })
      const ponds = layout.tiles.filter((t) => t.kind === 'pond')
      expect(ponds.length / layout.tiles.length).toBeLessThan(0.05)
      expect(layout.trees.length / layout.tiles.length).toBeLessThan(0.17)
    }
  })

  it('looks the same on every call', () => {
    expect(cityLayout(town, { main: 'mountain' })).toEqual(
      cityLayout(town, { main: 'mountain' }),
    )
  })
})

describe('carPoint', () => {
  const road = {
    z: 2,
    amplitude: 1.2,
    phase: 0.5,
    xMin: -20,
    xMax: 20,
  }

  it('drives down one lane and back up the other', () => {
    const lanes = new Set<number>()
    for (let t = 0; t < 1; t += 0.005) {
      const { x, z } = carPoint(road, t)
      expect(x).toBeGreaterThanOrEqual(road.xMin)
      expect(x).toBeLessThanOrEqual(road.xMax)
      const offset = z - roadZ(road, x)
      expect(Math.abs(offset)).toBeLessThan(0.5)
      lanes.add(Math.sign(offset))
    }
    expect(lanes).toEqual(new Set([1, -1]))
  })

  it('wraps around', () => {
    expect(carPoint(road, 1.25)).toEqual(carPoint(road, 0.25))
  })
})

describe('serviceLabelSides', () => {
  // A lot standing `column` tiles to the right of the origin on screen, at
  // the same depth.
  const lot = (id: string, column: number, floors: number): Lot => ({
    id,
    x: (column * Math.SQRT2) / 2,
    z: (-column * Math.SQRT2) / 2,
    floors,
    height: buildingHeight(floors),
    width: BUILDING_WIDTH,
  })

  it('puts the labels on the right of a lone building', () => {
    expect(serviceLabelSides([lot('a', 0, 4)]).get('a')).toBe('right')
  })

  it('puts the labels on the side without a building in the way', () => {
    const right = serviceLabelSides([lot('a', 0, 4), lot('b', 6, 6)])
    expect(right.get('a')).toBe('left')
    const left = serviceLabelSides([lot('a', 0, 4), lot('b', -6, 6)])
    expect(left.get('a')).toBe('right')
  })

  it('ignores a building too low to be in the way', () => {
    // Its roof is below the labels of every floor.
    const low = { ...lot('b', 6, 0), height: 0.6 }
    const sides = serviceLabelSides([lot('a', 0, 6), low])
    expect(sides.get('a')).toBe('right')
  })

  it('ignores a building too far to be reached', () => {
    expect(serviceLabelSides([lot('a', 0, 4), lot('b', 60, 6)]).get('a')).toBe(
      'right',
    )
  })
})

describe('building width', () => {
  it('grows with the number of services, up to a maximum', () => {
    expect(buildingWidth(0)).toBe(BUILDING_WIDTH)
    expect(buildingWidth(3)).toBeGreaterThan(buildingWidth(1))
    expect(buildingWidth(50)).toBe(MAX_BUILDING_WIDTH)
  })

  it('gains more every 5 services', () => {
    const step = buildingWidth(5) - buildingWidth(4)
    expect(step).toBeGreaterThan(buildingWidth(4) - buildingWidth(3))
    expect(buildingWidth(10) - buildingWidth(9)).toBeCloseTo(step)
  })

  it('gives each lot the width of its services', () => {
    const { lots } = cityLayout([
      { id: 'a', services: 0 },
      { id: 'b', services: 4 },
    ])
    expect(lots[1].width).toBeGreaterThan(lots[0].width)
    expect(lots[0].width).toBe(BUILDING_WIDTH)
  })
})
