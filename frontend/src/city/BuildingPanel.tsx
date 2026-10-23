import type { FloorInfo } from '../domain/floors'
import { statusColor } from '../domain/status'
import type { Badge } from './textures'

// A 2D view of the building in focus, over the 3D view: its name and badge,
// then every floor with its label and status, from the top floor down to the
// ground floor, the host itself.
export default function BuildingPanel({
  name,
  badge,
  floors,
  ground,
}: {
  name: string
  badge: Badge
  floors: FloorInfo[]
  ground: FloorInfo
}) {
  const row = (floor: FloorInfo, label: string, className?: string) => (
    <li key={floor.id} className={className}>
      <span
        className="building-panel-dot"
        style={{ background: statusColor(floor.status) }}
        role="img"
        aria-label={floor.status}
      />
      <span className="building-panel-name">{label}</span>
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
      <ol>
        {floors.map((floor) => row(floor, floor.name))}
        {row(ground, `${ground.name} (host)`, 'building-panel-ground')}
      </ol>
    </aside>
  )
}
