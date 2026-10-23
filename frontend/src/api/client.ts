import type { components } from './types'

export type EndpointInfo = components['schemas']['EndpointInfo']
export type HostSummary = components['schemas']['HostSummary']
export type CheckResult = components['schemas']['ProbeResult']

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path)
  if (!response.ok) throw new Error(`${path}: ${response.status}`)
  return response.json() as Promise<T>
}

export const fetchEndpoints = () => getJson<EndpointInfo[]>('/api/v1/endpoints')

export const fetchHistory = (id: string) =>
  getJson<CheckResult[]>(
    `/api/v1/endpoints/${encodeURIComponent(id)}/history?limit=50`,
  )

export const fetchHostSummaries = () =>
  getJson<HostSummary[]>('/api/v1/hosts/summary')
