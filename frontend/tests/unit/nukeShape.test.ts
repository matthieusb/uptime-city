import { describe, expect, it } from 'vitest'
import {
  mushroomPuffs,
  NUKE_HEIGHT,
  puffPose,
  wisps,
} from '../../src/city/effects/nukeShape'

describe('mushroomPuffs', () => {
  const puffs = mushroomPuffs()

  it('is made of many puffs, the same every time', () => {
    expect(puffs.length).toBeGreaterThan(60)
    expect(mushroomPuffs()).toEqual(puffs)
  })

  it('rises from the ground to its height, and no higher', () => {
    expect(
      Math.min(...puffs.map((p) => p.y - p.radius)),
    ).toBeGreaterThanOrEqual(-0.01)
    const top = Math.max(...puffs.map((p) => p.y + p.radius))
    expect(top).toBeLessThanOrEqual(NUKE_HEIGHT)
    expect(top).toBeGreaterThan(NUKE_HEIGHT - 1)
  })

  it('has a cap much wider than its stem', () => {
    const width = (from: number, to: number) =>
      Math.max(
        ...puffs
          .filter((p) => p.y >= from && p.y <= to)
          .map((p) => Math.hypot(p.x, p.z) + p.radius),
      )
    // The stem, above the dust and the fireball, and the cap.
    expect(width(4, 9)).toBeLessThan(3)
    expect(width(11, 14)).toBeGreaterThan(2 * width(4, 9))
  })

  it('glows underneath and turns to grey ash on top', () => {
    const mean = (list: number[]) =>
      list.reduce((a, b) => a + b, 0) / list.length
    const glowing = puffs.filter((p) => p.glow)
    const ash = puffs.filter((p) => !p.glow)
    expect(glowing.length).toBeGreaterThan(10)
    expect(ash.length).toBeGreaterThan(10)
    expect(mean(glowing.map((p) => p.y))).toBeLessThan(
      mean(ash.map((p) => p.y)),
    )
  })

  it('has a color, a phase and a speed for every puff', () => {
    for (const p of puffs) {
      expect(p.color).toMatch(/^#[0-9a-f]{6}$/)
      expect(p.phase).toBeGreaterThanOrEqual(0)
      expect(p.phase).toBeLessThan(2 * Math.PI)
      expect(p.speed).toBeGreaterThan(0)
    }
  })
})

describe('puffPose', () => {
  const puffs = mushroomPuffs()

  it('moves a puff over time, but never far from where it belongs', () => {
    for (const puff of puffs) {
      const poses = [0, 1.7, 4.2, 9.9].map((t) => puffPose(puff, t))
      for (const pose of poses) {
        expect(Math.hypot(pose.x - puff.x, pose.z - puff.z)).toBeLessThan(
          2 * Math.hypot(puff.x, puff.z) + 1,
        )
        expect(Math.abs(pose.y - puff.y)).toBeLessThan(0.8)
        expect(pose.scale).toBeGreaterThan(0.8)
        expect(pose.scale).toBeLessThan(1.25)
        // Swirling keeps the distance to the axis.
        expect(Math.hypot(pose.x, pose.z)).toBeCloseTo(
          Math.hypot(puff.x, puff.z),
          6,
        )
      }
      expect(poses[0]).not.toEqual(poses[2])
    }
  })

  it('swirls the cap faster than the stem', () => {
    const angle = (p: { x: number; z: number }) => Math.atan2(p.z, p.x)
    const stem = {
      x: 1,
      y: 6,
      z: 0,
      radius: 1,
      glow: false,
      color: '#000000',
      phase: 0,
      speed: 1,
    }
    const cap = { ...stem, x: 4, y: 12 }
    expect(
      Math.abs(angle(puffPose(cap, 5)) - angle(puffPose(cap, 0))),
    ).toBeGreaterThan(
      Math.abs(angle(puffPose(stem, 5)) - angle(puffPose(stem, 0))),
    )
  })
})

describe('wisps', () => {
  it('rise from the cap and fade out at the top', () => {
    const list = wisps()
    expect(list.length).toBeGreaterThan(20)
    for (const wisp of list) {
      for (const t of [0, 3, 8, 21]) {
        const pose = wisp.pose(t)
        expect(pose.y).toBeGreaterThanOrEqual(10)
        expect(pose.y).toBeLessThanOrEqual(NUKE_HEIGHT + 6)
        expect(pose.scale).toBeGreaterThanOrEqual(0)
      }
    }
    // Each one is visible for part of its life, and not at its ends.
    const scales = list[0]
    expect(scales.pose(scales.start).scale).toBeCloseTo(0, 6)
  })
})
