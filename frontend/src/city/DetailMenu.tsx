import { DETAIL_MAX, DETAIL_MIN, DETAIL_STEP } from './detail'

// A slider, over the 3D view, for the global level of detail: it checks the
// boxes and moves the sliders of the other menus.
export default function DetailMenu({
  value,
  onChange,
}: {
  value: number
  onChange: (value: number) => void
}) {
  return (
    <div
      className="city-legend"
      role="group"
      aria-label="Detail Level"
      data-testid="detail-menu"
    >
      <div className="city-legend-title">Detail Level</div>
      <label className="city-slider">
        <span className="city-slider-head">
          <span>Detail</span>
          <span>{value}%</span>
        </span>
        <input
          type="range"
          aria-label="Detail level"
          min={DETAIL_MIN}
          max={DETAIL_MAX}
          step={DETAIL_STEP}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
        />
      </label>
    </div>
  )
}
