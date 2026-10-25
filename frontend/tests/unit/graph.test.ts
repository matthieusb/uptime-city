import { describe, expect, it } from 'vitest'
import type { CheckResult } from '../../src/api/client'
import {
  agoLabel,
  graphModel,
  graphStats,
  keepClearOf,
  MIN_GRAPH_WIDTH,
  nearestPoint,
  niceMax,
  placeBeside,
  PLOT,
} from '../../src/domain/graph'

const at = (seconds: number, latency: number | null, error?: string) =>
  ({
    ts: new Date(Date.UTC(2026, 0, 1, 0, 0, seconds)).toISOString(),
    success: error === undefined,
    latency_ms: latency,
    error: error ?? null,
    host_down: false,
  }) as CheckResult

const BOX = { width: 400, height: 200 }

describe('niceMax', () => {
  it('rounds up to 1, 2 or 5 times a power of ten', () => {
    expect(niceMax(0.7)).toBe(1)
    expect(niceMax(3.4)).toBe(5)
    expect(niceMax(12)).toBe(20)
    expect(niceMax(180)).toBe(200)
    expect(niceMax(500)).toBe(500)
  })

  it('is 100 when there is nothing to measure', () => {
    expect(niceMax(0)).toBe(100)
  })
})

describe('graphModel', () => {
  it('is empty without results', () => {
    const model = graphModel([], BOX, 'UTC')
    expect(model.empty).toBe(true)
    expect(model.points).toEqual([])
    expect(model.outages).toEqual([])
  })

  it('puts the response time on the y axis and the time on the x axis', () => {
    const model = graphModel([at(0, 0), at(30, 50), at(60, 100)], BOX, 'UTC')
    const [first, middle, last] = model.line
    expect(first.x).toBe(PLOT.left)
    expect(last.x).toBe(BOX.width - PLOT.right)
    expect(middle.x).toBeCloseTo((first.x + last.x) / 2)
    // The longer the response time, the higher the point (a smaller y).
    expect(first.y!).toBeGreaterThan(middle.y!)
    expect(middle.y!).toBeGreaterThan(last.y!)
    expect(first.y).toBe(BOX.height - PLOT.bottom)
  })

  it('labels the y axis from 0 up to a round maximum', () => {
    const model = graphModel([at(0, 12), at(30, 180)], BOX, 'UTC')
    expect(model.yTicks.map((t) => t.label)).toEqual([
      '0 ms',
      '100 ms',
      '200 ms',
    ])
    expect(model.yTicks[0].y).toBe(BOX.height - PLOT.bottom)
    expect(model.yTicks[2].y).toBe(PLOT.top)
  })

  it('labels the x axis with the first, middle and last times', () => {
    const model = graphModel([at(0, 5), at(30, 5), at(60, 5)], BOX, 'UTC')
    expect(model.xTicks.map((t) => t.label)).toEqual([
      '00:00:00',
      '00:00:30',
      '00:01:00',
    ])
  })

  it('shows the date when the results span more than a day', () => {
    const model = graphModel([at(0, 5), at(2 * 24 * 3600, 5)], BOX, 'UTC')
    expect(model.xTicks[0].label).toContain('01/01/2026')
  })

  it('marks each failed check as an outage, at its time', () => {
    const model = graphModel(
      [at(0, 10), at(10, 10), at(20, null, 'timeout'), at(30, 10), at(40, 10)],
      BOX,
      'UTC',
    )
    expect(model.outages).toHaveLength(1)
    expect(model.outages[0].error).toBe('timeout')
    expect(model.outages[0].ok).toBe(false)
    expect(model.outages[0].x).toBeCloseTo(
      (PLOT.left + BOX.width - PLOT.right) / 2,
    )
  })

  it('keeps the line through an outage, joining the checks on both sides', () => {
    const model = graphModel(
      [at(0, 10), at(10, 10), at(20, null, 'timeout'), at(30, 10), at(40, 10)],
      BOX,
      'UTC',
    )
    expect(model.line).toHaveLength(4)
    expect(model.points).toHaveLength(5)
  })

  it('plots the response time of a failed check that has one', () => {
    const model = graphModel(
      [at(0, 10), at(10, 400, '[STATUS] == 200'), at(20, 10)],
      BOX,
      'UTC',
    )
    expect(model.line).toHaveLength(3)
    expect(model.outages).toHaveLength(1)
    const failed = model.points[1]
    expect(failed.latency).toBe(400)
    expect(failed.y).not.toBeNull()
    expect(failed.ok).toBe(false)
  })

  it('draws a lone result in the middle', () => {
    const model = graphModel([at(0, 5)], BOX, 'UTC')
    expect(model.points[0].x).toBe((PLOT.left + BOX.width - PLOT.right) / 2)
    expect(model.xTicks).toHaveLength(1)
  })

  it('only has outages when every check failed', () => {
    const model = graphModel(
      [at(0, null, 'down'), at(10, null, 'down')],
      BOX,
      'UTC',
    )
    expect(model.line).toEqual([])
    expect(model.outages).toHaveLength(2)
    expect(model.points.every((p) => p.y === null)).toBe(true)
    expect(model.yTicks.at(-1)?.label).toBe('100 ms')
  })
})

