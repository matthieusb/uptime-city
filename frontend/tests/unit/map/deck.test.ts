import { describe, expect, it } from 'vitest'
import { deckSegments } from '../../../src/city/planet/deck'
import { length, type Vec3 } from '../../../src/city/planet/sphere'

describe('deckSegments', () => {
  const points: Vec3[] = [
    [0, 0, 0],
    [3, 0, 0],
    [3, 4, 0],
  ]

  it('has one segment between each two points', () => {
    expect(deckSegments(points)).toHaveLength(2)
    expect(deckSegments([[0, 0, 0]])).toEqual([])
  })

  it('puts each segment at the middle of its two points, as long as they are apart', () => {
    const [first, second] = deckSegments(points)
    expect(first.center).toEqual([1.5, 0, 0])
    expect(first.length).toBeCloseTo(3, 9)
    expect(second.center).toEqual([3, 2, 0])
    expect(second.length).toBeCloseTo(4, 9)
  })

  it('points along the segment with a unit direction', () => {
    const [first, second] = deckSegments(points)
    expect(length(first.direction)).toBeCloseTo(1, 9)
    expect(first.direction).toEqual([1, 0, 0])
    expect(second.direction).toEqual([0, 1, 0])
  })
})
