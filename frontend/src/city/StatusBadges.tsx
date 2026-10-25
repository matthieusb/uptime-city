import type { ServiceCounts } from '../domain/counts'
import { statusColor, type Status } from '../domain/status'
import { UNKNOWN_COUNT_COLOR } from './labels'

const BADGES: { status: Status; color: string; textColor?: string }[] = [
  { status: 'up', color: statusColor('up') },
  { status: 'down', color: statusColor('down'), textColor: '#ffffff' },
  { status: 'unknown', color: UNKNOWN_COUNT_COLOR },
]

// What the lab is called when the config does not say.
export const DEFAULT_LAB_NAME = 'lab-map'

// The services up, down and with no status yet on the whole map, at the top
// left of the 3D view, even when there are none, in the same box as the title
// of a host in focus, to the right of the name of the lab. A click lists them.
export default function StatusBadges({
  labName = DEFAULT_LAB_NAME,
  counts,
  selected,
  onSelect,
}: {
  labName?: string
  counts: ServiceCounts
  selected: Status | null
  onSelect: (status: Status) => void
}) {
  return (
    <div
      className="city-title status-badges"
      role="group"
      aria-label="Services"
    >
      <span className="city-title-name">{labName}</span>
      {BADGES.map(({ status, color, textColor }) => (
        <button
          key={status}
          type="button"
          className="city-title-badge"
          aria-label={`Services ${status}: ${counts[status]}`}
          aria-pressed={selected === status}
          style={{ background: color, color: textColor }}
          onClick={() => onSelect(status)}
        >
          {status === 'unknown' ? (
            <>
              <strong>?</strong> {counts[status]}
            </>
          ) : (
            counts[status]
          )}
        </button>
      ))}
    </div>
  )
}
