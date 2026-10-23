import type { FloorInfo } from '../domain/floors'
import { statusColor } from '../domain/status'
import type { Badge } from './textures'

// A 2D view of the building in focus, over the 3D view: its name and badge,
// then the services on its floors with their status, from the top floor down.
export default function BuildingPanel({
  name,
  badge,
  floors,
}: {
  name: string
  badge: Badge
  floors: FloorInfo[]
}) {
  const row = (floor: FloorInfo) => (
    <li key={floor.id}>
      <span
        className="building-panel-dot"
        style={{ background: statusColor(floor.status) }}
        role="img"
        aria-label={floor.status}
      />
      <span className="building-panel-name">{floor.name}</span>
      <span className="building-panel-status">{floor.status}</span>
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
      </header>
      <ol>{floors.map(row)}</ol>
      {floors.length === 0 && (
        <p className="building-panel-empty">No services.</p>
      )}
    </aside>
  )
}
