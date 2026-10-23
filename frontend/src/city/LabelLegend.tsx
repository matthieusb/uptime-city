import { LABEL_KINDS, type LabelKind } from './labels'

// A checklist, over the 3D view, of the kinds of label to show on the map.
export default function LabelLegend({
  shown,
  onToggle,
}: {
  shown: ReadonlySet<LabelKind>
  onToggle: (kind: LabelKind) => void
}) {
  return (
    <div
      className="city-legend"
      role="group"
      aria-label="Labels"
      data-testid="label-legend"
    >
      <div className="city-legend-title">Labels</div>
      {LABEL_KINDS.map(({ kind, name, badge }) => (
        <label key={kind}>
          <input
            type="checkbox"
            aria-label={name}
            checked={shown.has(kind)}
            onChange={() => onToggle(kind)}
          />
          <span className="city-badge" style={{ background: badge.color }}>
            {badge.text}
          </span>
        </label>
      ))}
    </div>
  )
}
