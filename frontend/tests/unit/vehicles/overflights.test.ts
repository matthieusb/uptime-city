import { describe, expect, it } from 'vitest'
import {
  CRAFT,
  OUT,
  PLANE_KINDS,
  cruiseHeight,
  planeCount,
} from '../../../src/city/flights'
import {
  overflightCycle,
  overflightCount,
  overflightState,
  overflightTimes,
  SKY_BASE_PLANES,
  SKY_PLANES,
} from '../../../src/city/overflights'

const bounds = { halfWidth: 60, halfDepth: 40 }
const cruise = cruiseHeight(6)
const STEP = 0.25

// Every plane of the sky at every step of `cycles` of the longest cycle.
function* samples(cycles = 6) {
  const end =
    cycles *
    Math.max(
      ...Array.from({ length: SKY_PLANES }, (_, i) =>
        overflightCycle(bounds, i),
      ),
    )
  for (let t = 0; t < end; t += STEP) {
    for (let i = 0; i < SKY_PLANES; i++) {
      yield { t, i, p: overflightState(bounds, cruise, i, t) }
    }
  }
}

describe('the planes crossing the sky', () => {
  it('are more than the planes of the airport: none at 0, up to twice as many as at 1', () => {
    expect(overflightCount(0)).toBe(0)
    expect(overflightCount(1)).toBe(SKY_BASE_PLANES)
    expect(overflightCount(1)).toBeGreaterThan(planeCount(1))
    expect(overflightCount(2)).toBe(SKY_PLANES)
    expect(SKY_PLANES).toBe(2 * SKY_BASE_PLANES)
    expect(overflightCount(0.5)).toBeLessThan(overflightCount(1))
  })

  it('fly above the clouds and never underground', () => {
    let seen = 0
    for (const { p } of samples()) {
      if (!p.active) continue
      seen++
      expect(p.y).toBeGreaterThanOrEqual(cruise)
      expect(p.y).toBeLessThan(cruise + CRAFT.jumbo.climb.cap + 2)
      expect(p.pitch).toBe(0)
    }
    expect(seen).toBeGreaterThan(0)
  })

  it('come in beyond an edge of the map and go out beyond an edge', () => {
    const outside = (x: number, z: number) =>
      Math.abs(x) >= bounds.halfWidth + OUT / 2 ||
      Math.abs(z) >= bounds.halfDepth + OUT / 2
    for (let i = 0; i < SKY_PLANES; i++) {
      for (let c = 0; c < 20; c++) {
        const f = overflightTimes(bounds, i, c)
        expect(outside(f.from[0], f.from[1])).toBe(true)
        expect(outside(f.to[0], f.to[1])).toBe(true)
        expect(f.end).toBeGreaterThan(f.start)
      }
    }
  })

  it('cross from one edge to another one, at random, not always the same way', () => {
    const sides = new Set<string>()
    const kinds = new Set<string>()
    for (let i = 0; i < SKY_PLANES; i++) {
      for (let c = 0; c < 40; c++) {
        const f = overflightTimes(bounds, i, c)
        sides.add(`${f.enter}>${f.exit}`)
        kinds.add(f.kind)
        expect(f.enter).not.toBe(f.exit)
      }
    }
    expect(sides.size).toBeGreaterThan(6)
    expect([...kinds].sort()).toEqual([...PLANE_KINDS].sort())
  })

  it('stay the same flight every time they are asked', () => {
    for (let t = 0; t < 500; t += 17) {
      for (let i = 0; i < SKY_PLANES; i++) {
        expect(overflightState(bounds, cruise, i, t)).toEqual(
          overflightState(bounds, cruise, i, t),
        )
      }
    }
  })

  it('move in a straight line, nose first, with no jump', () => {
    for (let i = 0; i < SKY_PLANES; i++) {
      let before = overflightState(bounds, cruise, i, 0)
      for (let t = STEP; t < 3 * overflightCycle(bounds, i); t += STEP) {
        const now = overflightState(bounds, cruise, i, t)
        if (before.active && now.active) {
          const dx = now.x - before.x
          const dz = now.z - before.z
          expect(Math.hypot(dx, dz)).toBeLessThan(STEP * 2 * CRAFT.jumbo.vFly)
          // Its nose points where it goes.
          expect(Math.cos(now.heading)).toBeCloseTo(dx / Math.hypot(dx, dz), 1)
          expect(Math.sin(now.heading)).toBeCloseTo(-dz / Math.hypot(dx, dz), 1)
          expect(now.y).toBe(before.y)
        }
        before = now
      }
    }
  })

  it('are in the sky some of the time and gone the rest', () => {
    let on = 0
    let total = 0
    for (const { p } of samples(3)) {
      total++
      if (p.active) on++
    }
    expect(on).toBeGreaterThan(0)
    expect(on).toBeLessThan(total)
  })
})
