import { describe, expect, it } from 'vitest'
import {
  RESTORE_S,
  RISE_S,
  SWEEP_S,
  fromMiddle,
  lotCollapse,
  passTime,
  sweepFront,
  sweepRange,
  sweptAt,
  wavePlanes,
} from '../../../src/city/effects/restoreShape'

describe('sweepRange', () => {
  it('goes from the middle of the plate to its farthest corner', () => {
    const range = sweepRange(10, 6)
    expect(range.min).toBe(0)
    expect(range.max).toBeCloseTo(Math.hypot(10, 6))
    for (const [x, z] of [
      [-10, 6],
      [10, -6],
      [10, 6],
      [-10, -6],
    ])
      expect(fromMiddle(x, z)).toBeLessThanOrEqual(range.max + 1e-9)
  })

  it('measures the distance to the middle, whatever the side', () => {
    expect(fromMiddle(0, 0)).toBe(0)
    expect(fromMiddle(3, -4)).toBe(5)
    expect(fromMiddle(-3, 4)).toBe(5)
  })
})

describe('wavePlanes', () => {
  it('is a ring of planes around the middle, at the radius of the wave', () => {
    const planes = wavePlanes(7)
    expect(planes.length).toBeGreaterThanOrEqual(16)
    for (const { x, z, distance } of planes) {
      expect(Math.hypot(x, z)).toBeCloseTo(1)
      expect(distance).toBeCloseTo(7)
    }
    // All around: as many planes point left as right, and up as down.
    expect(planes.reduce((n, p) => n + p.x, 0)).toBeCloseTo(0)
    expect(planes.reduce((n, p) => n + p.z, 0)).toBeCloseTo(0)
  })
})

describe('sweepFront', () => {
  const range = sweepRange(10, 6)

  it('runs from the middle to the farthest corner in SWEEP_S', () => {
    expect(sweepFront(0, range)).toBe(range.min)
    expect(sweepFront(SWEEP_S, range)).toBe(range.max)
    expect(sweepFront(SWEEP_S + 5, range)).toBe(range.max)
  })

  it('moves at a steady pace', () => {
    const a = sweepFront(1, range) - sweepFront(0, range)
    const b = sweepFront(2, range) - sweepFront(1, range)
    expect(a).toBeCloseTo(b)
  })

  it('has passed a point at the time passTime tells', () => {
    const s = 3
    expect(sweepFront(passTime(s, range), range)).toBeCloseTo(s)
  })
})

describe('lotCollapse', () => {
  const range = sweepRange(10, 6)

  it('keeps a building in ruins until the wave reaches it, then raises it', () => {
    const s = 0
    const pass = passTime(s, range)
    expect(lotCollapse(s, pass - 0.1, range)).toBe(1)
    expect(lotCollapse(s, pass + RISE_S / 2, range)).toBeGreaterThan(0)
    expect(lotCollapse(s, pass + RISE_S / 2, range)).toBeLessThan(1)
    expect(lotCollapse(s, pass + RISE_S, range)).toBe(0)
  })

  it('raises the buildings near the middle before those far from it', () => {
    const t = 1.5
    expect(lotCollapse(2, t, range)).toBeLessThan(lotCollapse(9, t, range))
  })

  it('is all over before the end of the restoration', () => {
    expect(RESTORE_S).toBeGreaterThanOrEqual(SWEEP_S + RISE_S)
    expect(lotCollapse(range.max, RESTORE_S, range)).toBe(0)
  })
})

describe('sweptAt', () => {
  it('is 0 without a restoration and before it starts', () => {
    expect(sweptAt(null, 9000)).toBe(0)
    expect(sweptAt(1000, 500)).toBe(0)
    expect(sweptAt(1000, 1000)).toBe(0)
  })

  it('goes to 1 as the wave sweeps the middle, and stays there', () => {
    expect(sweptAt(1000, 1000 + (SWEEP_S * 1000) / 2)).toBeCloseTo(0.5, 9)
    expect(sweptAt(1000, 1000 + SWEEP_S * 1000)).toBe(1)
    expect(sweptAt(1000, 1000 + 60_000)).toBe(1)
  })
})
