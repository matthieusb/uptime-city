import { describe, expect, it } from 'vitest'
import {
  formatDateTime,
  MAX_BARS,
  visibleResults,
} from '../../../src/domain/checks'

const result = (ts: string, latency_ms: number | null) => ({
  ts,
  success: latency_ms !== null,
  latency_ms,
  error: null,
  host_down: false,
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
