import { describe, expect, it } from 'vitest'
import {
  BADGE_BREATH_MIN,
  BADGE_BREATH_S,
  badgeBreath,
  buildingGlow,
  buildingState,
  floorStatus,
  isHostDown,
  latestStatus,
  nukedState,
  statusColor,
} from '../../../src/domain/status'

const result = (success: boolean) => ({
  ts: '2026-01-01T00:00:00Z',
  success,
  latency_ms: success ? 1 : null,
  error: success ? null : 'no reply',
  host_down: false,
})

describe('statusColor', () => {
  it('maps each status to a color', () => {
    expect(statusColor('up')).toBe('#2ecc71')
    expect(statusColor('down')).toBe('#e74c3c')
    expect(statusColor('unknown')).toBe('#95a5a6')
  })
})

describe('latestStatus', () => {
  it('is unknown without any check', () => {
    expect(latestStatus(undefined)).toBe('unknown')
    expect(latestStatus([])).toBe('unknown')
  })

  it('follows the latest check', () => {
    expect(latestStatus([result(false), result(true)])).toBe('up')
    expect(latestStatus([result(true), result(false)])).toBe('down')
  })
})

describe('buildingGlow', () => {
  const samples = (status: 'up' | 'down' | 'unknown') =>
    Array.from({ length: 200 }, (_, i) => buildingGlow(status, i * 0.05))

  it('breathes softly in green when up', () => {
    const glows = samples('up')
    const intensities = glows.map((g) => g.intensity)
    expect(glows.every((g) => g.color === statusColor('up'))).toBe(true)
    expect(Math.max(...intensities)).toBeLessThanOrEqual(0.5)
    expect(Math.max(...intensities) - Math.min(...intensities)).toBeGreaterThan(
      0.1,
    )
    expect(glows.every((g) => !g.onFire)).toBe(true)
  })

  it('burns and blinks slowly in red when down', () => {
    const glows = samples('down')
    const intensities = glows.map((g) => g.intensity)
    expect(glows.every((g) => g.color === statusColor('down'))).toBe(true)
    expect(Math.max(...intensities)).toBeGreaterThan(0.8)
    expect(Math.min(...intensities)).toBeLessThan(0.3)
    expect(glows.every((g) => g.onFire)).toBe(true)
  })

  it('blinks slower than once per second', () => {
    // Half a second apart is never a full blink cycle.
    expect(buildingGlow('down', 0).intensity).not.toBeCloseTo(
      buildingGlow('down', 0.5).intensity,
    )
  })

  it('does not glow when unknown', () => {
    expect(samples('unknown').every((g) => g.intensity === 0)).toBe(true)
  })
})

describe('isHostDown', () => {
  it('is false without results', () => {
    expect(isHostDown(undefined)).toBe(false)
    expect(isHostDown([])).toBe(false)
  })

  it('follows the latest result only', () => {
    const hostDown = { ...result(false), host_down: true }
    expect(isHostDown([result(true), hostDown])).toBe(true)
    expect(isHostDown([hostDown, result(true)])).toBe(false)
    expect(isHostDown([result(false)])).toBe(false)
  })
})

describe('floorStatus', () => {
  const hostDown = { ...result(false), host_down: true }

  it('follows the latest check of its service', () => {
    expect(floorStatus(undefined)).toBe('unknown')
    expect(floorStatus([result(false), result(true)])).toBe('up')
    expect(floorStatus([result(true), result(false)])).toBe('down')
  })

  it('is not down when only its host is down', () => {
    expect(floorStatus([result(true), hostDown])).toBe('unknown')
  })
})

describe('buildingState', () => {
  const hostDown = { ...result(false), host_down: true }

  it('puts the host on the ground floor, then one floor per service', () => {
    const state = buildingState(
      [result(true)],
      [[result(true)], [result(false)], undefined],
    )
    expect(state.collapsed).toBe(false)
    expect(state.floors).toEqual(['up', 'up', 'down', 'unknown'])
  })

  it('burns only the floors whose own service is down', () => {
    const state = buildingState(
      [result(true)],
      [[result(true)], [result(false)], [hostDown]],
    )
    expect(state.burning).toEqual([false, false, true, false])
  })

  it('collapses when the host itself is down, with nothing left to burn', () => {
    const state = buildingState([result(false)], [[hostDown], [result(false)]])
    expect(state.collapsed).toBe(true)
    expect(state.burning).toEqual([false, false, false])
  })

  it('stands while the host has no check yet', () => {
    const state = buildingState(undefined, [])
    expect(state.collapsed).toBe(false)
    expect(state.floors).toEqual(['unknown'])
  })
})

describe('nukedState', () => {
  it('ruins every floor of a building and burns none', () => {
    expect(nukedState(3)).toEqual({
      collapsed: true,
      floors: ['down', 'down', 'down'],
      burning: [false, false, false],
    })
  })
})

describe('badgeBreath', () => {
  it('only dims the badge a little, with the period of the green glow', () => {
    const samples = Array.from({ length: 400 }, (_, i) => badgeBreath(i / 100))
    expect(Math.min(...samples)).toBeCloseTo(BADGE_BREATH_MIN, 2)
    expect(Math.max(...samples)).toBeCloseTo(1, 2)
    expect(badgeBreath(0)).toBeCloseTo(badgeBreath(BADGE_BREATH_S), 6)
  })
})
