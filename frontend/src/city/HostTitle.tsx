import type { Badge } from './textures'

// The physical host in focus, over the 3D view: its name and its badges.
export default function HostTitle({
  name,
  badges,
}: {
  name: string
  badges: Badge[]
}) {
  return (
    <div className="city-title" data-testid="city-title">
      <span className="city-title-name">{name}</span>
      {badges.map((badge) => (
        <span
          key={badge.text + badge.color}
          className={
            badge.pulse ? 'city-title-badge breathing' : 'city-title-badge'
          }
          style={{ background: badge.color, color: badge.textColor }}
        >
          {badge.text}
        </span>
      ))}
    </div>
  )
}
