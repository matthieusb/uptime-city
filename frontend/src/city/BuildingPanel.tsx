import { useRef } from 'react'
import type { FloorInfo } from '../domain/floors'
import { statusColor, type Status } from '../domain/status'
import CheckBars from '../ui/CheckBars'
import MarqueeText from '../ui/MarqueeText'
import ServiceGraph from './ServiceGraph'
import { useServiceGraph } from './useServiceGraph'
import type { Badge } from './textures'

// A 2D view of the building in focus, over the 3D view: its name and badge,
// then the services on its floors from the top floor down, each with its
// status and its last checks as bars. A VM host's building also tells whether the VM is up or down,
// to the right of its badge.
export default function BuildingPanel({
  name,
  badge,
  floors,
  hostStatus,
}: {
  name: string
  badge: Badge
  floors: FloorInfo[]
  // The status of the VM host itself, for a VM's building.
  hostStatus?: Status
}) {
  // Its graph opens on the left of the panel, which is against the right edge of the view.
  const anchor = useRef<HTMLElement>(null)
  const graph = useServiceGraph(anchor, floors, 'left')
  const row = (floor: FloorInfo) => (
    <li key={floor.id}>
      <div className="building-panel-service">
        <span className="panel-actions">
          <button
            type="button"
            className="panel-action"
            aria-label={`Graph of ${floor.name}`}
            aria-pressed={graph.open?.id === floor.id}
            title="Show the graph"
            onClick={() => graph.toggle(floor.id)}
          >
            📈
          </button>
        </span>
        <span className="building-panel-name">
          <MarqueeText text={floor.name} />
        </span>
        <span className="building-panel-status">{floor.status}</span>
      </div>
      <CheckBars results={floor.results} />
    </li>
  )
  return (
    <>
      <aside
        ref={anchor}
        className="building-panel"
        data-testid="building-panel"
        aria-label={`Floors of ${name}`}
      >
        <header>
          <span className="building-panel-title">{name}</span>
          <span
            className="city-title-badge"
            style={{ background: badge.color, color: badge.textColor }}
          >
            {badge.text}
          </span>
          {(hostStatus === 'up' || hostStatus === 'down') && (
            <span
              className="building-panel-host-status breathing"
              data-testid="host-status"
              style={{ color: statusColor(hostStatus) }}
            >
              {hostStatus === 'up' ? 'UP' : 'DOWN'}
            </span>
          )}
        </header>
        <ol>{floors.map(row)}</ol>
        {floors.length === 0 && (
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
