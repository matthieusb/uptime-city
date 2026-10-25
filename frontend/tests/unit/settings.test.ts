import { expect, it } from 'vitest'
import { DEFAULT_DENSITIES } from '../../src/city/effects'
import {
  decodeDensities,
  decodeDetail,
  decodeEffects,
  decodeLabels,
  encodeSet,
} from '../../src/city/settings'
import { decodeRefresh } from '../../src/ui/RefreshSelector'

it('decodes a stored list of labels or effects, dropping unknown kinds', () => {
  expect([...decodeLabels(['host', 'vm', 'gone'])!]).toEqual(['host', 'vm'])
  expect([...decodeEffects(['clouds', 'gone'])!]).toEqual(['clouds'])
  // An empty list is a real choice: everything unchecked.
  expect(decodeLabels([])!.size).toBe(0)
  expect(decodeLabels('host')).toBeUndefined()
  expect(decodeEffects(null)).toBeUndefined()
})

it('encodes a set as a list', () => {
  expect(encodeSet(new Set(['a', 'b']))).toEqual(['a', 'b'])
})

it('decodes the densities, keeping only numbers inside the slider range', () => {
  expect(decodeDensities({ vehicles: 0.5, clouds: 2 })).toEqual({
    vehicles: 0.5,
    clouds: 2,
  })
  expect(decodeDensities({ vehicles: 0.5 })).toEqual({
    ...DEFAULT_DENSITIES,
    vehicles: 0.5,
  })
  expect(decodeDensities({ vehicles: 9, clouds: 'x' })).toEqual(
    DEFAULT_DENSITIES,
  )
  expect(decodeDensities(3)).toBeUndefined()
})

it('decodes the detail level, only a number from 0 to 100', () => {
  expect(decodeDetail(0)).toBe(0)
  expect(decodeDetail(40)).toBe(40)
  expect(decodeDetail(101)).toBeUndefined()
  expect(decodeDetail('40')).toBeUndefined()
})

it('decodes the refresh mode, only a known one', () => {
  expect(decodeRefresh('10s')).toBe('10s')
  expect(decodeRefresh('sync')).toBe('sync')
  expect(decodeRefresh('2s')).toBeUndefined()
  expect(decodeRefresh(10)).toBeUndefined()
})
