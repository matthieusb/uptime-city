import type { EndpointInfo } from '../api/client'

// A host and the services that run on it.
export interface VmGroup {
  host: EndpointInfo
  services: EndpointInfo[]
}

// A physical host: its own services, and the vm-hosts that run on it.
export interface HostGroup extends VmGroup {
  vms: VmGroup[]
}

// Physical hosts are the top layer. A vm-host is listed under the physical
// host it points to with `parent_id`, and a service under the host it points
// to with `host_id`. A vm-host or a service whose host is missing from the
// list is dropped.
export function groupByHost(endpoints: EndpointInfo[]): HostGroup[] {
  const groups = new Map<string, HostGroup>()
  const vms = new Map<string, VmGroup>()
  for (const endpoint of endpoints) {
    if (endpoint.kind === 'physical') {
      groups.set(endpoint.id, { host: endpoint, services: [], vms: [] })
    }
  }
  for (const endpoint of endpoints) {
    const parent = groups.get(endpoint.parent_id ?? '')
    if (endpoint.kind === 'vm' && parent) {
      const vm = { host: endpoint, services: [] }
      vms.set(endpoint.id, vm)
      parent.vms.push(vm)
    }
  }
  for (const endpoint of endpoints) {
    if (endpoint.kind !== 'service') continue
    const host =
      groups.get(endpoint.host_id ?? '') ?? vms.get(endpoint.host_id ?? '')
    host?.services.push(endpoint)
  }
  return [...groups.values()]
}

// Every host with its services, each physical host followed by its vm-hosts.
export function allHosts(groups: HostGroup[]): VmGroup[] {
  return groups.flatMap((group) => [group, ...group.vms])
}
