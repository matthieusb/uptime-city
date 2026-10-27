import { describe, expect, it } from 'vitest'
import { NUKE_HEIGHT } from '../../../src/city/effects/nukeShape'
import {
  ballCube,
  BALL_CUBES,
  capCube,
  CAP_CUBES,
  newCube,
  snap,
  stemCube,
  STEM_CUBES,
  VOXEL,
  type Cube,
} from '../../../src/city/effects/voxelCloud'

const growths = Array.from({ length: 21 }, (_, i) => i / 20)

const parts: [
  string,
  number,
  (k: number, g: number, t: number, cube: Cube) => Cube,
][] = [
  ['fireball', BALL_CUBES, ballCube],
  ['cap', CAP_CUBES, capCube],
  ['stem', STEM_CUBES, stemCube],
]

describe.each(parts)('the cubes of the %s', (name, count, place) => {
  const all = (g: number, t: number) =>
    Array.from({ length: count }, (_, k) => ({ ...place(k, g, t, newCube()) }))

  it('are all finite, with a heat on the ramp', () => {
    for (const g of growths) {
      for (const cube of all(g, 3.7)) {
        for (const v of Object.values(cube))
          expect(Number.isFinite(v)).toBe(true)
        expect(cube.heat).toBeGreaterThanOrEqual(0)
        expect(cube.heat).toBeLessThanOrEqual(1)
        expect(cube.scale).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('are the same for the same growth and time', () => {
    expect(all(0.6, 2)).toEqual(all(0.6, 2))
  })

  it('stay under the height of the cloud and above the ground', () => {
    for (const g of growths) {
      for (const cube of all(g, 1.3).filter((c) => c.scale > 0)) {
        expect(cube.y).toBeLessThanOrEqual(NUKE_HEIGHT)
        expect(cube.y).toBeGreaterThan(-2)
      }
    }
  })

  it('are not all in the same place', () => {
    // The fireball is only there while the cloud is young.
    const cubes = all(name === 'fireball' ? 0.2 : 1, 0.5).filter(
      (c) => c.scale > 0,
    )
    expect(new Set(cubes.map((c) => c.x.toFixed(2))).size).toBeGreaterThan(20)
  })
})

describe('the cloud as it grows', () => {
  const shown = (place: (typeof parts)[number][2], count: number, g: number) =>
    Array.from({ length: count }, (_, k) => place(k, g, 0, newCube())).filter(
      (cube) => cube.scale > 0,
    ).length

  it('has no cap and no stem before the strike, and all of them once grown', () => {
    expect(shown(capCube, CAP_CUBES, 0)).toBe(0)
    expect(shown(stemCube, STEM_CUBES, 0)).toBe(0)
    expect(shown(capCube, CAP_CUBES, 1)).toBe(CAP_CUBES)
    expect(shown(stemCube, STEM_CUBES, 1)).toBe(STEM_CUBES)
  })

  it('has the fireball swell out of nothing, then be gone', () => {
    expect(shown(ballCube, BALL_CUBES, 0)).toBe(0)
    expect(shown(ballCube, BALL_CUBES, 0.18)).toBe(BALL_CUBES)
    expect(shown(ballCube, BALL_CUBES, 1)).toBe(0)
  })

  it('rolls the cap with time', () => {
    const early = capCube(10, 1, 1, newCube())
    const later = { ...capCube(10, 1, 2, newCube()) }
    expect({ ...early }).not.toEqual(later)
  })

  it('puts the cap above the stem, and the stem under the cap', () => {
    const top = (place: typeof capCube, count: number) =>
      Math.max(
        ...Array.from({ length: count }, (_, k) => place(k, 1, 0, newCube()).y),
      )
    expect(top(capCube, CAP_CUBES)).toBeGreaterThan(
      top(stemCube, STEM_CUBES) - 1,
    )
    expect(top(capCube, CAP_CUBES)).toBeGreaterThan(NUKE_HEIGHT - 6)
  })
})

describe('snapping to the grid', () => {
  it('gives the nearest multiple of the step', () => {
    expect(snap(0.34, VOXEL)).toBeCloseTo(0, 9)
    expect(snap(0.36, VOXEL)).toBeCloseTo(VOXEL, 9)
    expect(snap(-1.4, 0.7)).toBeCloseTo(-1.4, 9)
    expect(snap(5.1, 1)).toBe(5)
  })
})
