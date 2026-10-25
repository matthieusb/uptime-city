import type { FloorInfo } from '../domain/floors'
import { statusColor, type Status } from '../domain/status'
import CheckBars from '../ui/CheckBars'
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
  const row = (floor: FloorInfo) => (
    <li key={floor.id}>
      <div className="building-panel-service">
        <span className="building-panel-name">{floor.name}</span>
        <span className="building-panel-status">{floor.status}</span>
      </div>
      <CheckBars results={floor.results} />
    </li>
  )
  return (
    <aside
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
  )
}
