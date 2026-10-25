import { act, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { usePersistentState } from '../../../src/ui/usePersistentState'

afterEach(() => vi.restoreAllMocks())

const asNumber = (raw: unknown) => (typeof raw === 'number' ? raw : undefined)

it('starts at the fallback when nothing is stored', () => {
  const { result } = renderHook(() => usePersistentState('k', 5, asNumber))
  expect(result.current[0]).toBe(5)
})

it('stores each change and restores it on the next load', () => {
  const first = renderHook(() => usePersistentState('k', 5, asNumber))
  act(() => first.result.current[1](8))
  expect(first.result.current[0]).toBe(8)
  first.unmount()

  const second = renderHook(() => usePersistentState('k', 5, asNumber))
  expect(second.result.current[0]).toBe(8)
})

it('accepts an updater function', () => {
  const { result } = renderHook(() => usePersistentState('k', 5, asNumber))
  act(() => result.current[1]((now) => now + 1))
  expect(result.current[0]).toBe(6)
})

it('goes through encode and decode, for values JSON cannot hold', () => {
  const options = {
    encode: (v: ReadonlySet<string>) => [...v],
    decode: (raw: unknown) =>
      Array.isArray(raw) ? new Set(raw.map(String)) : undefined,
  }
  const first = renderHook(() =>
    usePersistentState<ReadonlySet<string>>(
      'k',
      new Set(['a']),
      options.decode,
      options.encode,
    ),
  )
  act(() => first.result.current[1](new Set(['b', 'c'])))
  first.unmount()

  const second = renderHook(() =>
    usePersistentState<ReadonlySet<string>>(
      'k',
      new Set(['a']),
      options.decode,
      options.encode,
    ),
  )
  expect([...second.result.current[0]]).toEqual(['b', 'c'])
})

it('falls back when the stored value is not valid JSON or is rejected by decode', () => {
  localStorage.setItem('k', '{not json')
  expect(
    renderHook(() => usePersistentState('k', 5, asNumber)).result.current[0],
  ).toBe(5)

  localStorage.setItem('k', JSON.stringify('text'))
  expect(
    renderHook(() => usePersistentState('k', 5, asNumber)).result.current[0],
  ).toBe(5)
})

it('still works when the storage is not available', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('blocked')
  })
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('blocked')
  })
  const { result } = renderHook(() => usePersistentState('k', 5, asNumber))
  expect(result.current[0]).toBe(5)
  act(() => result.current[1](7))
  expect(result.current[0]).toBe(7)
})
