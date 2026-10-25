import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import {
  actOnSimulation,
  refreshSimulation,
  startSimulation,
  stopSimulation,
  type SimulationAction,
} from '../api/client'

// Seconds left before `deadline` (a timestamp in ms), never below zero.
function secondsLeft(deadline: number): number {
  return Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
}

// The seconds left, counting down while the simulation runs and standing still while it is stopped.
function RefreshCounter({
  deadline,
  running,
  period,
}: {
  deadline: number
  running: boolean
  period: number
}) {
  const [left, setLeft] = useState(() => secondsLeft(deadline))
  useEffect(() => {
    setLeft(secondsLeft(deadline))
    if (!running) return
    const timer = setInterval(() => setLeft(secondsLeft(deadline)), 500)
    return () => clearInterval(timer)
  }, [deadline, running])
  return (
    <span data-testid="refresh-counter">
      {running ? left : Math.ceil(period)}s
    </span>
  )
}

// The counter is a button: it starts the simulation when stopped and stops it when running, with
// the usual symbol of the action it does at its top right, play or stop.
function CounterToggle({
  running,
  nextRefreshInS,
  updatedAt,
}: {
  running: boolean
  nextRefreshInS: number
  updatedAt: number
}) {
  const client = useQueryClient()
  const { mutate, isPending } = useMutation({
    mutationFn: running ? stopSimulation : startSimulation,
    onSuccess: () => client.invalidateQueries({ queryKey: ['info'] }),
  })
  const action = running ? 'Stop' : 'Start'
  return (
    <button
      type="button"
      className="simulation-badge simulation-counter"
      aria-label={`${action} the simulation`}
      title={
        running
          ? 'Time before the simulated statuses change: click to stop'
          : 'The simulated statuses stay as they are: click to start'
      }
      disabled={isPending}
      onClick={() => mutate()}
    >
      <RefreshCounter
        deadline={updatedAt + nextRefreshInS * 1000}
        running={running}
        period={nextRefreshInS}
      />
      <span
        className="simulation-toggle-badge"
        data-testid="simulation-toggle-badge"
        aria-hidden="true"
      >
        {running ? '■' : '▶'}
      </span>
    </button>
  )
}

// A round button that redraws the simulated statuses now: the 3D view and the
// counter, which starts again from the full period, follow.
function RefreshButton() {
  const client = useQueryClient()
  const { mutate, isPending } = useMutation({
    mutationFn: refreshSimulation,
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: ['info'] }),
        client.invalidateQueries({ queryKey: ['history'] }),
      ]),
  })
  return (
    <button
      type="button"
      className="simulation-badge simulation-button"
      aria-label="Refresh the simulation"
      title="Redraw the simulated statuses now"
      disabled={isPending}
      onClick={() => mutate()}
    >
      ↻
    </button>
  )
}

type Event = { label: string; action: SimulationAction; count?: boolean }

// What the simulation does by itself, made by hand: what goes down, then what comes back.
const EVENTS: Event[][] = [
  [{ label: 'Reset everything up', action: 'reset' }],
  [
    { label: 'Nuke a host', action: 'nuke-host' },
    { label: 'Demolish a VM', action: 'demolish-vm' },
    { label: 'Down services', action: 'down-services', count: true },
  ],
  [
    { label: 'Revive a host', action: 'revive-host' },
    { label: 'Revive a VM', action: 'revive-vm' },
    { label: 'Revive services', action: 'revive-services', count: true },
  ],
]

// A box above the simulation badge, opened by an arrow on it, while the simulation is stopped: a button for each event
// that would otherwise happen by itself, and the number of services the two last ones take.
function SimulationControls({ open }: { open: boolean }) {
  const client = useQueryClient()
  const [services, setServices] = useState('1')
  const { mutate, isPending } = useMutation({
    mutationFn: ({
      action,
      count,
    }: {
      action: SimulationAction
      count?: number
    }) => actOnSimulation(action, count),
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: ['info'] }),
        client.invalidateQueries({ queryKey: ['history'] }),
      ]),
  })
  // At least one, whatever is typed.
  const count = Math.max(1, Math.floor(Number(services)) || 1)
  return (
    <div
      className="simulation-controls-slide"
      data-testid="simulation-controls"
      data-open={open}
      aria-hidden={!open}
      inert={!open}
    >
      <div className="simulation-controls-clip">
        <div
          className="simulation-controls"
          title="Events of the simulation, by hand"
        >
          <label className="simulation-count">
            Services
            <input
              type="number"
              min={1}
              value={services}
              aria-label="Number of services"
              onChange={(e) => setServices(e.target.value)}
            />
          </label>
          {EVENTS.map((group, n) => (
            <div className="simulation-group" key={n}>
              {group.map((event) => (
                <button
                  key={event.action}
                  type="button"
                  className="simulation-event"
                  disabled={isPending}
                  onClick={() =>
                    mutate({
                      action: event.action,
                      count: event.count ? count : undefined,
                    })
                  }
                >
                  {event.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// At the bottom left of the window: the simulation badge, and to its right
// the seconds left before the simulated statuses change, which starts and
// stops them, then a button to change them at once.
export default function SimulationBadges({
  nextRefreshInS,
  updatedAt,
  running,
}: {
  nextRefreshInS: number | null
  updatedAt: number
  running: boolean
}) {
  // The box of events is closed at first.
  const [open, setOpen] = useState(false)
  return (
    <div className="simulation-badges">
      {!running && <SimulationControls open={open} />}
      <div className="simulation-row">
        <div className="simulation-badge-wrap">
          <div className="simulation-badge" title="The statuses are faked">
            Simulation
          </div>
          {!running && (
            <button
              type="button"
              className="simulation-arrow"
              aria-label={`${open ? 'Hide' : 'Show'} the simulation events`}
              aria-expanded={open}
              onClick={() => setOpen(!open)}
            >
              <svg
                viewBox="0 0 10 10"
                width="10"
                height="10"
                aria-hidden="true"
                className={
                  open ? 'simulation-chevron open' : 'simulation-chevron'
                }
              >
                <path
                  d="M2 6.5 L5 3.5 L8 6.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          )}
        </div>
        {nextRefreshInS !== null && (
          <CounterToggle
            running={running}
            nextRefreshInS={nextRefreshInS}
            updatedAt={updatedAt}
          />
        )}
        <RefreshButton />
      </div>
    </div>
  )
}
