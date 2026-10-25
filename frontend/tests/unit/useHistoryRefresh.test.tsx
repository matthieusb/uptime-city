import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import {
  afterEach,
  beforeEach,
  expect,
  it,
  vi,
  type MockInstance,
} from 'vitest'
import { useHistoryRefresh } from '../../src/ui/useHistoryRefresh'

let client: QueryClient
let invalidate: MockInstance<QueryClient['invalidateQueries']>

beforeEach(() => {
  vi.useFakeTimers()
  client = new QueryClient()
  invalidate = vi.spyOn(client, 'invalidateQueries')
})
afterEach(() => vi.useRealTimers())

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
)

const historyCalls = () =>
  invalidate.mock.calls.filter(
    ([filter]) =>
      JSON.stringify((filter as { queryKey: unknown }).queryKey) ===
      '["history"]',
  ).length

it('refreshes the history at the chosen period', () => {
  renderHook(() => useHistoryRefresh('10s', null), { wrapper })

  vi.advanceTimersByTime(9_000)
  expect(historyCalls()).toBe(0)
  vi.advanceTimersByTime(1_000)
  expect(historyCalls()).toBe(1)
  vi.advanceTimersByTime(20_000)
  expect(historyCalls()).toBe(3)
})

it('follows a change of period', () => {
  const { rerender } = renderHook(
    ({ mode }: { mode: '10s' | '1m' }) => useHistoryRefresh(mode, null),
    { wrapper, initialProps: { mode: '10s' } },
  )
  rerender({ mode: '1m' })

  vi.advanceTimersByTime(30_000)
  expect(historyCalls()).toBe(0)
  vi.advanceTimersByTime(30_000)
  expect(historyCalls()).toBe(1)
})

it('refreshes right after the simulation changes its statuses when synced', () => {
  const deadline = Date.now() + 20_000
  renderHook(() => useHistoryRefresh('sync', deadline), { wrapper })

  vi.advanceTimersByTime(20_000)
  expect(historyCalls()).toBe(0)
  vi.advanceTimersByTime(2_000)
  expect(historyCalls()).toBe(1)
})

it('waits for the deadline when synced, without one it does nothing', () => {
  renderHook(() => useHistoryRefresh('sync', null), { wrapper })

  vi.advanceTimersByTime(600_000)
  expect(historyCalls()).toBe(0)
})

it('tells when the next refresh comes', () => {
  const { result } = renderHook(() => useHistoryRefresh('30s', null), {
    wrapper,
  })
  const start = Date.now()
  expect(result.current.nextAt).toBe(start + 30_000)

  act(() => {
    vi.advanceTimersByTime(30_000)
  })
  expect(result.current.nextAt).toBe(start + 60_000)
})

it('tells when the synced refresh comes, once the simulation has redrawn', () => {
  const deadline = Date.now() + 20_000
  const { result } = renderHook(() => useHistoryRefresh('sync', deadline), {
    wrapper,
  })
  expect(result.current.nextAt).toBe(deadline + 1_000)
})

it('tells nothing when synced without a deadline', () => {
  const sync = renderHook(() => useHistoryRefresh('sync', null), {
    wrapper,
  })
  expect(sync.result.current.nextAt).toBeNull()
})

it('tells when the last refresh began', () => {
  const { result } = renderHook(() => useHistoryRefresh('10s', null), {
    wrapper,
  })
  expect(result.current.startedAt).toBeNull()

  act(() => {
    vi.advanceTimersByTime(10_000)
  })
  expect(result.current.startedAt).toBe(Date.now())
})

it('tells when a synced refresh began', () => {
  const deadline = Date.now() + 5_000
  const { result } = renderHook(() => useHistoryRefresh('sync', deadline), {
    wrapper,
  })

  act(() => {
    vi.advanceTimersByTime(6_000)
  })
  expect(result.current.startedAt).toBe(Date.now())
})
