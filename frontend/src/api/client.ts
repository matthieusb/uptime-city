import type { components, paths } from './types'

export type EndpointInfo = components['schemas']['EndpointInfo']
export type Info = components['schemas']['Info']
export type CheckResult = components['schemas']['ProbeResult']

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path)
  if (!response.ok) throw new Error(`${path}: ${response.status}`)
  return response.json() as Promise<T>
}

// The commands that only the simulation takes: redraw the statuses now, or start or stop their
// redrawing by themselves.
async function postSimulation(
  action: 'refresh' | 'start' | 'stop',
): Promise<Info> {
  const path = `/api/v1/simulation/${action}`
  const response = await fetch(path, { method: 'POST' })
  if (!response.ok) throw new Error(`${path}: ${response.status}`)
  return response.json() as Promise<Info>
}

export type SimulationAction =
  paths['/api/v1/simulation/actions/{action}']['post']['parameters']['path']['action']

// An event of the stopped simulation, made by hand: some take a number of services.
export async function actOnSimulation(
  action: SimulationAction,
  count?: number,
): Promise<Info> {
  const path = `/api/v1/simulation/actions/${action}`
  const url = count === undefined ? path : `${path}?count=${count}`
  const response = await fetch(url, { method: 'POST' })
  if (!response.ok) throw new Error(`${path}: ${response.status}`)
  return response.json() as Promise<Info>
}

export const refreshSimulation = () => postSimulation('refresh')
export const startSimulation = () => postSimulation('start')
export const stopSimulation = () => postSimulation('stop')

export const fetchInfo = () => getJson<Info>('/api/v1/info')

export const fetchEndpoints = () => getJson<EndpointInfo[]>('/api/v1/endpoints')

export const fetchHistory = (id: string) =>
  getJson<CheckResult[]>(
    `/api/v1/endpoints/${encodeURIComponent(id)}/history?limit=50`,
  )
