import { useState } from 'react'

// A toolbox icon at the bottom right of the 3D view: a click opens a box of actions.
export default function Toolbox({
  onRegenerate,
  busy = false,
  exploded = false,
  onToggleExploded,
  planet = false,
  onTogglePlanet,
}: {
  onRegenerate: () => void
  busy?: boolean
  // Whether the exploded view is on, and the switch of it: no button without it.
  exploded?: boolean
  onToggleExploded?: () => void
  // Whether the planet view is on, and the switch between it and the flat plan: no button
  // without it.
  planet?: boolean
  onTogglePlanet?: () => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="city-toolbox" data-testid="toolbox">
      {open && (
        <div className="city-legend" role="group" aria-label="Toolbox">
          <div className="city-legend-title">Toolbox</div>
          <button
            type="button"
            className="city-toolbox-action"
            disabled={busy}
            onClick={onRegenerate}
          >
            <span aria-hidden="true" data-testid="regenerate-icon">
              ↻
            </span>{' '}
            {planet ? 'Regenerate the planet' : 'Regenerate the city'}
          </button>
        </div>
      )}
      <div className="city-toolbox-row">
        {onToggleExploded && (
          <button
            type="button"
            className="city-toolbox-toggle"
            aria-label="Exploded view"
            aria-pressed={exploded}
            title="Exploded view"
            onClick={onToggleExploded}
          >
            💥
          </button>
        )}
        {onTogglePlanet && (
          <button
            type="button"
            className="city-toolbox-toggle"
            aria-label={planet ? 'Flat plan' : 'Planet view'}
            title={planet ? 'Flat plan' : 'Planet view'}
            onClick={onTogglePlanet}
          >
            {planet ? '🗺️' : '🪐'}
          </button>
        )}
        <button
          type="button"
          className="city-toolbox-toggle"
          aria-label="Toolbox"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          🧰
        </button>
      </div>
    </div>
  )
}
