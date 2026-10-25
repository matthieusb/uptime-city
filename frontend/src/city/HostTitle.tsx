import type { Status } from '../domain/status'
import type { Badge } from './textures'

// The physical host in focus, over the 3D view: its name and its badges. The
// badges that count services can be clicked to list the services they count.
export default function HostTitle({
  name,
  badges,
  selected = null,
  onSelect,
}: {
  name: string
  badges: Badge[]
  selected?: Status | null
  onSelect?: (status: Status) => void
}) {
  return (
    <div className="city-title" data-testid="city-title">
      <span className="city-title-name">{name}</span>
      {badges.map((badge) => {
        const className = badge.pulse
          ? 'city-title-badge breathing'
          : 'city-title-badge'
        const style = { background: badge.color, color: badge.textColor }
        const text = badge.text.startsWith('?') ? (
          <>
            <strong>?</strong>
            {badge.text.slice(1)}
          </>
        ) : (
          badge.text
        )
        const { status } = badge
        if (!status || !onSelect) {
          return (
            <span
              key={badge.text + badge.color}
              className={className}
              style={style}
            >
              {text}
            </span>
          )
        }
        return (
          <button
            key={badge.text + badge.color}
            type="button"
            className={className}
            style={style}
            aria-label={`Services ${status}: ${badge.text.replace(/^\?\s*/, '')}`}
            aria-pressed={selected === status}
            onClick={() => onSelect(status)}
          >
            {text}
          </button>
        )
      })}
    </div>
  )
}
