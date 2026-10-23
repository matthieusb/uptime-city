import type { CheckResult } from '../api/client'
import type { VmGroup } from './hosts'
import { latestStatus, type Status } from './status'

export interface FloorInfo {
  id: string
  name: string
  status: Status
}

// The floors of a building, as the 2D panel lists them: the services from the
// top floor down (the order of the 3D floors), and the host on the ground
// floor.
export function buildingFloors(
  group: VmGroup,
  history: Map<string, CheckResult[] | undefined>,
): { floors: FloorInfo[]; ground: FloorInfo } {
  const floor = (e: { id: string; name: string }): FloorInfo => ({
    id: e.id,
    name: e.name,
    status: latestStatus(history.get(e.id)),
  })
  return { floors: group.services.map(floor), ground: floor(group.host) }
}
