import type { CheckResult } from '../api/client'
import { formatDateTime, MAX_BARS, visibleResults } from '../domain/checks'
import { statusColor } from '../domain/status'

export default function CheckBars({ results }: { results: CheckResult[] }) {
  const shown = visibleResults(results)
  return (
    <div className="bars">
      {Array.from({ length: MAX_BARS - shown.length }, (_, i) => (
        <div
          key={`empty-${i}`}
          className="bar"
          data-testid="empty-bar"
          style={{ backgroundColor: statusColor('unknown') }}
        />
      ))}
      {shown.map((result) => (
        <div
          key={result.ts}
          className="bar"
          data-testid="check-bar"
          style={{
            backgroundColor: statusColor(result.success ? 'up' : 'down'),
          }}
        >
          <div className="bar-tooltip" role="tooltip">
            <div className="bar-tooltip-time">{formatDateTime(result.ts)}</div>
            {result.success ? (
              <div>{result.latency_ms?.toFixed(1)} ms</div>
            ) : (
              <div className="bar-tooltip-error">
                {result.error ?? 'failed'}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
