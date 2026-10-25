import { describe, expect, it } from 'vitest'
import {
  FIRE_STAGES,
  fireStage,
  flameSlots,
  smokeStage,
} from '../../src/city/effects/fireShape'
import { floorBase } from '../../src/city/layout'

describe('fireStage', () => {
  it('goes from yellow through orange and red to smoke as a flame burns out', () => {
    const stages = [0, 0.2, 0.45, 0.7, 0.9].map(fireStage)
    expect(stages).toEqual([...stages].sort((a, b) => a - b))
    expect(new Set(stages).size).toBe(FIRE_STAGES.fire.length)
    expect(fireStage(0)).toBe(0)
    expect(fireStage(0.99)).toBe(FIRE_STAGES.fire.length - 1)
  })

  it('has fewer stages for smoke: a few embers, then dust', () => {
    expect(smokeStage(0)).toBe(0)
    expect(smokeStage(0.3)).toBe(1)
    expect(smokeStage(0.9)).toBe(2)
    expect(FIRE_STAGES.smoke).toHaveLength(3)
  })

  it('gives each stage a color of its own, made once', () => {
    for (const stages of [FIRE_STAGES.fire, FIRE_STAGES.smoke]) {
      expect(new Set(stages.map((c) => c.getHexString())).size).toBe(
        stages.length,
      )
    }
  })
})

describe('flameSlots', () => {
  it('has the foot of each burning floor, and nothing for the others', () => {
    expect(flameSlots([false, true, false, true])).toEqual([
      null,
      floorBase(1),
      null,
      floorBase(3),
    ])
  })

  it('is empty-handed when nothing burns', () => {
    expect(flameSlots([false, false]).every((slot) => slot === null)).toBe(true)
  })
})
