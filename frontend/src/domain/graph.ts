import type { CheckResult } from '../api/client'
import { floorStatus, type Status } from './status'

// The graph of the response times of a service, as plain numbers for an SVG: the response time
// on the y axis, the time on the x axis, a red dotted line for each outage.

// The margins around the plot, in the units of the SVG, for the labels of the axes.
export const PLOT = { left: 46, right: 12, top: 10, bottom: 24 }

// The size of the drawing until the box is measured.
export const DEFAULT_GRAPH_SIZE = { width: 560, height: 300 }

// The narrowest a graph gets when it fills the room beside a panel.
export const MIN_GRAPH_WIDTH = 280

export interface GraphPoint {
  x: number
  // Null for a check with no response time (a timeout, an error before any answer).
  y: number | null
  ts: string
  latency: number | null
  // Whether the check succeeded: the failed ones are outages.
  ok: boolean
  error: string | null
}

export interface GraphModel {
  empty: boolean
  // Every check, in time order.
  points: GraphPoint[]
  // The checks that have a response time: one line goes through them, across the outages.
  line: GraphPoint[]
  // The failed checks, each a red dotted line whether or not it has a response time.
  outages: GraphPoint[]
  yTicks: { y: number; label: string }[]
  xTicks: { x: number; label: string }[]
}

// The round maximum of the y axis: 1, 2 or 5 times a power of ten that holds `value`.
export function niceMax(value: number): number {
  if (value <= 0) return 100
  const power = 10 ** Math.floor(Math.log10(value))
  const mantissa = value / power
  const nice = mantissa <= 1 ? 1 : mantissa <= 2 ? 2 : mantissa <= 5 ? 5 : 10
  return nice * power
}

const DAY_MS = 24 * 3600 * 1000

function tickLabel(ms: number, spansDays: boolean, timeZone?: string): string {
  return new Intl.DateTimeFormat(
    'en-GB',
    spansDays
      ? { dateStyle: 'short', timeStyle: 'short', timeZone }
      : { timeStyle: 'medium', timeZone },
  ).format(new Date(ms))
}

export function graphModel(
  results: CheckResult[],
  box: { width: number; height: number },
  timeZone?: string,
): GraphModel {
  const plotLeft = PLOT.left
  const plotRight = box.width - PLOT.right
  const plotTop = PLOT.top
  const plotBottom = box.height - PLOT.bottom
  const times = results.map((r) => new Date(r.ts).getTime())
  const first = Math.min(...times)
  const last = Math.max(...times)
  const x = (ms: number) =>
    last === first
      ? (plotLeft + plotRight) / 2
      : plotLeft + ((ms - first) / (last - first)) * (plotRight - plotLeft)

  const top = niceMax(Math.max(0, ...results.map((r) => r.latency_ms ?? 0)))
  const y = (latency: number) =>
    plotBottom - (latency / top) * (plotBottom - plotTop)

  const points: GraphPoint[] = results.map((result) => {
    const latency = result.latency_ms ?? null
    return {
      x: x(new Date(result.ts).getTime()),
      y: latency === null ? null : y(latency),
      ts: result.ts,
      latency,
      ok: result.success,
      error: result.error ?? null,
    }
  })

  const spansDays = last - first >= DAY_MS
  const tickTimes =
    results.length === 0
      ? []
      : last === first
        ? [first]
        : [first, first + (last - first) / 2, last]
  return {
    empty: results.length === 0,
    points,
    line: points.filter((graphPoint) => graphPoint.y !== null),
    outages: points.filter((graphPoint) => !graphPoint.ok),
    yTicks: [0, top / 2, top].map((value) => ({
      y: y(value),
      label: `${value} ms`,
    })),
    xTicks: tickTimes.map((ms) => ({
      x: x(ms),
      label: tickLabel(ms, spansDays, timeZone),
    })),
  }
}

// The check closest to an x on the graph, if one is within `reach` of it.
export function nearestPoint(
  points: GraphPoint[],
  x: number,
  reach: number,
): GraphPoint | null {
  let best: GraphPoint | null = null
  for (const point of points)
    if (
      Math.abs(point.x - x) <= reach &&
      (!best || Math.abs(point.x - x) < Math.abs(best.x - x))
    )
      best = point
  return best
}

// The left edge of a graph that must stay clear of boxes over the left of the view (the title of
// the host in focus, the list of services): past the right edge of each of them, a gap off.
export function keepClearOf(
  edge: number,
  rights: number[],
  gap: number,
): number {
  return Math.max(edge, ...rights.map((right) => right + gap))
}

export interface Placement {
  top: number
  left: number
  width: number
}

// Where a graph goes beside a panel, to fill the room between the panel and the limit of the
// view on that side: with the same top, and a gap apart. The panel's and the limits' x are in the
// window, `top` and the result in the positioned parent of the panel, which starts at `parentLeft`.
export function placeBeside(
  panel: { top: number; left: number; right: number },
  limits: { left: number; right: number },
  parentLeft: number,
  side: 'left' | 'right',
  gap: number,
): Placement {
  if (side === 'right') {
    const left = panel.right + gap
    return {
      top: panel.top,
      left: left - parentLeft,
      width: Math.max(MIN_GRAPH_WIDTH, limits.right - left),
    }
  }
  const width = Math.max(MIN_GRAPH_WIDTH, panel.left - gap - limits.left)
  const left = Math.max(limits.left, panel.left - gap - width)
  return { top: panel.top, left: left - parentLeft, width }
}

export interface GraphStats {
  // That of the last check; unknown while the host is down or before any check.
  status: Status
  // Over the checks that have a response time, the ones the graph draws.
  average: number | null
  min: number | null
  max: number | null
  lastTs: string | null
}

export function graphStats(results: CheckResult[]): GraphStats {
  const latencies = results.flatMap((r) =>
    r.latency_ms == null ? [] : [r.latency_ms],
  )
  return {
    status: floorStatus(results),
    average:
      latencies.length === 0
        ? null
        : latencies.reduce((sum, v) => sum + v, 0) / latencies.length,
    min: latencies.length === 0 ? null : Math.min(...latencies),
    max: latencies.length === 0 ? null : Math.max(...latencies),
    lastTs: results.at(-1)?.ts ?? null,
  }
}

const AGO_UNITS: [name: string, ms: number][] = [
  ['day', 24 * 3600 * 1000],
  ['hour', 3600 * 1000],
  ['minute', 60 * 1000],
  ['second', 1000],
]

// How long ago something was, from the milliseconds since: "35 seconds ago".
export function agoLabel(elapsedMs: number): string {
  for (const [name, ms] of AGO_UNITS) {
    if (elapsedMs >= ms) {
      const count = Math.floor(elapsedMs / ms)
      return `${count} ${name}${count === 1 ? '' : 's'} ago`
    }
  }
  return 'just now'
}
