import { describe, expect, it } from 'vitest'
import {
  GROW_S,
  MISSILE_S,
  STRIKE_S,
  TRAIL_LIFE,
  courseFor,
  flashLevel,
  growthAt,
  missileAt,
  missileBoxes,
  flashSize,
  sinceImpact,
  trailPuff,
  trailSeeds,
} from '../../../src/city/effects/strikeShape'

describe('missileAt', () => {
  it('is launched low, off the tile, and lands on its middle', () => {
    const start = missileAt(0)
    const end = missileAt(MISSILE_S)
    expect(Math.hypot(start.x, start.z)).toBeGreaterThan(10)
    expect(start.y).toBeLessThan(10)
    expect(end.y).toBeLessThan(1)
    expect(Math.hypot(end.x, end.z)).toBeLessThan(0.5)
  })

  it('flies a parabola: up to a top, then down', () => {
    const heights = Array.from(
      { length: 33 },
      (_, i) => missileAt((i / 32) * MISSILE_S).y,
    )
    const top = Math.max(...heights)
    expect(top).toBeGreaterThan(20)
    expect(heights.indexOf(top)).toBeGreaterThan(8)
    expect(heights.indexOf(top)).toBeLessThan(24)
    // Same height at equal distances on both sides of the top.
    const mid = missileAt(MISSILE_S / 2).y
    expect(mid).toBeCloseTo(top, 0)
  })

  it('flies at a steady pace over the ground', () => {
    const ground = (t: number) => Math.hypot(missileAt(t).x, missileAt(t).z)
    expect(ground(0) - ground(1)).toBeCloseTo(ground(1) - ground(2))
  })

  it('points its nose along its way: up, then down', () => {
    const first = missileAt(0).dir
    const last = missileAt(MISSILE_S).dir
    expect(Math.hypot(...first)).toBeCloseTo(1)
    expect(first[1]).toBeGreaterThan(0.5)
    expect(last[1]).toBeLessThan(-0.5)
  })

  it('stays put once it landed', () => {
    expect(missileAt(MISSILE_S + 5)).toEqual(missileAt(MISSILE_S))
  })

  it('lands on the middle from any side', () => {
    const course = { x: 14, z: 14, peak: 20 }
    expect(missileAt(0, course).x).toBe(14)
    const end = missileAt(MISSILE_S, course)
    expect(Math.hypot(end.x, end.z)).toBeLessThan(0.5)
  })
})

describe('courseFor', () => {
  const map = { halfWidth: 60, halfDepth: 40 }
  const plates = [
    { x: 0, z: 0 },
    { x: 45, z: -25 },
    { x: -50, z: 30 },
    { x: 10, z: 35 },
  ]
  const keys = Array.from({ length: 600 }, (_, i) => `host-${i}:${i * 977}`)
  const courses = keys.map((key, i) => courseFor(key, plates[i % 4], map))

  it('is the same for the same key', () => {
    expect(courseFor('a:1', plates[1], map)).toEqual(
      courseFor('a:1', plates[1], map),
    )
  })

  it('always starts outside the map, never from a tile', () => {
    courses.forEach((course, i) => {
      const x = plates[i % 4].x + course.x
      const z = plates[i % 4].z + course.z
      expect(Math.abs(x) > map.halfWidth || Math.abs(z) > map.halfDepth).toBe(
        true,
      )
    })
  })

  it('comes from another side one time out of three', () => {
    const left = courses.filter((course) => {
      const [dx, dz] = [course.x, course.z].map((n) => Math.sign(n))
      return dx === -1 && dz === 1
    })
    const other = courses.length - left.length
    expect(other / courses.length).toBeGreaterThan(0.26)
    expect(other / courses.length).toBeLessThan(0.4)
  })

  it('uses every side', () => {
    const sides = new Set(
      courses.map((course) => `${Math.sign(course.x)},${Math.sign(course.z)}`),
    )
    expect(sides.size).toBe(4)
  })

  it('flies higher over a longer way', () => {
    const near = courseFor(
      'k',
      { x: 0, z: 0 },
      { halfWidth: 10, halfDepth: 10 },
    )
    const far = courseFor(
      'k',
      { x: 0, z: 0 },
      { halfWidth: 300, halfDepth: 300 },
    )
    expect(far.peak).toBeGreaterThan(near.peak)
  })
})

