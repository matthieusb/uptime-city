import { EFFECT_KINDS, type EffectKind } from './effects'

// A checklist, over the 3D view, of the effects to show on the map.
export default function EffectMenu({
  shown,
  onToggle,
}: {
  shown: ReadonlySet<EffectKind>
  onToggle: (kind: EffectKind) => void
}) {
  return (
    <div
      className="city-legend"
      role="group"
      aria-label="Effects"
      data-testid="effect-menu"
    >
      <div className="city-legend-title">Effects</div>
      {EFFECT_KINDS.map(({ kind, name }) => (
        <label key={kind}>
          <input
            type="checkbox"
            aria-label={name}
            checked={shown.has(kind)}
            onChange={() => onToggle(kind)}
          />
          <span>{name}</span>
        </label>
      ))}
    </div>
  )
}
