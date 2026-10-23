import type { FloorInfo } from '../domain/floors'
import CheckBars from '../ui/CheckBars'
import type { Badge } from './textures'

// A 2D view of the building in focus, over the 3D view: its name and badge,
// then the services on its floors from the top floor down, each with its
// status and its last checks as bars.
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
      </header>
      <ol>{floors.map(row)}</ol>
      {floors.length === 0 && (
        <p className="building-panel-empty">No services.</p>
      )}
    </aside>
  )
}
