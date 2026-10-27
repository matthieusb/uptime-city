import { describe, expect, it } from 'vitest'
import {
  BUILDING_WIDTH,
  buildingHeight,
  serviceLabelSides,
  type Lot,
} from '../../../src/city/layout'

describe('serviceLabelSides', () => {
  // A lot standing `column` tiles to the right of the origin on screen, at
  // the same depth.
  const lot = (id: string, column: number, floors: number): Lot => ({
    id,
    x: (column * Math.SQRT2) / 2,
    z: (-column * Math.SQRT2) / 2,
    floors,
    height: buildingHeight(floors),
    width: BUILDING_WIDTH,
  })

  it('puts the labels on the right of a lone building', () => {
    expect(serviceLabelSides([lot('a', 0, 4)]).get('a')).toBe('right')
  })

  it('puts the labels on the side without a building in the way', () => {
    const right = serviceLabelSides([lot('a', 0, 4), lot('b', 6, 6)])
    expect(right.get('a')).toBe('left')
    const left = serviceLabelSides([lot('a', 0, 4), lot('b', -6, 6)])
    expect(left.get('a')).toBe('right')
  })

  it('ignores a building too low to be in the way', () => {
    // Its roof is below the labels of every floor.
    const low = { ...lot('b', 6, 0), height: 0.6 }
    const sides = serviceLabelSides([lot('a', 0, 6), low])
    expect(sides.get('a')).toBe('right')
  })

  it('ignores a building too far to be reached', () => {
    expect(serviceLabelSides([lot('a', 0, 4), lot('b', 60, 6)]).get('a')).toBe(
      'right',
    )
  })
})
