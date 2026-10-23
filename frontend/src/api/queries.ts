import { queryOptions } from '@tanstack/react-query'
import { fetchHistory, fetchHostSummaries, type EndpointInfo } from './client'

export const historyQuery = (endpoint: EndpointInfo) =>
  queryOptions({
    queryKey: ['history', endpoint.id],
    queryFn: () => fetchHistory(endpoint.id),
    refetchInterval: Math.max(endpoint.interval_s, 1) * 1000,
  })

// The counts of services up and down per physical host, computed by the
// backend.
export const hostSummariesQuery = queryOptions({
  queryKey: ['host-summaries'],
  queryFn: fetchHostSummaries,
  refetchInterval: 10_000,
})
