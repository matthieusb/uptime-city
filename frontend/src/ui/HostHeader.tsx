import { useQuery } from '@tanstack/react-query'
import type { EndpointInfo } from '../api/client'
import { historyQuery } from '../api/queries'
import { visibleResults } from '../domain/checks'
import { latestStatus } from '../domain/status'
import CheckBars from './CheckBars'

const KIND_BADGES = { physical: 'physical', vm: 'VM' } as const

export default function HostHeader({ host }: { host: EndpointInfo }) {
  const { data } = useQuery(historyQuery(host))
  const status = latestStatus(data)
  return (
    <header className="host-header" data-testid="host-header">
      <div className="host-title">
        <h2 className="card-title">{host.name}</h2>
        {host.kind !== 'service' && (
          <span className="badge-kind" data-testid="kind-badge">
            {KIND_BADGES[host.kind]}
          </span>
        )}
        {host.hostname !== host.name && (
          <span className="card-meta">{host.hostname}</span>
        )}
        <span className={`status status-${status}`} data-testid="status">
          {status}
        </span>
      </div>
      <CheckBars results={visibleResults(data ?? [])} />
    </header>
  )
}
