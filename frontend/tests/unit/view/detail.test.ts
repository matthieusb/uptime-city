import { expect, it } from 'vitest'
import {
  DEFAULT_DENSITIES,
  DEFAULT_EFFECTS,
  DENSITY_MAX,
  EFFECT_KINDS,
} from '../../../src/city/effects'
import {
  DETAIL_MAX,
  DETAIL_MIN,
  NORMAL_DETAIL,
  detailSettings,
} from '../../../src/city/detail'
import { ALL_LABELS, DEFAULT_LABELS } from '../../../src/city/labels'

it('unchecks everything and sets every slider to 0 at 0%', () => {
  expect(DETAIL_MIN).toBe(0)
  const { labels, effects, densities } = detailSettings(0)
  expect(labels.size).toBe(0)
  expect(effects.size).toBe(0)
  expect(densities).toEqual({ vehicles: 0, clouds: 0 })
})

it('checks everything and sets every slider to its max at 100%', () => {
  expect(DETAIL_MAX).toBe(100)
  const { labels, effects, densities } = detailSettings(100)
  expect(labels).toEqual(ALL_LABELS)
  expect(effects).toEqual(DEFAULT_EFFECTS)
  expect(densities).toEqual({ vehicles: DENSITY_MAX, clouds: DENSITY_MAX })
})

it('checks more boxes and raises the sliders as the level goes up', () => {
  const checked = (level: number) => {
    const { labels, effects } = detailSettings(level)
    return labels.size + effects.size
  }
  for (let level = 1; level <= DETAIL_MAX; level++) {
    expect(checked(level)).toBeGreaterThanOrEqual(checked(level - 1))
    expect(detailSettings(level).densities.vehicles).toBeGreaterThanOrEqual(
      detailSettings(level - 1).densities.vehicles,
    )
  }
  // Some boxes are checked at a middle level, not all or none.
  const middle = checked(NORMAL_DETAIL / 2)
  expect(middle).toBeGreaterThan(0)
  expect(middle).toBeLessThan(ALL_LABELS.size + EFFECT_KINDS.length)
})

it('never unchecks a box that a lower level checked', () => {
  for (let level = 1; level <= DETAIL_MAX; level++) {
    const before = detailSettings(level - 1)
    const now = detailSettings(level)
    for (const kind of before.labels) expect(now.labels.has(kind)).toBe(true)
    for (const kind of before.effects) expect(now.effects.has(kind)).toBe(true)
  }
})

it('matches the menus at first at the normal level', () => {
  const { labels, effects, densities } = detailSettings(NORMAL_DETAIL)
  expect(labels).toEqual(DEFAULT_LABELS)
  expect(effects).toEqual(DEFAULT_EFFECTS)
  expect(densities).toEqual(DEFAULT_DENSITIES)
})

it('keeps the densities on the steps of the density sliders', () => {
  for (let level = 0; level <= DETAIL_MAX; level++) {
    for (const value of Object.values(detailSettings(level).densities)) {
      expect(value * 4).toBe(Math.round(value * 4))
    }
  }
})
