import { describe, expect, it } from 'vitest'
import { cloudsFor, type Cloud } from '../../src/city/effects/cloudShape'
import {
  boltPoints,
  dropPose,
  lightning,
  raindrops,
} from '../../src/city/effects/stormShape'

const clouds = cloudsFor(24, 16)
const ofKind = (kind: Cloud['kind']) => clouds.filter((c) => c.kind === kind)
const FALL = 12
const times = Array.from({ length: 1500 }, (_, i) => i * 0.1)

describe('raindrops', () => {
  it('is the same every time', () => {
    const [cloud] = ofKind('storm')
    expect(raindrops(cloud)).toEqual(raindrops(cloud))
  })

  it('falls from rainy and stormy clouds only, harder from a storm', () => {
    for (const cloud of ofKind('fair')) expect(raindrops(cloud)).toEqual([])
    for (const rainy of ofKind('rain')) {
      expect(raindrops(rainy).length).toBeGreaterThan(0)
      for (const storm of ofKind('storm')) {
        expect(raindrops(storm).length).toBeGreaterThan(raindrops(rainy).length)
      }
    }
  })

  it('stays under the cloud, not far past its edges', () => {
    for (const cloud of clouds) {
      const reachX = Math.max(...cloud.blocks.map((b) => Math.abs(b.x))) + 1
      const reachZ = Math.max(...cloud.blocks.map((b) => Math.abs(b.z))) + 1
      for (const drop of raindrops(cloud)) {
        expect(Math.abs(drop.x)).toBeLessThanOrEqual(reachX)
        expect(Math.abs(drop.z)).toBeLessThanOrEqual(reachZ)
      }
    }
  })
})

describe('dropPose', () => {
  const [cloud] = ofKind('rain')
  const drops = raindrops(cloud)

  it('keeps every drop between the cloud and the ground', () => {
    for (const drop of drops) {
      for (const t of times) {
        const { y } = dropPose(drop, t, FALL)
        expect(y).toBeGreaterThanOrEqual(0)
        expect(y).toBeLessThanOrEqual(FALL)
      }
    }
  })

  it('falls, then starts again from the cloud', () => {
    const drop = drops[0]
    let falling = 0
    let restarts = 0
    for (let t = 0; t < 60; t += 0.02) {
      const step = dropPose(drop, t + 0.02, FALL).y - dropPose(drop, t, FALL).y
      if (step < 0) falling++
      else restarts++
    }
    expect(falling).toBeGreaterThan(restarts * 10)
    expect(restarts).toBeGreaterThan(0)
  })

  it('does not drop all the rain together', () => {
    const heights = drops.map((d) => dropPose(d, 0, FALL).y.toFixed(1))
    expect(new Set(heights).size).toBeGreaterThan(drops.length / 2)
  })
})

describe('lightning', () => {
  it('never flashes in a cloud without a storm', () => {
    for (const cloud of [...ofKind('fair'), ...ofKind('rain')]) {
      for (const t of times) expect(lightning(cloud, t).flash).toBe(0)
    }
  })

  it('flashes now and then in a storm, and is dark most of the time', () => {
    for (const cloud of ofKind('storm')) {
      const flashes = times.map((t) => lightning(cloud, t).flash)
      for (const flash of flashes) {
        expect(flash).toBeGreaterThanOrEqual(0)
        expect(flash).toBeLessThanOrEqual(1)
      }
      expect(Math.max(...flashes)).toBe(1)
      expect(flashes.filter((f) => f === 0).length).toBeGreaterThan(
        flashes.length * 0.7,
      )
    }
  })

  it('strikes somewhere new each time', () => {
    const [cloud] = ofKind('storm')
    const strikes = new Set(times.map((t) => lightning(cloud, t).strike))
    expect(strikes.size).toBeGreaterThan(3)
    // And counts up, never back.
    let last = -Infinity
    for (const t of times) {
      const { strike } = lightning(cloud, t)
      expect(strike).toBeGreaterThanOrEqual(last)
      last = strike
    }
  })
})

describe('boltPoints', () => {
  const [cloud] = ofKind('storm')

  it('runs from the cloud down to the ground in a zigzag', () => {
    const points = boltPoints(cloud, 3, FALL)
    expect(points.length).toBeGreaterThan(4)
    expect(points[0].y).toBe(0)
    expect(points[points.length - 1].y).toBe(-FALL)
    for (let i = 1; i < points.length; i++) {
      expect(points[i].y).toBeLessThan(points[i - 1].y)
    }
    expect(new Set(points.map((p) => p.x.toFixed(2))).size).toBeGreaterThan(2)
  })

  it('is the same for the same strike and different for the next', () => {
    expect(boltPoints(cloud, 3, FALL)).toEqual(boltPoints(cloud, 3, FALL))
    expect(boltPoints(cloud, 4, FALL)).not.toEqual(boltPoints(cloud, 3, FALL))
  })
})
