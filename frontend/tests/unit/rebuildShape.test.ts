import { describe, expect, it } from 'vitest'
import {
  builtHeight,
  craneLinger,
  DISMANTLE_S,
  craneSpot,
  floorBuilt,
  jibAngle,
  scaffoldShown,
} from '../../src/city/effects/rebuildShape'
import { buildingHeight } from '../../src/city/layout'

describe('floorBuilt', () => {
  it('builds the floors one after the other from the ground', () => {
    expect(floorBuilt(0, 0, 4)).toBe(0)
    expect(floorBuilt(0.125, 0, 4)).toBeCloseTo(0.5)
    expect(floorBuilt(0.125, 1, 4)).toBe(0)
    expect(floorBuilt(1, 3, 4)).toBe(1)
  })

  it('reaches the whole building at the end', () => {
    expect(builtHeight(0, 4)).toBe(0)
    expect(builtHeight(1, 4)).toBeCloseTo(buildingHeight(4))
  })
})

describe('scaffoldShown', () => {
  it('goes up level by level with the building', () => {
    expect(scaffoldShown(0, 0, 4, 7)).toBe(true)
    expect(scaffoldShown(0, 1, 4, 7)).toBe(false)
    expect(scaffoldShown(0.1, 1, 4, 7)).toBe(true)
    expect(scaffoldShown(0.1, 2, 4, 7)).toBe(false)
    for (const floor of [0, 1, 2, 3])
      expect(scaffoldShown(0.99, floor, 4, 7)).toBe(true)
  })

  it('comes down from the top once the building is done', () => {
    const at = (after: number) =>
      [0, 1, 2, 3].map((floor) => scaffoldShown(1 + after / 7, floor, 4, 7))
    expect(at(0)).toEqual([true, true, true, true])
    expect(at(DISMANTLE_S * 0.3)).toEqual([true, true, true, false])
    expect(at(DISMANTLE_S * 0.6)).toEqual([true, true, false, false])
    expect(at(DISMANTLE_S)).toEqual([false, false, false, false])
  })
})

describe('craneLinger', () => {
  it('keeps the crane 2 to 4 seconds more, the same for a building', () => {
    for (const id of ['a', 'b', 'c', 'd']) {
      expect(craneLinger(id)).toBeGreaterThanOrEqual(2)
      expect(craneLinger(id)).toBeLessThanOrEqual(4)
    }
    expect(craneLinger('a')).toBe(craneLinger('a'))
  })
})

describe('crane', () => {
  it('stands beside the building, always at the same place', () => {
    const spot = craneSpot('a', 4)
    expect(Math.abs(spot.x)).toBeGreaterThan(2)
    expect(craneSpot('a', 4)).toEqual(spot)
  })

  it('swings its jib smoothly and differently for each building', () => {
    expect(Math.abs(jibAngle('a', 1.01) - jibAngle('a', 1))).toBeLessThan(0.1)
    expect(jibAngle('a', 3)).not.toBe(jibAngle('b', 3))
  })
})
