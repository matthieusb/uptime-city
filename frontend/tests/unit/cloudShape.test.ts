import { describe, expect, it } from 'vitest'
import {
  cloudPose,
  cloudsFor,
  laneSpan,
  type Cloud,
} from '../../src/city/effects/cloudShape'

const HALF_WIDTH = 24
const HALF_DEPTH = 16
const bounds = { halfWidth: HALF_WIDTH, halfDepth: HALF_DEPTH }
const clouds = cloudsFor(HALF_WIDTH, HALF_DEPTH)
const times = Array.from({ length: 400 }, (_, i) => i * 0.37)

describe('cloudsFor density', () => {
  it('has the normal count at density 1', () => {
    expect(cloudsFor(HALF_WIDTH, HALF_DEPTH, 1)).toEqual(clouds)
  })

  it('has no cloud at density 0 and more of them as the density grows', () => {
    expect(cloudsFor(HALF_WIDTH, HALF_DEPTH, 0)).toEqual([])
    expect(cloudsFor(HALF_WIDTH, HALF_DEPTH, 0.5).length).toBeLessThan(
      clouds.length,
    )
    expect(cloudsFor(HALF_WIDTH, HALF_DEPTH, 2).length).toBeGreaterThan(
      clouds.length,
    )
  })
})

describe('cloudsFor', () => {
  it('is the same every time', () => {
    expect(cloudsFor(HALF_WIDTH, HALF_DEPTH)).toEqual(clouds)
  })

  it('has no cloud over an empty map', () => {
    expect(cloudsFor(0, 0)).toEqual([])
  })

  it('has more clouds over a bigger map', () => {
    expect(cloudsFor(60, 40).length).toBeGreaterThan(clouds.length)
  })

  it('makes every cloud big, none floating alone', () => {
    expect(clouds.length).toBeGreaterThan(0)
    for (const cloud of clouds) {
      expect(cloud.blocks.length).toBeGreaterThan(30)
      expect(cloud.blocks.some((b) => b.y === 0)).toBe(true)
      const xs = cloud.blocks.map((b) => b.x)
      expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThanOrEqual(8)
    }
  })

  it('has fair, rainy and stormy clouds, the fair ones the most', () => {
    const count = (kind: string) => clouds.filter((c) => c.kind === kind).length
    expect(count('rain')).toBeGreaterThan(0)
    expect(count('storm')).toBeGreaterThan(0)
    expect(count('fair')).toBeGreaterThanOrEqual(count('storm'))
  })
})

describe('laneSpan', () => {
  it('stretches across the whole map along its middle lane', () => {
    const { lo, hi } = laneSpan(0, bounds)
    // Limited by the shorter side of the map, seen along the diagonal.
    expect(lo).toBeCloseTo(-Math.SQRT2 * HALF_DEPTH)
    expect(hi).toBeCloseTo(Math.SQRT2 * HALF_DEPTH)
  })

  it('shrinks towards the corners of the map', () => {
    const middle = laneSpan(0, bounds)
    const side = laneSpan(15, bounds)
    expect(side.hi - side.lo).toBeLessThan(middle.hi - middle.lo)
  })
})

describe('cloudPose', () => {
  const visible = (cloud: Cloud) =>
    times.map((t) => cloudPose(cloud, t, bounds)).filter((p) => p.scale > 0)

  it('only shows over the map, never past its edges', () => {
    for (const cloud of clouds) {
      for (const pose of visible(cloud)) {
        expect(Math.abs(pose.x)).toBeLessThanOrEqual(HALF_WIDTH + 1e-6)
        expect(Math.abs(pose.z)).toBeLessThanOrEqual(HALF_DEPTH + 1e-6)
      }
    }
  })

  it('has every cloud fully grown at some point and gone at another', () => {
    for (const cloud of clouds) {
      const scales = times.map((t) => cloudPose(cloud, t, bounds).scale)
      expect(Math.max(...scales)).toBe(1)
      expect(Math.min(...scales)).toBe(0)
    }
  })

  it('grows and shrinks smoothly instead of popping in and out', () => {
    for (const cloud of clouds) {
      const scales = Array.from(
        { length: 4000 },
        (_, i) => cloudPose(cloud, i * 0.05, bounds).scale,
      )
      for (let i = 1; i < scales.length; i++) {
        expect(Math.abs(scales[i] - scales[i - 1])).toBeLessThan(0.2)
      }
    }
  })

  it('drifts from left to right on screen, then comes back at the left', () => {
    const cloud = clouds[0]
    const screenX = (t: number) => {
      const pose = cloudPose(cloud, t, bounds)
      return (pose.x - pose.z) / Math.SQRT2
    }
    let rising = 0
    let wraps = 0
    for (let t = 0; t < 600; t += 0.1) {
      const step = screenX(t + 0.1) - screenX(t)
      if (step > 0) rising++
      else wraps++
    }
    expect(rising).toBeGreaterThan(wraps * 20)
    expect(wraps).toBeGreaterThan(0)
  })

  it('does not rise or sink while drifting', () => {
    for (const cloud of clouds) {
      const heights = new Set(times.map((t) => cloudPose(cloud, t, bounds).y))
      expect(heights.size).toBe(1)
    }
  })

  it('does not start all the clouds together', () => {
    const starts = clouds.map((c) => cloudPose(c, 0, bounds).scale)
    expect(new Set(starts.map((s) => s.toFixed(2))).size).toBeGreaterThan(1)
  })
})
