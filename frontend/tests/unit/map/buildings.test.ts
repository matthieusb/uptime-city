import { describe, expect, it } from 'vitest'
import {
  BUILDING_WIDTH,
  MAX_BUILDING_WIDTH,
  buildingWidth,
  buildingHeight,
  cityLayout,
  floorBase,
  floorHeight,
  FLOOR_HEIGHT,
  GROUND_HEIGHT,
} from '../../../src/city/layout'

describe('floors', () => {
  it('stacks one floor per service on a taller ground floor', () => {
    expect(floorBase(0)).toBe(0)
    expect(floorHeight(0)).toBe(GROUND_HEIGHT)
    expect(GROUND_HEIGHT).toBeGreaterThan(FLOOR_HEIGHT)
    expect(floorBase(1)).toBe(GROUND_HEIGHT)
    expect(floorHeight(1)).toBe(FLOOR_HEIGHT)
    expect(floorBase(3)).toBeCloseTo(GROUND_HEIGHT + 2 * FLOOR_HEIGHT)
    expect(buildingHeight(3)).toBeCloseTo(GROUND_HEIGHT + 2 * FLOOR_HEIGHT)
  })

  it('still builds a ground floor for a host without services', () => {
    expect(buildingHeight(1)).toBe(GROUND_HEIGHT)
  })
})

describe('building width', () => {
  it('grows with the number of services, up to a maximum', () => {
    expect(buildingWidth(0)).toBe(BUILDING_WIDTH)
    expect(buildingWidth(3)).toBeGreaterThan(buildingWidth(1))
    expect(buildingWidth(50)).toBe(MAX_BUILDING_WIDTH)
  })

  it('gains more every 5 services', () => {
    const step = buildingWidth(5) - buildingWidth(4)
    expect(step).toBeGreaterThan(buildingWidth(4) - buildingWidth(3))
    expect(buildingWidth(10) - buildingWidth(9)).toBeCloseTo(step)
  })

  it('gives each lot the width of its services', () => {
    const { lots } = cityLayout([
      { id: 'a', services: 0 },
      { id: 'b', services: 4 },
    ])
    expect(lots[1].width).toBeGreaterThan(lots[0].width)
    expect(lots[0].width).toBe(BUILDING_WIDTH)
  })
})
