import { describe, expect, it } from 'vitest'
import { PRELUDE_S } from '../../../src/city/collapse'
import {
  blastPlan,
  MAX_BLAST_CUBES,
  newPose,
  piecePose,
  puffPose,
  PUFFS,
  smokeDuration,
  smokeOpacity,
  smokePlan,
  smokeProgress,
  type Pose,
} from '../../../src/city/effects/demolitionShape'

const HEIGHT = 12
const FLOORS = 6
const WIDTH = 4

// The pieces burning at `elapsed`, as the page draws them.
const blast = (elapsed: number, floors = FLOORS): Pose[] =>
  blastPlan('a', WIDTH, HEIGHT, floors).flatMap((piece) => {
    const pose = newPose()
    return piecePose(piece, elapsed, pose) ? [pose] : []
  })

const puffsAt = (id: string, width: number, t: number): Pose[] =>
  smokePlan(id, width).map((puff) => {
    const pose = newPose()
    puffPose(puff, t, pose)
    return pose
  })

describe('blastCubes', () => {
  it('is the same for the same building', () => {
    expect(blast(0.5)).toEqual(blast(0.5))
  })

  it('bursts out of the windows, on the walls of the building', () => {
    const cubes = Array.from({ length: 24 }, (_, i) =>
      blast((i / 24) * PRELUDE_S),
    ).flat()
    expect(cubes.length).toBeGreaterThan(0)
    for (const c of cubes) {
      expect(Math.max(Math.abs(c.x), Math.abs(c.z))).toBeGreaterThanOrEqual(
        WIDTH / 2 - 0.01,
      )
      expect(c.scale).toBeGreaterThanOrEqual(0)
    }
  })

  it('climbs the building floor by floor, from its foot to its roof', () => {
    const mean = (elapsed: number) => {
      const cubes = blast(elapsed)
      return cubes.reduce((sum, c) => sum + c.y, 0) / cubes.length
    }
    const means = [0.1, 0.35, 0.6, 0.85].map(mean)
    for (let i = 1; i < means.length; i++) {
      expect(means[i]).toBeGreaterThan(means[i - 1])
    }
    expect(means[0]).toBeLessThan(HEIGHT / 3)
    expect(means[3]).toBeGreaterThan((2 * HEIGHT) / 3)
  })

  it('ends with the roof bursting, above the top floor', () => {
    const cubes = blast(PRELUDE_S - 0.15)
    expect(cubes.some((c) => c.y > HEIGHT)).toBe(true)
  })

  it('never throws more cubes than it has room for, however tall the building', () => {
    for (const floors of [1, 2, 6, 40]) {
      for (let t = 0; t <= PRELUDE_S; t += 0.05) {
        expect(blast(t, floors).length).toBeLessThanOrEqual(MAX_BLAST_CUBES)
      }
    }
  })

  it('is quiet before the first burst and long after the last', () => {
    expect(blast(-1)).toEqual([])
    expect(blast(PRELUDE_S + 1)).toEqual([])
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
    expect(smokeProgress('a', d)).toBeNull()
    expect(smokeProgress('a', -1)).toBeNull()
    expect(smokeProgress('a', 0.5 * d)).toBeCloseTo(0.5)
  })

  it('rises and swells as it thins out', () => {
    expect(smokePlan('a', 3.2).length).toBe(PUFFS)
    const early = puffsAt('a', 3.2, 0.1)
    const late = puffsAt('a', 3.2, 0.9)
    const mean = (poses: Pose[], key: 'y' | 'scale') =>
      poses.reduce((sum, p) => sum + p[key], 0) / poses.length
    expect(mean(late, 'y')).toBeGreaterThan(mean(early, 'y'))
    expect(mean(late, 'scale')).toBeGreaterThan(mean(early, 'scale'))
  })
})
