import { describe, expect, it } from 'vitest'
import { carPoint, roadZ } from '../../../src/city/layout'

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
