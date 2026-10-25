import { describe, expect, it } from 'vitest'
import { buildingFloors } from '../../src/domain/floors'

const endpoint = (id: string, name = id) => ({
  id,
  name,
  hostname: id,
  interval_s: 30,
  host_id: null,
  kind: 'service' as const,
  parent_id: null,
})
const result = (success: boolean) => ({
  ts: '2026-01-01T00:00:00Z',
  success,
  latency_ms: 5,
  error: null,
  host_down: false,
})

describe('buildingFloors', () => {
  const group = {
    host: endpoint('nas', 'nas'),
    services: [endpoint('nas-api', 'api'), endpoint('nas-web', 'web')],
  }

  it('lists the services from the top floor down, without the host itself', () => {
    const floors = buildingFloors(group, new Map())
    expect(floors.map((f) => f.name)).toEqual(['api', 'web'])
  })

  it('tells the status of each floor from its last result', () => {
    const history = new Map([
      ['nas', [result(true)]],
      ['nas-api', [result(true), result(false)]],
      ['nas-web', [result(false), result(true)]],
    ])
    expect(buildingFloors(group, history).map((f) => f.status)).toEqual([
      'down',
      'up',
    ])
  })

  it('has an unknown status until a floor is probed', () => {
    expect(buildingFloors(group, new Map()).map((f) => f.status)).toEqual([
      'unknown',
      'unknown',
    ])
  })

  it('gives the checks of each floor, none until it is probed', () => {
    const history = new Map([['nas-web', [result(false), result(true)]]])
    expect(buildingFloors(group, history).map((f) => f.results)).toEqual([
      [],
      [result(false), result(true)],
    ])
  })

  it('has no floor for a host without services', () => {
    expect(
      buildingFloors({ host: group.host, services: [] }, new Map()),
    ).toEqual([])
  })
})
