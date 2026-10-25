import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import type { CheckResult } from '../../src/api/client'
import ServiceGraph from '../../src/city/ServiceGraph'
import { formatDateTime } from '../../src/domain/checks'
import { DEFAULT_GRAPH_SIZE, graphModel } from '../../src/domain/graph'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const at = (seconds: number, latency: number | null, error?: string) =>
  ({
    ts: new Date(Date.UTC(2026, 0, 1, 0, 0, seconds)).toISOString(),
    success: error === undefined,
    latency_ms: latency,
    error: error ?? null,
    host_down: false,
  }) as CheckResult

const place = { top: 12, left: 300, width: 600 }

const graph = (results: CheckResult[], onClose = vi.fn()) =>
  render(
    <ServiceGraph
      name="web"
      results={results}
      place={place}
      onClose={onClose}
    />,
  )

const box = () =>
  screen.getByRole('region', { name: 'Response times of web' }) as HTMLElement

it('is a box named after the service, with a close button', async () => {
  const onClose = vi.fn()
  graph([at(0, 5), at(30, 9)], onClose)

  expect(box()).toBeTruthy()
  expect(screen.getByText('web')).toBeTruthy()
  await userEvent.click(screen.getByRole('button', { name: 'Close the graph' }))
  expect(onClose).toHaveBeenCalledTimes(1)
})

it('sits at the given place and width', () => {
  graph([])

  expect(box().style.top).toBe('12px')
  expect(box().style.left).toBe('300px')
  expect(box().style.width).toBe('600px')
})

it('lines up the response times and shows the axes', () => {
  graph([at(0, 5), at(30, 9), at(60, 7)])

  expect(screen.getAllByTestId('graph-line')).toHaveLength(1)
  expect(screen.getAllByTestId('graph-point')).toHaveLength(3)
  expect(screen.getByText('0 ms')).toBeTruthy()
  expect(screen.getByText('10 ms')).toBeTruthy()
})

it('draws the response times in blue, and the points of failed checks in red', () => {
  graph([at(0, 5), at(30, 400, 'slow'), at(60, 7)])

  expect(screen.getByTestId('graph-line').getAttribute('stroke')).toBe(
    '#4a90e2',
  )
  expect(
    screen.getAllByTestId('graph-point').map((p) => p.getAttribute('fill')),
  ).toEqual(['#4a90e2', '#e74c3c', '#4a90e2'])
})

it('draws each outage as a dotted red vertical line, without breaking the response time line', () => {
  graph([at(0, 5), at(10, 6), at(30, null, 'timeout'), at(50, 7), at(60, 8)])

  const outages = screen.getAllByTestId('graph-outage')
  expect(outages).toHaveLength(1)
  const line = outages[0].querySelector('line')!
  expect(line.getAttribute('stroke')).toBe('#e74c3c')
  expect(line.getAttribute('stroke-dasharray')).toBeTruthy()
  expect(line.getAttribute('x1')).toBe(line.getAttribute('x2'))
  // One line across the outage, through the four checks that have a response time.
  expect(screen.getAllByTestId('graph-line')).toHaveLength(1)
  expect(screen.getAllByTestId('graph-point')).toHaveLength(4)
})

it('shows the response time of a failed check on top of its red line', () => {
  graph([at(0, 5), at(30, 400, '[STATUS] == 200'), at(60, 7)])

  expect(screen.getAllByTestId('graph-outage')).toHaveLength(1)
  expect(screen.getAllByTestId('graph-point')).toHaveLength(3)
})

it('says so when there is no data yet', () => {
  graph([])

  expect(screen.getByText('No data yet.')).toBeTruthy()
  expect(screen.queryByTestId('graph-line')).toBeNull()
})

const results = [at(0, 5), at(30, 9.25), at(60, 7)]
const pointsOf = () => graphModel(results, DEFAULT_GRAPH_SIZE).points

it('tells the time and the response time of a point under the pointer', () => {
  graph(results)
  expect(screen.queryByRole('tooltip')).toBeNull()

  fireEvent.mouseMove(screen.getByRole('img'), { clientX: pointsOf()[1].x + 2 })

  const tooltip = screen.getByRole('tooltip')
  expect(tooltip.textContent).toContain('9.3 ms')
  // In the time zone of the viewer.
  expect(tooltip.textContent).toContain(formatDateTime(results[1].ts))

  fireEvent.mouseLeave(screen.getByRole('img'))
  expect(screen.queryByRole('tooltip')).toBeNull()
})

it('shows nothing when the pointer is far from any point', () => {
  graph(results)

  fireEvent.mouseMove(screen.getByRole('img'), {
    clientX: pointsOf()[0].x + 60,
  })

  expect(screen.queryByRole('tooltip')).toBeNull()
})

