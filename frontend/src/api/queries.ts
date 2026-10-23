import { queryOptions } from '@tanstack/react-query'
import { fetchHistory, type EndpointInfo } from './client'

export const historyQuery = (endpoint: EndpointInfo) =>
  queryOptions({
    queryKey: ['history', endpoint.id],
    queryFn: () => fetchHistory(endpoint.id),
    refetchInterval: Math.max(endpoint.interval_s, 1) * 1000,
  })
