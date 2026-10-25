import { useEffect, useState } from 'react'

export type RefreshMode = '10s' | '30s' | '1m' | '5m' | 'sync'

export const REFRESH_PERIODS_MS: Record<
  Exclude<RefreshMode, 'sync'>,
  number
> = {
  '10s': 10_000,
  '30s': 30_000,
  '1m': 60_000,
  '5m': 300_000,
}

// Reads back a stored mode (see `usePersistentState`), undefined if unknown.
export const decodeRefresh = (raw: unknown): RefreshMode | undefined =>
  raw === 'sync' || (typeof raw === 'string' && raw in REFRESH_PERIODS_MS)
    ? (raw as RefreshMode)
    : undefined

const OPTIONS: { id: Exclude<RefreshMode, 'sync'>; label: string }[] = [
  { id: '10s', label: '10s' },
  { id: '30s', label: '30s' },
  { id: '1m', label: '1min' },
  { id: '5m', label: '5min' },
]

// How long the title breathes when a refresh begins (see `index.css`).
const BREATH_MS = 3000

function secondsUntil(at: number): number {
  return Math.max(0, Math.ceil((at - Date.now()) / 1000))
}

// "in x seconds" before the next refresh, counting down.
function Countdown({ at }: { at: number }) {
  const [seconds, setSeconds] = useState(() => secondsUntil(at))
  useEffect(() => {
    const timer = setInterval(() => setSeconds(secondsUntil(at)), 500)
    return () => clearInterval(timer)
  }, [at])
  return (
    <span data-testid="refresh-countdown">
      in {seconds} {seconds === 1 ? 'second' : 'seconds'}
    </span>
  )
}

// A box of the 3D view's menus: picks how often the 3D view reloads the statuses. Syncing with the
// simulation only makes sense while the backend simulates.
export default function RefreshSelector({
  value,
  simulation,
  nextRefreshAt,
  refreshStartedAt,
  onChange,
}: {
  value: RefreshMode
  simulation: boolean
  // When the next refresh comes (a timestamp in ms), if one is planned.
  nextRefreshAt: number | null
  // When the last refresh began: the title breathes to bold for a moment.
  refreshStartedAt: number | null
  onChange: (mode: RefreshMode) => void
}) {
  return (
    <div
      className="city-legend"
      role="group"
      aria-label="Refresh menu"
      data-testid="refresh-menu"
    >
      <div className="city-legend-title">
        <span
          key={refreshStartedAt}
          className={
            refreshStartedAt !== null &&
            Date.now() - refreshStartedAt < BREATH_MS
              ? 'refresh-breathing'
              : undefined
          }
        >
          Refresh
        </span>
        {nextRefreshAt !== null && (
          <Countdown key={nextRefreshAt} at={nextRefreshAt} />
        )}
      </div>
      <select
        aria-label="Refresh"
        value={value}
        onChange={(event) => onChange(event.target.value as RefreshMode)}
      >
        {OPTIONS.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
        {simulation && <option value="sync">Sync with simulation</option>}
      </select>
    </div>
  )
}
