import { describe, expect, it } from 'vitest'
import {
  explodedFloors,
  EXPLOSION_S,
  explosionActive,
  explosionParts,
  floorBlast,
  partColor,
  partPose,
  BLAST_S,
} from '../../src/city/effects/explosionShape'
import { floorBase, floorHeight } from '../../src/city/layout'
import type { BuildingState, Status } from '../../src/domain/status'

const state = (floors: Status[], collapsed = false): BuildingState => ({
  collapsed,
  floors,
  burning: floors.map((s, i) => !collapsed && i > 0 && s === 'down'),
})

describe('explodedFloors', () => {
  it('finds the services that went from up to down', () => {
    expect(
      explodedFloors(
        state(['up', 'up', 'up', 'down']),
        state(['up', 'down', 'up', 'down']),
      ),
    ).toEqual([1])
    expect(
      explodedFloors(state(['up', 'up', 'up']), state(['up', 'down', 'down'])),
    ).toEqual([1, 2])
  })

  it('says nothing the first time a building is seen, or for a service with no status yet', () => {
    expect(explodedFloors(null, state(['up', 'down']))).toEqual([])
    expect(
      explodedFloors(state(['up', 'unknown']), state(['up', 'down'])),
    ).toEqual([])
  })

  it('does not count a service that stays down, or one that came back', () => {
    expect(
      explodedFloors(state(['up', 'down']), state(['up', 'down'])),
    ).toEqual([])
    expect(explodedFloors(state(['up', 'down']), state(['up', 'up']))).toEqual(
      [],
    )
  })

  it('does not count the host itself: its building falls instead', () => {
    expect(explodedFloors(state(['up', 'up']), state(['down', 'up']))).toEqual(
      [],
    )
  })

  it('says nothing when the building falls or stands again', () => {
    expect(
      explodedFloors(state(['up', 'up']), state(['down', 'down'], true)),
    ).toEqual([])
    expect(
      explodedFloors(state(['down', 'up'], true), state(['up', 'down'])),
    ).toEqual([])
  })
})

describe('timing', () => {
  it('shows from the moment the service is down until the blast has spent itself', () => {
    expect(explosionActive(0)).toBe(true)
    expect(explosionActive(EXPLOSION_S - 0.01)).toBe(true)
    expect(explosionActive(EXPLOSION_S)).toBe(false)
    expect(explosionActive(-0.1)).toBe(false)
  })

  it('flashes the floor at first, and dims fast', () => {
    expect(floorBlast(0)).toBe(1)
    expect(floorBlast(BLAST_S / 2)).toBeGreaterThan(0)
    expect(floorBlast(BLAST_S / 2)).toBeLessThan(1)
    expect(floorBlast(BLAST_S)).toBe(0)
    expect(floorBlast(-1)).toBe(0)
  })
})

describe('explosionParts', () => {
  const width = 4
  const parts = explosionParts('lot:2', width, 2)

  it('is the same every time for the same floor', () => {
    expect(explosionParts('lot:2', width, 2)).toEqual(parts)
    expect(explosionParts('lot:3', width, 3)).not.toEqual(parts)
  })

  it('has fireballs, chunks and embers', () => {
    expect(new Set(parts.map((p) => p.kind))).toEqual(
      new Set(['fire', 'chunk', 'ember']),
    )
  })

  it('starts all of them at the walls of the floor', () => {
    const base = floorBase(2)
    for (const p of parts) {
      expect(Math.max(Math.abs(p.x), Math.abs(p.z))).toBeCloseTo(width / 2, 1)
      expect(p.y).toBeGreaterThanOrEqual(base)
      expect(p.y).toBeLessThanOrEqual(base + floorHeight(2))
    }
  })

  it('throws the fireballs out of the walls, slowing down', () => {
    for (const p of parts.filter((q) => q.kind === 'fire')) {
      const out = (age: number) => {
        const at = partPose(p, age)
        return Math.hypot(at.x, at.z)
      }
      expect(out(0.3)).toBeGreaterThan(out(0))
      expect(out(0.6) - out(0.3)).toBeLessThan(out(0.3) - out(0))
    }
  })

  it('throws the chunks up and out, then lets them fall', () => {
    for (const p of parts.filter((q) => q.kind === 'chunk')) {
      const peak = Math.max(
        ...[0.1, 0.2, 0.3, 0.4, 0.5].map((age) => partPose(p, age).y),
      )
      expect(peak).toBeGreaterThan(p.y)
      expect(partPose(p, p.life * 0.99).y).toBeLessThan(peak)
    }
  })

  it('never goes through the ground', () => {
    for (const p of parts) {
      for (let age = 0; age <= EXPLOSION_S; age += 0.1) {
        expect(partPose(p, age).y).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('shrinks away by the end of its life, and is nothing before it starts', () => {
    for (const p of parts) {
      expect(p.life).toBeLessThanOrEqual(EXPLOSION_S)
      expect(partPose(p, p.life).scale).toBe(0)
      expect(partPose(p, -1).scale).toBe(0)
      expect(partPose(p, p.life / 2).scale).toBeGreaterThan(0)
    }
  })

  it('goes from bright to dark as it burns out', () => {
    expect(partColor('fire', 0).getHex()).not.toBe(
      partColor('fire', 0.95).getHex(),
    )
    expect(partColor('ember', 0).getHex()).not.toBe(
      partColor('ember', 0.95).getHex(),
    )
    // Made once: the same color every time, not a new one to parse.
    expect(partColor('fire', 0.1)).toBe(partColor('fire', 0.15))
  })
})
