import type { StatusService } from '../domain/counts'
import type { Status } from '../domain/status'
import CheckBars from '../ui/CheckBars'

// A 2D view over the 3D view of the services a badge counts, each with the
// host it runs on and its last checks as bars. A service box can be clicked,
// to go to the building that holds the service.
export default function StatusPanel({
  status,
  services,
  onSelect,
}: {
  status: Status
  services: StatusService[]
  onSelect?: (service: StatusService) => void
}) {
  return (
    <aside
      className="building-panel status-panel"
      data-testid="status-panel"
      aria-label={`Services ${status}`}
    >
      <header>
        <span className="building-panel-title">Services {status}</span>
      </header>
      <ol>
        {services.map((service) => {
          const content = (
            <>
              <div className="building-panel-service">
                <span className="building-panel-name">{service.name}</span>
                <span className="building-panel-status">
                  {service.hostName}
                </span>
              </div>
              <CheckBars results={service.results} />
            </>
          )
          return (
            <li key={service.id}>
              {onSelect ? (
                <button
                  type="button"
                  className="status-panel-row"
                  onClick={() => onSelect(service)}
                >
                  {content}
                </button>
              ) : (
                content
              )}
            </li>
          )
        })}
      </ol>
      {services.length === 0 && (
        <p className="building-panel-empty">No services.</p>
      )}
    </aside>
  )
}