describe('nearestPoint', () => {
  const model = graphModel([at(0, 5), at(30, 9), at(60, 7)], BOX, 'UTC')

  it('finds the point closest to an x, within reach', () => {
    const [, middle] = model.points
    expect(nearestPoint(model.points, middle.x + 3, 10)).toBe(middle)
  })

  it('finds nothing when no point is within reach', () => {
    expect(nearestPoint(model.points, PLOT.left + 60, 10)).toBeNull()
    expect(nearestPoint([], 10, 10)).toBeNull()
  })
})

describe('placeBeside', () => {
  // The panel spans x 700 to 988 of the window, and its parent starts at x 10.
  const panel = { top: 12, left: 700, right: 988 }
  const limits = { left: 12, right: 1500 }

  it('fills the room on the right of a panel, with the same top', () => {
    expect(placeBeside(panel, limits, 10, 'right', 8)).toEqual({
      top: 12,
      left: 988 + 8 - 10,
      width: 1500 - (988 + 8),
    })
  })

  it('fills the room on the left of a panel, with the same top', () => {
    expect(placeBeside(panel, limits, 10, 'left', 8)).toEqual({
      top: 12,
      left: 12 - 10,
      width: 700 - 8 - 12,
    })
  })

  it('keeps a minimum width, even without room', () => {
    const squeezed = placeBeside(
      panel,
      { left: 12, right: 1000 },
      10,
      'right',
      8,
    )
    expect(squeezed.width).toBe(MIN_GRAPH_WIDTH)
  })
})

describe('keepClearOf', () => {
  it('keeps the left edge when nothing is in the way', () => {
    expect(keepClearOf(12, [], 8)).toBe(12)
  })

  it('moves the left edge past the right edge of what is in the way, a gap off', () => {
    // The title of the host in focus, over the top left of the view.
    expect(keepClearOf(12, [300], 8)).toBe(308)
    expect(keepClearOf(12, [300, 420, 380], 8)).toBe(428)
  })

  it('ignores what ends before the edge', () => {
    expect(keepClearOf(100, [50], 8)).toBe(100)
  })
})

describe('graphStats', () => {
  it('has nothing to tell without results', () => {
    expect(graphStats([])).toEqual({
      status: 'unknown',
      average: null,
      min: null,
      max: null,
      lastTs: null,
    })
  })

  it('tells the status of the last check, the average and range of the response times', () => {
    const stats = graphStats([at(0, 10), at(10, 30), at(20, 20)])
    expect(stats.status).toBe('up')
    expect(stats.average).toBe(20)
    expect(stats.min).toBe(10)
    expect(stats.max).toBe(30)
    expect(stats.lastTs).toBe(at(20, 20).ts)
  })

  it('is down when the last check failed, and counts the response times of failed checks too', () => {
    const stats = graphStats([
      at(0, 10),
      at(10, 50, 'slow'),
      at(20, null, 'timeout'),
    ])
    expect(stats.status).toBe('down')
    expect(stats.average).toBe(30)
    expect(stats.max).toBe(50)
  })

  it('has no average or range when no check has a response time', () => {
    const stats = graphStats([at(0, null, 'timeout')])
    expect(stats.status).toBe('down')
    expect(stats.average).toBeNull()
    expect(stats.min).toBeNull()
  })

  it('is unknown while the host is down, whatever the last check says', () => {
    const skipped = { ...at(0, null, 'host is down'), host_down: true }
    expect(graphStats([at(-10, 5), skipped]).status).toBe('unknown')
  })
})

describe('agoLabel', () => {
  const s = 1000
  it('says just now under a second, or in the future', () => {
    expect(agoLabel(0)).toBe('just now')
    expect(agoLabel(900)).toBe('just now')
    expect(agoLabel(-5 * s)).toBe('just now')
  })

  it('counts seconds, minutes, hours and days, in the singular for one', () => {
    expect(agoLabel(1 * s)).toBe('1 second ago')
    expect(agoLabel(35 * s)).toBe('35 seconds ago')
    expect(agoLabel(60 * s)).toBe('1 minute ago')
    expect(agoLabel(150 * s)).toBe('2 minutes ago')
    expect(agoLabel(3600 * s)).toBe('1 hour ago')
    expect(agoLabel(5 * 3600 * s)).toBe('5 hours ago')
    expect(agoLabel(24 * 3600 * s)).toBe('1 day ago')
    expect(agoLabel(3 * 24 * 3600 * s)).toBe('3 days ago')
  })
})
