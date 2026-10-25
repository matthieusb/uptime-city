import { useState } from 'react'

// A toolbox icon at the bottom right of the 3D view: a click opens a box of actions.
export default function Toolbox({
  onRegenerate,
  busy = false,
}: {
  onRegenerate: () => void
  busy?: boolean
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
            Regenerate the city
          </button>
        </div>
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
  )
}
