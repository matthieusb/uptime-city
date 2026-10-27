import { describe, expect, it } from 'vitest'
import { PLANE_KINDS, LIVERIES } from '../../../src/city/flights'
import { skyFlight, SKY_ALTITUDE } from '../../../src/city/planet/skyFlights'
import { cross, dot, length } from '../../../src/city/planet/sphere'

describe('skyFlight', () => {
  const radius = 100

  it('flies over the sea at the cruise altitude, for ever', () => {
    for (const t of [0, 1, 50, 1234.5]) {
      const { position } = skyFlight(radius, 3, t)
      const height = length(position) - radius
      expect(height).toBeGreaterThanOrEqual(SKY_ALTITUDE - 2)
      expect(height).toBeLessThanOrEqual(SKY_ALTITUDE + 2)
    }
  })

  it('goes along a great circle: its heading is tangent to the sphere and ahead of it', () => {
    const now = skyFlight(radius, 2, 10)
    expect(length(now.xAxis)).toBeCloseTo(1, 9)
    expect(dot(now.xAxis, now.yAxis)).toBeCloseTo(0, 9)
    // Its up is away from the middle of the planet.
    expect(dot(now.yAxis, now.position)).toBeGreaterThan(0)
    // It has moved along its heading a moment later.
    const later = skyFlight(radius, 2, 10.5)
    const moved = later.position.map((c, i) => c - now.position[i]) as [
      number,
      number,
      number,
    ]
    expect(dot(moved, now.xAxis)).toBeGreaterThan(0)
    expect(length(cross(now.xAxis, now.yAxis))).toBeCloseTo(1, 9)
  })

  it('gives each plane its own course, kind and livery by hash, the same each time', () => {
    expect(skyFlight(radius, 1, 5)).toEqual(skyFlight(radius, 1, 5))
    expect(skyFlight(radius, 1, 5).position).not.toEqual(
      skyFlight(radius, 4, 5).position,
    )
    for (let i = 0; i < 12; i++) {
      const { kind, livery } = skyFlight(radius, i, 0)
      expect(PLANE_KINDS).toContain(kind)
      expect(livery).toBeGreaterThanOrEqual(0)
      expect(livery).toBeLessThan(LIVERIES)
    }
  })

  it('takes longer round a bigger planet', () => {
    // The angle covered in a second shrinks with the radius.
    const angle = (r: number) => {
      const [a, b] = [skyFlight(r, 0, 0), skyFlight(r, 0, 1)]
      return Math.acos(
        dot(a.position, b.position) / (length(a.position) * length(b.position)),
      )
    }
    expect(angle(200)).toBeLessThan(angle(100))
  })
})
