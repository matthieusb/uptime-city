import { describe, expect, it } from 'vitest'
import {
  averageLatency,
  formatAgo,
  formatDateTime,
  MAX_BARS,
  visibleResults,
} from '../../src/domain/checks'

const result = (ts: string, latency_ms: number | null) => ({
  ts,
  success: latency_ms !== null,
  latency_ms,
  error: null,
  host_down: false,
})

describe('formatAgo', () => {
  const now = Date.parse('2026-01-01T01:00:00Z')

  it.each([
    ['2026-01-01T00:59:57Z', '3s ago'],
    ['2026-01-01T00:55:00Z', '5 min ago'],
    ['2026-01-01T00:00:00Z', '1 h ago'],
    ['2025-12-30T01:00:00Z', '2 d ago'],
    ['2026-01-01T01:00:05Z', '0s ago'],
  ])('formats %s as %s', (ts, expected) => {
    expect(formatAgo(ts, now)).toBe(expected)
  })
})

describe('averageLatency', () => {
  it('averages only the checks that have a latency', () => {
    const results = [result('a', 10), result('b', null), result('c', 20)]
    expect(averageLatency(results)).toBe(15)
  })

  it('is null without any latency', () => {
    expect(averageLatency([result('a', null)])).toBeNull()
    expect(averageLatency([])).toBeNull()
  })
})

describe('visibleResults', () => {
  it('keeps the latest MAX_BARS results', () => {
    const results = Array.from({ length: MAX_BARS + 5 }, (_, i) =>
      result(String(i), 1),
    )
    const shown = visibleResults(results)
    expect(shown).toHaveLength(MAX_BARS)
    expect(shown[0].ts).toBe('5')
  })
})

describe('formatDateTime', () => {
  it('formats a timestamp in a human readable way', () => {
    expect(formatDateTime('2026-01-01T00:00:30Z', 'UTC')).toBe(
      '1 Jan 2026, 00:00:30',
    )
  })
})
