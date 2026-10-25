import { describe, expect, it } from 'vitest'
import { PRELUDE_S } from '../../src/city/collapse'
import {
  blastCubes,
  blastLight,
  MAX_BLAST_CUBES,
  PUFFS,
  smokeCubes,
  smokeDuration,
  smokeOpacity,
} from '../../src/city/effects/demolitionShape'

describe('blastCubes', () => {
  it('is the same for the same building', () => {
    expect(blastCubes('a', 3.2, 0.5)).toEqual(blastCubes('a', 3.2, 0.5))
  })

  it('goes off at the foot of the building, outside its walls', () => {
    const width = 4
    const cubes = Array.from({ length: 12 }, (_, i) =>
      blastCubes('a', width, (i / 12) * PRELUDE_S),
    ).flat()
    expect(cubes.length).toBeGreaterThan(0)
    for (const c of cubes) {
      expect(Math.hypot(c.x, c.z)).toBeGreaterThanOrEqual(width / 2)
      expect(c.y).toBeLessThan(20)
      expect(c.scale).toBeGreaterThan(0)
    }
  })

  it('never throws more cubes than it has room for', () => {
    for (let t = 0; t <= PRELUDE_S; t += 0.05) {
      expect(blastCubes('a', 3.2, t).length).toBeLessThanOrEqual(
        MAX_BLAST_CUBES,
      )
    }
  })

  it('is quiet before the first charge and long after the last', () => {
    expect(blastCubes('a', 3.2, -1)).toEqual([])
    expect(blastCubes('a', 3.2, PRELUDE_S + 1)).toEqual([])
    expect(blastLight('a', PRELUDE_S + 1)).toBe(0)
  })

  it('lights the foot of the building while charges burn', () => {
    const lit = Array.from({ length: 24 }, (_, i) =>
      blastLight('a', (i / 24) * PRELUDE_S),
    )
    expect(Math.max(...lit)).toBeGreaterThan(0)
    expect(Math.max(...lit)).toBeLessThanOrEqual(1)
  })
})

describe('smoke', () => {
  it('lasts 2 to 4 seconds, its own time for each building', () => {
    const durations = ['a', 'b', 'c', 'd', 'e'].map(smokeDuration)
    for (const d of durations) {
      expect(d).toBeGreaterThanOrEqual(2)
      expect(d).toBeLessThanOrEqual(4)
    }
    expect(new Set(durations).size).toBeGreaterThan(1)
  })

  it('thins out progressively until it is gone', () => {
    const d = smokeDuration('a')
    const opacities = [0, 0.25, 0.5, 0.75, 0.99].map((f) =>
      smokeOpacity('a', f * d),
    )
    for (let i = 1; i < opacities.length; i++) {
      expect(opacities[i]).toBeLessThan(opacities[i - 1])
    }
    expect(opacities[0]).toBeGreaterThan(0)
    expect(smokeOpacity('a', d)).toBe(0)
    expect(smokeOpacity('a', -1)).toBe(0)
    expect(smokeCubes('a', 3.2, d)).toEqual([])
  })

  it('rises and swells as it thins out', () => {
    const d = smokeDuration('a')
    const early = smokeCubes('a', 3.2, 0.1 * d)
    const late = smokeCubes('a', 3.2, 0.9 * d)
    expect(early.length).toBe(PUFFS)
    const mean = (cubes: typeof early, key: 'y' | 'scale') =>
      cubes.reduce((sum, c) => sum + c[key], 0) / cubes.length
    expect(mean(late, 'y')).toBeGreaterThan(mean(early, 'y'))
    expect(mean(late, 'scale')).toBeGreaterThan(mean(early, 'scale'))
  })
})
