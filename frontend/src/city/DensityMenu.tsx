import {
  DENSITY_KINDS,
  DENSITY_MAX,
  DENSITY_MIN,
  DENSITY_STEP,
  type Densities,
  type DensityKind,
} from './effects'

// Sliders, over the 3D view, for how many vehicles and clouds there are.
export default function DensityMenu({
  values,
  onChange,
}: {
  values: Densities
  onChange: (kind: DensityKind, value: number) => void
}) {
  return (
    <div
      className="city-legend"
      role="group"
      aria-label="Density"
      data-testid="density-menu"
    >
      <div className="city-legend-title">Density</div>
      {DENSITY_KINDS.map(({ kind, name }) => (
        <label key={kind} className="city-slider">
          <span className="city-slider-head">
            <span>{name}</span>
            <span>{Math.round(100 * values[kind])}%</span>
          </span>
          <input
            type="range"
            aria-label={`${name} density`}
            min={DENSITY_MIN}
            max={DENSITY_MAX}
            step={DENSITY_STEP}
            value={values[kind]}
            onChange={(e) => onChange(kind, Number(e.target.value))}
          />
        </label>
      ))}
    </div>
  )
}
