import type { CheckResult } from '../api/client'
import { floorStatus, type Status } from './status'
import type { HostGroup, VmGroup } from './hosts'

export interface ServiceCounts {
  up: number
  down: number
  // Not probed yet, or not probed because their host is down.
  unknown: number
}

// The services of a building running correctly, those that are down and those
// with no status yet, as its floors show them.
export function buildingCounts(
  building: VmGroup,
  history: Map<string, CheckResult[] | undefined>,
): ServiceCounts {
  const counts = { up: 0, down: 0, unknown: 0 }
  for (const service of building.services) {
    const status = floorStatus(history.get(service.id))
    counts[status]++
  }
  return counts
}

// The same for a physical host, with the services of its vm-hosts too.
export function hostCounts(
  group: HostGroup,
  history: Map<string, CheckResult[] | undefined>,
): ServiceCounts {
  return [group, ...group.vms]
    .map((building) => buildingCounts(building, history))
    .reduce((a, b) => ({
      up: a.up + b.up,
      down: a.down + b.down,
      unknown: a.unknown + b.unknown,
    }))
}

// The counts of the whole map.
export function totalCounts(
  groups: HostGroup[],
  history: Map<string, CheckResult[] | undefined>,
): ServiceCounts {
  return groups
    .map((group) => hostCounts(group, history))
    .reduce(
      (a, b) => ({
        up: a.up + b.up,
        down: a.down + b.down,
        unknown: a.unknown + b.unknown,
      }),
      { up: 0, down: 0, unknown: 0 },
    )
}

export interface StatusService {
  id: string
  name: string
  hostName: string
  // The host the service runs on, whose building shows it, and the physical host whose tile
  // holds that building: to jump to it.
  buildingId: string
  plateId: string
  status: Status
  results: CheckResult[]
}

// The services of the whole map that a count covers, with the host they run
// on, in the order of the map.
export function servicesWithStatus(
  groups: HostGroup[],
  history: Map<string, CheckResult[] | undefined>,
  status: Status,
): StatusService[] {
  return groups.flatMap((group) =>
    [group, ...group.vms].flatMap((building) =>
      building.services
        .filter((s) => floorStatus(history.get(s.id)) === status)
        .map((s) => ({
          id: s.id,
          name: s.name,
          hostName: building.host.name,
          buildingId: building.host.id,
          plateId: group.host.id,
          status,
          results: history.get(s.id) ?? [],
        })),
    ),
  )
}
