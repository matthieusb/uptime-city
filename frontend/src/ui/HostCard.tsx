import type { HostGroup, VmGroup } from '../domain/hosts'
import EndpointCard from './EndpointCard'
import HostHeader from './HostHeader'

// A host card: the host's header, a separator, then its services. A physical
// host also holds the cards of its vm-hosts, above its own services.
export default function HostCard({
  host,
  services,
  vms = [],
}: VmGroup & Partial<Pick<HostGroup, 'vms'>>) {
  const isVm = host.kind === 'vm'
  return (
    <section
      className={isVm ? 'host-card host-card-vm' : 'host-card'}
      data-testid={isVm ? 'vm-host-card' : 'host-card'}
    >
      <HostHeader host={host} />
      <hr className="host-separator" data-testid="host-separator" />
      {vms.length > 0 && (
        <div className="vm-list">
          {vms.map((vm) => (
            <HostCard key={vm.host.id} {...vm} />
          ))}
        </div>
      )}
      {services.length > 0 && (
        <div className="card-row">
          {services.map((service) => (
            <EndpointCard key={service.id} endpoint={service} />
          ))}
        </div>
      )}
    </section>
  )
}
