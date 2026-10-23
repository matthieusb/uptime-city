import type { CheckResult } from '../api/client'
import type { VmGroup } from './hosts'
import { latestStatus, type Status } from './status'

export interface FloorInfo {
  id: string
  name: string
  status: Status
}

// The floors of a building, as the 2D panel lists them: its services, from the
// top floor down (the order of the 3D floors). The check of the host itself is
// not one of them.
export function buildingFloors(
  group: VmGroup,
  history: Map<string, CheckResult[] | undefined>,
): FloorInfo[] {
  return group.services.map((service) => ({
    id: service.id,
    name: service.name,
    status: latestStatus(history.get(service.id)),
  }))
}