describe('missileBoxes', () => {
  it('is a voxel rocket with a red nose below its body', () => {
    const boxes = missileBoxes()
    expect(boxes.length).toBeGreaterThan(6)
    const nose = boxes.filter((missileBox) => missileBox.color === '#d62828')
    const lowestNose = Math.min(...nose.map((missileBox) => missileBox.y))
    expect(lowestNose).toBeLessThan(
      Math.min(...boxes.map((missileBox) => missileBox.y)) + 0.01,
    )
  })
})

describe('trail', () => {
  const seeds = trailSeeds()

  it('is the same every time, emitted all along the fall', () => {
    expect(trailSeeds()).toEqual(seeds)
    expect(Math.min(...seeds.map((trailSeed) => trailSeed.emit))).toBe(0)
    expect(
      Math.max(...seeds.map((trailSeed) => trailSeed.emit)),
    ).toBeLessThanOrEqual(MISSILE_S)
  })

  it('has no puff before it is emitted nor after it is gone', () => {
    const seed = seeds[10]
    expect(trailPuff(seed, seed.emit - 0.1)).toBeNull()
    expect(trailPuff(seed, seed.emit + TRAIL_LIFE + 0.1)).toBeNull()
  })

  it('swells as it ages, fades at the end, and cools', () => {
    const seed = seeds[10]
    const young = trailPuff(seed, seed.emit + 0.3)!
    const old = trailPuff(seed, seed.emit + TRAIL_LIFE * 0.55)!
    const dying = trailPuff(seed, seed.emit + TRAIL_LIFE * 0.98)!
    expect(old.radius).toBeGreaterThan(young.radius)
    expect(dying.radius).toBeLessThan(old.radius)
    expect(young.heat).toBeGreaterThan(old.heat)
    expect(old.heat).toBe(0)
  })

  it('drifts upwards, away from where it was emitted', () => {
    const seed = seeds[40]
    const early = trailPuff(seed, seed.emit + 0.5)!
    const late = trailPuff(seed, seed.emit + 3)!
    expect(late.y).toBeGreaterThan(early.y - 0.5)
  })
})

describe('strike timeline', () => {
  it('lets the trail and the mushroom finish before the end', () => {
    expect(STRIKE_S).toBeGreaterThanOrEqual(MISSILE_S + TRAIL_LIFE)
    expect(STRIKE_S).toBeGreaterThanOrEqual(MISSILE_S + GROW_S)
  })

  it('flashes at the impact only', () => {
    expect(flashLevel(-0.1)).toBe(0)
    expect(flashLevel(0)).toBeGreaterThan(0.9)
    expect(flashLevel(5)).toBe(0)
  })

  it('grows the mushroom from nothing after the impact', () => {
    expect(growthAt(1000, 1000 + MISSILE_S * 1000)).toBe(0)
    expect(growthAt(1000, 1000 + (MISSILE_S + GROW_S) * 1000)).toBe(1)
    expect(growthAt(null, 5)).toBe(1)
  })

  it('swells the flash as it fades', () => {
    expect(flashSize(1)).toBeGreaterThan(0)
    expect(flashSize(0)).toBeGreaterThan(flashSize(1))
    expect(flashSize(0.5)).toBeGreaterThan(flashSize(1))
    expect(flashSize(0.5)).toBeLessThan(flashSize(0))
  })

  it('counts the seconds since the impact, and has long burnt for a tile nuked from the start', () => {
    expect(sinceImpact(1000, 1000 + MISSILE_S * 1000)).toBeCloseTo(0, 9)
    expect(sinceImpact(1000, 1000 + (MISSILE_S + 2) * 1000)).toBeCloseTo(2, 9)
    expect(sinceImpact(1000, 1000)).toBeCloseTo(-MISSILE_S, 9)
    expect(sinceImpact(null, 5000)).toBe(Infinity)
  })
})