it('tells the error and the response time of a failed check, or that there was no response', () => {
  graph([at(0, 5), at(30, 400, 'slow'), at(60, null, 'timeout')])
  const model = graphModel(
    [at(0, 5), at(30, 400, 'slow'), at(60, null, 'timeout')],
    DEFAULT_GRAPH_SIZE,
  )

  fireEvent.mouseMove(screen.getByRole('img'), {
    clientX: model.points[1].x,
  })
  expect(screen.getByRole('tooltip').textContent).toContain('400.0 ms')
  expect(screen.getByRole('tooltip').textContent).toContain('slow')

  fireEvent.mouseMove(screen.getByRole('img'), {
    clientX: model.points[2].x,
  })
  expect(screen.getByRole('tooltip').textContent).toContain('No response')
  expect(screen.getByRole('tooltip').textContent).toContain('timeout')
})

it('moves with its title bar', () => {
  graph(results)
  const title = screen.getByTestId('graph-handle')

  fireEvent.mouseDown(title, { clientX: 100, clientY: 100 })
  fireEvent.mouseMove(document, { clientX: 150, clientY: 130 })
  expect(box().style.transform).toBe('translate(50px, 30px)')

  fireEvent.mouseMove(document, { clientX: 90, clientY: 95 })
  fireEvent.mouseUp(document)
  expect(box().style.transform).toBe('translate(-10px, -5px)')

  // Let go: it does not follow the pointer any more.
  fireEvent.mouseMove(document, { clientX: 400, clientY: 400 })
  expect(box().style.transform).toBe('translate(-10px, -5px)')
})

it('does not start moving from its close button', () => {
  graph(results)

  fireEvent.mouseDown(screen.getByRole('button', { name: 'Close the graph' }), {
    clientX: 100,
    clientY: 100,
  })
  fireEvent.mouseMove(document, { clientX: 150, clientY: 130 })

  expect(box().style.transform).toBe('')
})

// The clock is stopped 35 seconds after the last check.
function atCheckPlus(seconds: number) {
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
  vi.setSystemTime(Date.UTC(2026, 0, 1, 0, 0, 60 + seconds))
}

const stat = (name: string) => screen.getByRole('group', { name })

it('has four cards below the graph', () => {
  atCheckPlus(35)
  graph([at(0, 10), at(30, 30), at(60, 20)])

  const cards = screen.getByTestId('graph-stats')
  expect(cards.children).toHaveLength(4)
  expect(stat('Current status')).toBeTruthy()
  expect(stat('Average response time')).toBeTruthy()
  expect(stat('Response time range')).toBeTruthy()
  expect(stat('Last check')).toBeTruthy()
  // Under the drawing, not in it.
  expect(
    screen.getByRole('img').compareDocumentPosition(cards) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy()
})

it('tells the status in a breathing badge, green when up and red when down', () => {
  atCheckPlus(35)
  graph([at(0, 10), at(60, 20)])
  const up = within(stat('Current status')).getByText('UP')
  expect(up.classList.contains('breathing')).toBe(true)
  expect(up.style.background).toBe('rgb(46, 204, 113)')
  cleanup()

  graph([at(0, 10), at(60, null, 'timeout')])
  const down = within(stat('Current status')).getByText('DOWN')
  expect(down.classList.contains('breathing')).toBe(true)
  expect(down.style.background).toBe('rgb(231, 76, 60)')
})

it('tells the average response time and its range', () => {
  atCheckPlus(35)
  graph([at(0, 10), at(30, 30), at(60, 20)])

  expect(
    within(stat('Average response time')).getByText('20.0 ms'),
  ).toBeTruthy()
  expect(
    within(stat('Response time range')).getByText('10.0 – 30.0 ms'),
  ).toBeTruthy()
})

it('has dashes for the response times when there are none', () => {
  atCheckPlus(35)
  graph([at(0, null, 'timeout')])

  expect(within(stat('Average response time')).getByText('—')).toBeTruthy()
  expect(within(stat('Response time range')).getByText('—')).toBeTruthy()
})

it('tells how long ago the last check was, and keeps counting', () => {
  atCheckPlus(35)
  graph([at(0, 10), at(60, 20)])
  expect(within(stat('Last check')).getByText('35 seconds ago')).toBeTruthy()

  act(() => {
    vi.advanceTimersByTime(30_000)
  })
  expect(within(stat('Last check')).getByText('1 minute ago')).toBeTruthy()
})

it('has cards without data too', () => {
  atCheckPlus(0)
  graph([])

  expect(within(stat('Current status')).getByText('UNKNOWN')).toBeTruthy()
  expect(within(stat('Last check')).getByText('never')).toBeTruthy()
})
