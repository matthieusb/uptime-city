import { describe, expect, it } from 'vitest'
import { nukedLayout, worldLayout } from '../../../src/city/world'
import { hosts } from './helpers'

describe('nukedLayout', () => {
  const plate = worldLayout(hosts).neighbourhoods[0].layout
  const nuked = nukedLayout(plate)

  it('keeps the ground and the monitored buildings', () => {
    expect(nuked.halfWidth).toBe(plate.halfWidth)
    expect(nuked.halfDepth).toBe(plate.halfDepth)
    expect(nuked.tiles.length).toBe(plate.tiles.length)
    expect(nuked.lots.map((lot) => lot.id)).toEqual(
      plate.lots.filter((lot) => !lot.decor).map((lot) => lot.id),
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
    for (const tile of craters) {
      for (const lot of nuked.lots) {
        expect(Math.hypot(tile.x - lot.x, tile.z - lot.z)).toBeGreaterThan(2.5)
      }
    }
  })

  it('leaves the original layout alone', () => {
    expect(plate.tiles.some((t) => t.kind === 'crater')).toBe(false)
    expect(plate.trees.length).toBeGreaterThan(0)
  })
})
