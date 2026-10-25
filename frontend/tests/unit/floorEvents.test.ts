import { describe, expect, it } from 'vitest'
import {
  flashOf,
  prune,
  pushFloors,
  type FloorEvent,
} from '../../src/city/effects/floorEvents'

const events = (...floors: number[]): FloorEvent[] =>
  floors.map((floor, n) => ({ floor, start: n }))

describe('flashOf', () => {
  const curve = (age: number) => Math.max(0, 1 - age)

  it('is nothing for a floor with no event', () => {
    expect(flashOf(events(1, 2), 3, 0.5, curve)).toBe(0)
    expect(flashOf([], 1, 0.5, curve)).toBe(0)
  })

  it('follows the curve of the event of the floor', () => {
    expect(flashOf([{ floor: 2, start: 1 }], 2, 1.25, curve)).toBeCloseTo(0.75)
  })

  it('takes the brightest when a floor has several', () => {
    const list = [
      { floor: 2, start: 0 },
      { floor: 2, start: 0.5 },
    ]
    expect(flashOf(list, 2, 0.6, curve)).toBeCloseTo(0.9)
  })
})

describe('pushFloors', () => {
  it('adds an event for each floor, starting now', () => {
    expect(pushFloors([], [1, 3], 5)).toEqual([
      { floor: 1, start: 5 },
      { floor: 3, start: 5 },
    ])
  })

  it('starts a floor over instead of doubling its event', () => {
    const list = pushFloors([{ floor: 1, start: 0 }], [1], 4)
    expect(list).toEqual([{ floor: 1, start: 4 }])
  })

  it('keeps the other floors, and the same list when nothing is added', () => {
    const list = events(1, 2)
    expect(pushFloors(list, [], 9)).toBe(list)
    expect(pushFloors(list, [2], 9)).toEqual([
      { floor: 1, start: 0 },
      { floor: 2, start: 9 },
    ])
  })
})

describe('prune', () => {
  const active = (age: number) => age < 1

  it('drops the events that are over', () => {
    expect(
      prune(
        [
          { floor: 1, start: 0 },
          { floor: 2, start: 2 },
        ],
        2.5,
        active,
      ),
    ).toEqual([{ floor: 2, start: 2 }])
  })

  it('gives back the same list when all are still going, to allocate nothing', () => {
    const list = [{ floor: 1, start: 2 }]
    expect(prune(list, 2.5, active)).toBe(list)
    const none: FloorEvent[] = []
    expect(prune(none, 2.5, active)).toBe(none)
  })
})
