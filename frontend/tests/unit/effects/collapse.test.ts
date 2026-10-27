import { describe, expect, it } from 'vitest'
import {
  COLLAPSE_S,
  REBUILD_S,
  collapseProgress,
  demolitionElapsed,
  PRELUDE_S,
  smokeAge,
  floorPose,
  RUBBLE_HEIGHT,
  rebuildProgress,
  rebuildWanted,
  rebuiltAfterWave,
  trackCollapse,
  type Collapse,
} from '../../../src/city/collapse'
import { floorBase, floorHeight } from '../../../src/city/layout'
import type { Status } from '../../../src/domain/status'

// Feeds the statuses seen at each time, and returns the last state.
function track(...steps: [Status, number][]): Collapse {
  let state: Collapse | null = null
  for (const [status, now] of steps) state = trackCollapse(state, status, now)
  return state!
}

describe('rebuild', () => {
  it('goes back up over time once the host is back, then is done', () => {
    let state = trackCollapse(null, 'up', 1)
    state = trackCollapse(state, 'down', 5)
    state = trackCollapse(state, 'up', 20, false, true)
    expect(rebuildProgress(state, 20)).toBe(0)
    expect(rebuildProgress(state, 20 + REBUILD_S / 2)).toBeCloseTo(0.5)
    expect(rebuildProgress(state, 20 + REBUILD_S)).toBeNull()
  })

  it('does not happen when animations are off or the host never fell', () => {
    const down = trackCollapse(trackCollapse(null, 'up', 1), 'down', 5)
    expect(trackCollapse(down, 'up', 20).rebuildStart).toBeUndefined()
    expect(
      trackCollapse(null, 'up', 1, false, true).rebuildStart,
    ).toBeUndefined()
  })
})

describe('a tile restored after a nuke', () => {
  it('does not rebuild its buildings: the wave stands them up', () => {
    expect(rebuildWanted(true, false, false)).toBe(true)
    expect(rebuildWanted(true, true, false)).toBe(false)
    expect(rebuildWanted(true, false, true)).toBe(false)
    expect(rebuildWanted(false, false, false)).toBe(false)
  })

  it('has no rebuild left running once the wave is gone', () => {
    // Nuked and down, then up again while the wave sweeps, then after it.
    let state = trackCollapse(null, 'up', 1)
    state = trackCollapse(state, 'down', 5)
    state = trackCollapse(
      state,
      'up',
      20,
      false,
      rebuildWanted(true, true, false),
    )
    state = trackCollapse(
      state,
      'up',
      25,
      false,
      rebuildWanted(true, false, false),
    )
    expect(state.rebuildStart).toBeUndefined()
    expect(rebuildProgress(state, 25)).toBeNull()
  })
})

describe('a building the wave of a restoration reaches', () => {
  const standing = trackCollapse(trackCollapse(null, 'up', 1), 'down', 5)

  it('is rebuilt from the moment the wave passed it', () => {
    const state = rebuiltAfterWave(standing, 30, 1.5)
    expect(state.status).toBe('up')
    expect(state.start).toBeNull()
    expect(rebuildProgress(state, 30)).toBeCloseTo(1.5 / REBUILD_S)
    expect(rebuildProgress(state, 30 + REBUILD_S)).toBeNull()
  })

  it('keeps its first start, whatever happens next', () => {
    const first = rebuiltAfterWave(standing, 30, 0)
    expect(rebuiltAfterWave(first, 31, 0)).toBe(first)
    // And the tracker keeps it while the building is up.
    expect(trackCollapse(first, 'up', 32).rebuildStart).toBe(30)
  })

  it('never starts before the wave: a negative delay counts as none', () => {
    expect(rebuildProgress(rebuiltAfterWave(standing, 30, -4), 30)).toBe(0)
  })
})

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

  it('waits for the hold to end before it falls', () => {
    let state = trackCollapse(null, 'up', 1)
    state = trackCollapse(state, 'down', 10, true)
    expect(collapseProgress(state, 12)).toBe(0)
    state = trackCollapse(state, 'down', 14, false)
    expect(state.start).toBe(14)
    expect(collapseProgress(state, 14 + COLLAPSE_S + 1)).toBe(1)
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

describe('demolition and smoke', () => {
  it('waits for the charges before the fall starts', () => {
    const state = track(['up', 1], ['down', 10])
    expect(collapseProgress(state, 10 + PRELUDE_S, PRELUDE_S)).toBe(0)
    expect(
      collapseProgress(state, 10 + PRELUDE_S + COLLAPSE_S / 2, PRELUDE_S),
    ).toBeCloseTo(0.5)
  })

  it('sets charges off only between the host going down and the fall', () => {
    const state = track(['up', 1], ['down', 10])
    expect(demolitionElapsed(state, 9)).toBeNull()
    expect(demolitionElapsed(state, 10.5)).toBeCloseTo(0.5)
    expect(demolitionElapsed(state, 10 + PRELUDE_S + 0.01)).toBeNull()
  })

  it('raises dust once the building hit the ground', () => {
    const state = track(['up', 1], ['down', 10])
    const landed = 10 + PRELUDE_S + COLLAPSE_S
    expect(smokeAge(state, landed - 0.1, PRELUDE_S)).toBeNull()
    expect(smokeAge(state, landed + 1, PRELUDE_S)).toBeCloseTo(1)
  })

  it('has none for a building in ruins since the load, or standing', () => {
    const ruins = track(['down', 5])
    expect(demolitionElapsed(ruins, 5.2)).toBeNull()
    expect(smokeAge(ruins, 100, PRELUDE_S)).toBeNull()
    const standing = track(['up', 5])
    expect(demolitionElapsed(standing, 6)).toBeNull()
    expect(smokeAge(standing, 100)).toBeNull()
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
