import type { CheckResult } from '../api/client'

// Keep in sync with --bar-count in index.css
export const MAX_BARS = 30

export function visibleResults(results: CheckResult[]): CheckResult[] {
  return results.slice(-MAX_BARS)
}

export function averageLatency(results: CheckResult[]): number | null {
  const latencies = results.flatMap((r) =>
    r.latency_ms == null ? [] : [r.latency_ms],
  )
  if (latencies.length === 0) return null
  return latencies.reduce((sum, v) => sum + v, 0) / latencies.length
}

export function formatAgo(ts: string, now: number): string {
  const seconds = Math.max(0, Math.floor((now - Date.parse(ts)) / 1000))
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`
  return `${Math.floor(seconds / 86400)} d ago`
}

export function formatDateTime(ts: string, timeZone?: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'medium',
    timeZone,
  }).format(new Date(ts))
}
