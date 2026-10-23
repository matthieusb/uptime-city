import { describe, expect, it } from 'vitest'
import {
  COLLAPSE_S,
  collapseProgress,
  floorPose,
  RUBBLE_HEIGHT,
  trackCollapse,
  type Collapse,
} from '../../src/city/collapse'
import { floorBase, floorHeight } from '../../src/city/layout'
import type { Status } from '../../src/domain/status'

// Feeds the statuses seen at each time, and returns the last state.
function track(...steps: [Status, number][]): Collapse {
  let state: Collapse | null = null
  for (const [status, now] of steps) state = trackCollapse(state, status, now)
  return state!
}

describe('trackCollapse', () => {
  it('shows the ruins at once when the host is down on load', () => {
    expect(collapseProgress(track(['down', 5]), 5)).toBe(1)
    // The history is still loading on the first frames.
    expect(collapseProgress(track(['unknown', 1], ['down', 5]), 5)).toBe(1)
  })

  it('stands while the host is up or unknown', () => {
    expect(collapseProgress(track(['up', 5]), 5)).toBe(0)
    expect(collapseProgress(track(['unknown', 5]), 5)).toBe(0)
  })

  it('falls over a few seconds when the host goes down', () => {
    const state = track(['up', 1], ['down', 10])
    expect(collapseProgress(state, 10)).toBe(0)
    const midway = collapseProgress(state, 10 + COLLAPSE_S / 2)
    expect(midway).toBeGreaterThan(0)
    expect(midway).toBeLessThan(1)
    expect(collapseProgress(state, 10 + COLLAPSE_S)).toBe(1)
    expect(collapseProgress(state, 100)).toBe(1)
  })

  it('keeps falling from where it started while the host stays down', () => {
    const state = track(['up', 1], ['down', 10], ['down', 11])
    expect(collapseProgress(state, 10 + COLLAPSE_S / 2)).toBe(
      collapseProgress(track(['up', 1], ['down', 10]), 10 + COLLAPSE_S / 2),
    )
  })

  it('stands again when the host is back up', () => {
    const state = track(['down', 1], ['up', 10])
    expect(collapseProgress(state, 10)).toBe(0)
  })
})

describe('floorPose', () => {
  const floors = 6
  const poses = (progress: number) =>
    Array.from({ length: floors }, (_, i) =>
      floorPose('host', i, floors, progress),
    )

  it('stands straight before the fall', () => {
    poses(0).forEach((pose, i) => {
      expect(pose).toEqual({
        x: 0,
        y: floorBase(i) + floorHeight(i) / 2,
        z: 0,
        rx: 0,
        rz: 0,
        sy: 1,
      })
    })
  })

  it('ends as a low pile of rubble on the lot', () => {
    for (const [i, pose] of poses(1).entries()) {
      expect(pose.y + (floorHeight(i) * pose.sy) / 2).toBeLessThanOrEqual(
        RUBBLE_HEIGHT,
      )
      expect(pose.y).toBeGreaterThan(0)
      expect(Math.abs(pose.x)).toBeLessThanOrEqual(0.5)
      expect(Math.abs(pose.z)).toBeLessThanOrEqual(0.5)
      expect(pose.sy).toBeLessThan(1)
    }
    // Tumbled, not neatly stacked.
    expect(poses(1).some((p) => Math.abs(p.rx) + Math.abs(p.rz) > 0.1)).toBe(
      true,
    )
  })

  it('keeps the pile low however many floors fell', () => {
    const top = floorPose('host', 29, 30, 1)
    expect(top.y + (floorHeight(29) * top.sy) / 2).toBeLessThanOrEqual(
      RUBBLE_HEIGHT,
    )
  })

  it('only goes down, keeping the floors in order', () => {
    let previous = poses(0)
    for (let p = 0.05; p <= 1; p += 0.05) {
      const current = poses(p)
      current.forEach((pose, i) => {
        expect(pose.y).toBeLessThanOrEqual(previous[i].y + 1e-9)
        if (i > 0) expect(pose.y).toBeGreaterThan(current[i - 1].y)
      })
      previous = current
    }
  })

  it('falls the same way every time', () => {
    expect(poses(0.6)).toEqual(poses(0.6))
  })
})
