import { describe, expect, it } from 'vitest'
import type { CheckResult, EndpointInfo } from '../../src/api/client'
import {
  buildingCounts,
  hostCounts,
  servicesWithStatus,
  totalCounts,
} from '../../src/domain/counts'
import { groupByHost } from '../../src/domain/hosts'

const endpoint = (
  id: string,
  kind: EndpointInfo['kind'],
  link: Partial<EndpointInfo> = {},
): EndpointInfo => ({
  id,
  name: id,
  hostname: id,
  interval_s: 10,
  host_id: null,
  parent_id: null,
  kind,
  ...link,
})

const result = (success: boolean, host_down = false): CheckResult => ({
  ts: '2026-01-01T00:00:00Z',
  success,
  host_down,
  error: null,
  latency_ms: 1,
})

const groups = groupByHost([
  endpoint('srv', 'physical'),
  endpoint('vm', 'vm', { parent_id: 'srv' }),
  endpoint('a', 'service', { host_id: 'srv' }),
  endpoint('b', 'service', { host_id: 'srv' }),
  endpoint('c', 'service', { host_id: 'vm' }),
  endpoint('d', 'service', { host_id: 'vm' }),
])

describe('service counts', () => {
  const history = new Map<string, CheckResult[] | undefined>([
    ['a', [result(false), result(true)]],
    ['b', [result(false)]],
    ['c', [result(true)]],
    // Not probed yet.
    ['d', undefined],
  ])

  it('counts the services right on a building by their latest result', () => {
    expect(buildingCounts(groups[0], history)).toEqual({
      up: 1,
      down: 1,
      unknown: 0,
    })
    expect(buildingCounts(groups[0].vms[0], history)).toEqual({
      up: 1,
      down: 0,
      unknown: 1,
    })
  })

  it('adds the services of the vm-hosts to those of a physical host', () => {
    expect(hostCounts(groups[0], history)).toEqual({
      up: 2,
      down: 1,
      unknown: 1,
    })
  })

  it('counts the services not probed yet or skipped because their host is down as unknown', () => {
    const skipped = new Map(history).set('b', [result(false, true)])
    expect(hostCounts(groups[0], skipped)).toEqual({
      up: 2,
      down: 0,
      unknown: 2,
    })
  })
})

describe('whole map', () => {
  const history = new Map<string, CheckResult[] | undefined>([
    ['a', [result(true)]],
    ['b', [result(false)]],
    ['c', [result(true)]],
    ['d', undefined],
  ])

  it('adds the counts of every physical host', () => {
    const other = groupByHost([
      endpoint('nas', 'physical'),
      endpoint('x', 'service', { host_id: 'nas' }),
    ])
    const more = new Map(history).set('x', [result(false, true)])
    expect(totalCounts([...groups, ...other], more)).toEqual({
      up: 2,
      down: 1,
      unknown: 2,
    })
  })

  it('is all zeros without any host', () => {
    expect(totalCounts([], new Map())).toEqual({ up: 0, down: 0, unknown: 0 })
  })

  it('lists the services with a status, with their host, vm-hosts included', () => {
    expect(
      servicesWithStatus(groups, history, 'up').map((s) => [
        s.name,
        s.hostName,
      ]),
    ).toEqual([
      ['a', 'srv'],
      ['c', 'vm'],
    ])
    expect(
      servicesWithStatus(groups, history, 'down').map((s) => s.id),
    ).toEqual(['b'])
    expect(
      servicesWithStatus(groups, history, 'unknown').map((s) => s.status),
    ).toEqual(['unknown'])
  })

  it('tells the building and the tile of each service, for a jump to it', () => {
    expect(
      servicesWithStatus(groups, history, 'up').map((s) => [
        s.id,
        s.buildingId,
        s.plateId,
      ]),
    ).toEqual([
      ['a', 'srv', 'srv'],
      ['c', 'vm', 'srv'],
    ])
  })

  it('lists a service skipped because its host is down as unknown', () => {
    const skipped = new Map(history).set('b', [result(false, true)])
    expect(servicesWithStatus(groups, skipped, 'down')).toEqual([])
    expect(
      servicesWithStatus(groups, skipped, 'unknown').map((s) => s.id),
    ).toEqual(['b', 'd'])
  })

  it('lists only the services of the tile it is given, vm-hosts included', () => {
    const two = groupByHost([
      endpoint('srv', 'physical'),
      endpoint('vm', 'vm', { parent_id: 'srv' }),
      endpoint('a', 'service', { host_id: 'srv' }),
      endpoint('c', 'service', { host_id: 'vm' }),
      endpoint('other', 'physical'),
      endpoint('z', 'service', { host_id: 'other' }),
    ])
    const ups = new Map(
      ['a', 'c', 'z'].map(
        (id) => [id, [result(true)]] as [string, CheckResult[]],
      ),
    )

    expect(servicesWithStatus([two[0]], ups, 'up').map((s) => s.id)).toEqual([
      'a',
      'c',
    ])
  })
})
