import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import type { EndpointInfo } from '../api/client'
import { historyQuery } from '../api/queries'
import { averageLatency, formatAgo, visibleResults } from '../domain/checks'
import { isHostDown } from '../domain/status'
import Card from './Card'
import CheckBars from './CheckBars'

function useNow(): number {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  return now
}

export default function EndpointCard({ endpoint }: { endpoint: EndpointInfo }) {
  const { data } = useQuery(historyQuery(endpoint))
  const now = useNow()
  const results = visibleResults(data ?? [])
  const average = averageLatency(results)
  return (
    <Card
      title={endpoint.name}
      testId="service-card"
      aside={
        <span className="card-aside">
          {isHostDown(data) && (
            <span className="badge-host-down" data-testid="host-down-badge">
              host down
            </span>
          )}
          <span className="card-meta" data-testid="average-latency">
            {average === null ? '–' : `${average.toFixed(1)} ms`}
          </span>
        </span>
      }
    >
      <CheckBars results={results} />
      {results.length > 0 && (
        <footer className="card-footer card-meta">
          <span data-testid="oldest-ping">{formatAgo(results[0].ts, now)}</span>
          <span data-testid="latest-ping">
            {formatAgo(results[results.length - 1].ts, now)}
          </span>
        </footer>
      )}
    </Card>
  )
}
