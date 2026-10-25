import type { CheckResult } from '../api/client'

// Keep in sync with --bar-count in index.css
export const MAX_BARS = 30

export function visibleResults(results: CheckResult[]): CheckResult[] {
  return results.slice(-MAX_BARS)
}

export function formatDateTime(ts: string, timeZone?: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'medium',
    timeZone,
  }).format(new Date(ts))
}
