import { describe, expect, it } from 'vitest'
import { allHosts, groupByHost } from '../../../src/domain/hosts'

// A service when it has a host, else a physical host or, with a parent, a vm-host.
const endpoint = (
  id: string,
  host_id: string | null,
  parent_id: string | null = null,
) => ({
  id,
  name: id,
  hostname: id,
  interval_s: 30,
  host_id,
  kind:
    host_id !== null
      ? ('service' as const)
      : parent_id !== null
        ? ('vm' as const)
        : ('physical' as const),
  parent_id,
})

describe('groupByHost', () => {
  it('returns nothing for no endpoints', () => {
    expect(groupByHost([])).toEqual([])
  })

  it('sorts the services of a host and of a vm-host by name', () => {
    const web = endpoint('web', null)
    const vm = endpoint('vm', null, 'web')
    const [z, a, m] = ['z', 'a', 'm'].map((n) => endpoint(n, 'web'))
    const [y, b] = ['y', 'b'].map((n) => endpoint(n, 'vm'))
    const [group] = groupByHost([web, vm, z, y, a, b, m])
    expect(group.services).toEqual([a, m, z])
    expect(group.vms[0].services).toEqual([b, y])
  })

  it('groups services under their host', () => {
    const web = endpoint('web', null)
    const db = endpoint('db', null)
    const http = endpoint('web-http', 'web')
    const ssh = endpoint('web-ssh', 'web')
    const pg = endpoint('db-pg', 'db')
    expect(groupByHost([web, http, ssh, db, pg])).toEqual([
      { host: web, services: [http, ssh], vms: [] },
      { host: db, services: [pg], vms: [] },
    ])
  })

  it('keeps a host without services', () => {
    const lone = endpoint('lone', null)
    expect(groupByHost([lone])).toEqual([{ host: lone, services: [], vms: [] }])
  })

  it('ignores a service whose host is unknown', () => {
    const web = endpoint('web', null)
    expect(groupByHost([web, endpoint('x-http', 'x')])).toEqual([
      { host: web, services: [], vms: [] },
    ])
  })
})

describe('groupByHost with vm-hosts', () => {
  const nas = endpoint('nas', null)
  const nasPg = endpoint('nas-pg', 'nas')
  const vm = endpoint('nas-vm', null, 'nas')
  const vmWeb = endpoint('nas-vm-web', 'nas-vm')
  const vmApi = endpoint('nas-vm-api', 'nas-vm')

  it('nests the vm-hosts and their services in their physical host', () => {
    expect(groupByHost([nas, nasPg, vm, vmWeb, vmApi])).toEqual([
      {
        host: nas,
        services: [nasPg],
        vms: [{ host: vm, services: [vmApi, vmWeb] }],
      },
    ])
  })

  it('keeps a vm-host without services', () => {
    expect(groupByHost([nas, vm])[0].vms).toEqual([{ host: vm, services: [] }])
  })

  it('ignores a vm-host whose physical host is unknown', () => {
    expect(
      groupByHost([
        nas,
        endpoint('x-vm', null, 'x'),
        endpoint('x-vm-web', 'x-vm'),
      ]),
    ).toEqual([{ host: nas, services: [], vms: [] }])
  })
})

describe('allHosts', () => {
  it('lists each physical host, then its vm-hosts', () => {
    const nas = endpoint('nas', null)
    const vm = endpoint('nas-vm', null, 'nas')
    const web = endpoint('web', null)
    expect(allHosts(groupByHost([nas, vm, web])).map((g) => g.host.id)).toEqual(
      ['nas', 'nas-vm', 'web'],
    )
  })
})
