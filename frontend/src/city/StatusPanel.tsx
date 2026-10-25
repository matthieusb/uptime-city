import { useRef } from 'react'
import type { StatusService } from '../domain/counts'
import type { Status } from '../domain/status'
import CheckBars from '../ui/CheckBars'
import MarqueeText from '../ui/MarqueeText'
import ServiceGraph from './ServiceGraph'
import { useServiceGraph } from './useServiceGraph'

// A 2D view over the 3D view of the services a badge counts, each with the
// host it runs on and its last checks as bars. The building icon left of a
// service goes to the building that holds the service, and the graph icon next to it opens the
// graph of its response times beside the panel.
export default function StatusPanel({
  status,
  services,
  onSelect,
}: {
  status: Status
  services: StatusService[]
  onSelect?: (service: StatusService) => void
}) {
  // Its graph opens on the right of the panel.
  const anchor = useRef<HTMLElement>(null)
  const graph = useServiceGraph(anchor, services, 'right')
  return (
    <>
      <aside
        ref={anchor}
        className="building-panel status-panel"
        data-testid="status-panel"
        aria-label={`Services ${status}`}
      >
        <header>
          <span className="building-panel-title">Services {status}</span>
        </header>
        <ol>
          {services.map((service) => (
            <li key={service.id}>
              <div className="building-panel-service">
                <span className="panel-actions">
                  {onSelect && (
                    <button
                      type="button"
                      className="panel-action"
                      aria-label={`Go to the building of ${service.name}`}
                      title="Go to the building"
                      onClick={() => onSelect(service)}
                    >
                      🏢
                    </button>
                  )}
                  <button
                    type="button"
                    className="panel-action"
                    aria-label={`Graph of ${service.name}`}
                    aria-pressed={graph.open?.id === service.id}
                    title="Show the graph"
                    onClick={() => graph.toggle(service.id)}
                  >
                    📈
                  </button>
                </span>
                <span className="building-panel-name">
                  <MarqueeText text={service.name} />
                </span>
                <span className="building-panel-status">
                  {service.hostName}
                </span>
              </div>
              <CheckBars results={service.results} />
            </li>
          ))}
        </ol>
        {services.length === 0 && (
          <p className="building-panel-empty">No services.</p>
        )}
      </aside>
      {graph.open && graph.place && (
        <ServiceGraph
          name={graph.open.name}
          results={graph.open.results}
          place={graph.place}
          onClose={graph.close}
        />
      )}
    </>
  )
}
