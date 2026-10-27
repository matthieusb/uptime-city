import { describe, expect, it } from 'vitest'
import { BIOMES } from '../../../src/city/biomes'
import {
  buildingHeight,
  cityLayout,
  roadZ,
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

describe('cityLayout', () => {
  it('places one building per host, each on its own lot', () => {
    const { lots } = cityLayout(ids(7))
    expect(lots.map((lot) => lot.id)).toEqual(ids(7).map((h) => h.id))
    expect(new Set(lots.map((lot) => `${lot.x},${lot.z}`)).size).toBe(7)
  })

  it('gives a building one floor per service above its ground floor', () => {
    const { lots } = cityLayout([
      { id: 'lone', services: 0 },
      { id: 'busy', services: 4 },
    ])
    expect(lots.map((lot) => lot.floors)).toEqual([1, 5])
    expect(lots.map((lot) => lot.height)).toEqual([
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
      for (const lot of lots) {
        for (const b of lots) {
          if (lot === b) continue
          // How far a stands in front of b, and the distance up to which a
          // hides what is behind it.
          const sideways = Math.abs(lot.x - b.x - (lot.z - b.z)) / Math.SQRT2
          const depth = (lot.x - b.x + (lot.z - b.z)) / Math.SQRT2
          const halves = (lot.width + b.width) / Math.SQRT2
          const reach = lot.height * Math.sqrt(3) + halves
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
      const distances = layout.roads.map((road) =>
        Math.abs(lot.z - roadZ(road, lot.x)),
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
    const zs = layout.lots.map((lot) => lot.z)
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
      new Set(layout.patches.map((patch) => patch.kind)).size,
    ).toBeGreaterThanOrEqual(3)
    expect(
      new Set(layout.patches.map((patch) => patch.tiles)).size,
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
    expect(lots.map((lot) => lot.decor)).toEqual([
      undefined,
      'supermarket',
      'parking',
      'houses',
    ])
    for (const lot of lots.filter((lot) => lot.decor)) {
      expect(lot.floors).toBe(0)
      expect(lot.height).toBeGreaterThan(0)
    }
  })

  it('never hides a building behind a decoration', () => {
    const { lots } = cityLayout(town)
    for (const lot of lots) {
      for (const b of lots) {
        if (lot === b) continue
        const sideways = Math.abs(lot.x - b.x - (lot.z - b.z)) / Math.SQRT2
        const depth = (lot.x - b.x + (lot.z - b.z)) / Math.SQRT2
        const halves = (lot.width + b.width) / Math.SQRT2
        const reach = lot.height * Math.sqrt(3) + halves
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
