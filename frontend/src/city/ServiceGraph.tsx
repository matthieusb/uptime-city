import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react'
import type { CheckResult } from '../api/client'
import { formatDateTime } from '../domain/checks'
import {
  agoLabel,
  DEFAULT_GRAPH_SIZE,
  graphModel,
  graphStats,
  nearestPoint,
  PLOT,
  type GraphPoint,
  type Placement,
} from '../domain/graph'
import { statusColor } from '../domain/status'
import { useNow } from '../ui/useNow'

// The line and the points of the response times.
const LINE_COLOR = '#4a90e2'

// How close to a check, in pixels across, the pointer has to be to show it.
const HOVER_REACH = 14

// The response times of a service over the checks we know of, in a black box beside the panel it
// was opened from: the response time up, the time across, and a red dotted vertical line for each
// outage. The box can be moved by its title bar and resized by its bottom right corner; hovering
// a check tells its time and response time.
export default function ServiceGraph({
  name,
  results,
  place,
  onClose,
}: {
  name: string
  results: CheckResult[]
  place: Placement
  onClose: () => void
}) {
  // The drawing is as big as its box, in pixels, so that the text keeps its size when resized.
  const body = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState(DEFAULT_GRAPH_SIZE)
  useLayoutEffect(() => {
    const element = body.current
    if (!element) return
    const measure = () => {
      if (element.clientWidth > 0 && element.clientHeight > 0)
        setSize({ width: element.clientWidth, height: element.clientHeight })
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  // Moved by hand, from where it was placed.
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const stopDragging = useRef<(() => void) | null>(null)
  useEffect(() => () => stopDragging.current?.(), [])
  const startDragging = (e: ReactMouseEvent) => {
    if ((e.target as Element).closest('button')) return
    e.preventDefault()
    const from = { x: e.clientX - offset.x, y: e.clientY - offset.y }
    const move = (m: MouseEvent) =>
      setOffset({ x: m.clientX - from.x, y: m.clientY - from.y })
    const stop = () => {
      document.removeEventListener('mousemove', move)
      document.removeEventListener('mouseup', stop)
      stopDragging.current = null
    }
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', stop)
    stopDragging.current = stop
  }

  const model = graphModel(results, size)
  const stats = graphStats(results)
  const now = useNow()
  const ms = (value: number) => `${value.toFixed(1)}`
  const plotLeft = PLOT.left
  const plotRight = size.width - PLOT.right
  const plotBottom = size.height - PLOT.bottom
  const [hover, setHover] = useState<GraphPoint | null>(null)
  const onMove = (e: ReactMouseEvent<SVGSVGElement>) =>
    setHover(
      nearestPoint(
        model.points,
        e.clientX - e.currentTarget.getBoundingClientRect().left,
        HOVER_REACH,
      ),
    )
  // A check that left the data (a newer batch of results) cannot stay hovered.
  const shown = hover && model.points.find((p) => p.ts === hover.ts)

  return (
    <section
      className="service-graph"
      data-testid="service-graph"
      aria-label={`Response times of ${name}`}
      style={{
        top: place.top,
        left: place.left,
        width: place.width,
        transform:
          offset.x === 0 && offset.y === 0
            ? undefined
            : `translate(${offset.x}px, ${offset.y}px)`,
      }}
    >
      <header data-testid="graph-handle" onMouseDown={startDragging}>
        <span className="building-panel-title">{name}</span>
        <button
          type="button"
          className="panel-action service-graph-close"
          aria-label="Close the graph"
          onClick={onClose}
        >
          ✕
        </button>
      </header>
      <div ref={body} className="service-graph-body">
        {model.empty ? (
          <p className="building-panel-empty">No data yet.</p>
        ) : (
          <svg
            width={size.width}
            height={size.height}
            viewBox={`0 0 ${size.width} ${size.height}`}
            role="img"
            aria-label={`Response time of ${name} over time`}
            onMouseMove={onMove}
            onMouseLeave={() => setHover(null)}
          >
            {model.yTicks.map((tick) => (
              <g key={tick.label}>
                <line
                  x1={plotLeft}
                  x2={plotRight}
                  y1={tick.y}
                  y2={tick.y}
                  className="graph-grid"
                />
                <text
                  x={plotLeft - 6}
                  y={tick.y}
                  textAnchor="end"
                  dominantBaseline="middle"
                  className="graph-label"
                >
                  {tick.label}
                </text>
              </g>
            ))}
            {model.xTicks.map((tick, i) => (
              <text
                key={i}
                x={tick.x}
                y={plotBottom + 14}
                textAnchor={
                  model.xTicks.length === 1
                    ? 'middle'
                    : i === 0
                      ? 'start'
                      : i === model.xTicks.length - 1
                        ? 'end'
                        : 'middle'
                }
                className="graph-label"
              >
                {tick.label}
              </text>
            ))}
            {model.outages.map((outage) => (
              <g key={outage.ts} data-testid="graph-outage">
                <line
                  x1={outage.x}
                  x2={outage.x}
                  y1={PLOT.top}
                  y2={plotBottom}
                  stroke={statusColor('down')}
                  strokeWidth={1.5}
                  strokeDasharray="3 3"
                />
              </g>
            ))}
            {model.line.length > 1 && (
              <polyline
                data-testid="graph-line"
                points={model.line.map((p) => `${p.x},${p.y}`).join(' ')}
                fill="none"
                stroke={LINE_COLOR}
                strokeWidth={1.5}
              />
            )}
            {model.line.map((point) => (
              <circle
                key={point.ts}
                data-testid="graph-point"
                cx={point.x}
                cy={point.y ?? 0}
                r={shown?.ts === point.ts ? 5 : 2.5}
                fill={point.ok ? LINE_COLOR : statusColor('down')}
              />
            ))}
          </svg>
        )}
        {shown && (
          <div
            role="tooltip"
            className="graph-tooltip"
            style={{
              left: shown.x,
              top: shown.y ?? PLOT.top,
              // Opens inward from the point, so it is not cut by the box.
              transform:
                shown.x > size.width / 2
                  ? 'translate(calc(-100% - 10px), -50%)'
                  : 'translate(10px, -50%)',
            }}
          >
            <div className="graph-tooltip-time">{formatDateTime(shown.ts)}</div>
            <div>
              {shown.latency === null
                ? 'No response'
                : `${shown.latency.toFixed(1)} ms`}
            </div>
            {!shown.ok && (
              <div className="graph-tooltip-error">
                {shown.error ?? 'failed'}
              </div>
            )}
          </div>
        )}
      </div>
      <div className="graph-stats" data-testid="graph-stats">
        <Stat name="Current status">
          <span
            className={
              stats.status === 'unknown'
                ? 'graph-stat-badge'
                : 'graph-stat-badge breathing'
            }
            style={{ background: statusColor(stats.status) }}
          >
            {stats.status.toUpperCase()}
          </span>
        </Stat>
        <Stat name="Average response time">
          {stats.average === null ? '—' : `${ms(stats.average)} ms`}
        </Stat>
        <Stat name="Response time range">
          {stats.min === null || stats.max === null
            ? '—'
            : `${ms(stats.min)} – ${ms(stats.max)} ms`}
        </Stat>
        <Stat name="Last check">
          {stats.lastTs === null
            ? 'never'
            : agoLabel(now - new Date(stats.lastTs).getTime())}
        </Stat>
      </div>
    </section>
  )
}

// A card of the figures under the graph.
function Stat({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="graph-stat" role="group" aria-label={name}>
      <div className="graph-stat-name">{name}</div>
      <div className="graph-stat-value">{children}</div>
    </div>
  )
}
