import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it } from 'vitest'
import BuildingPanel from '../../../src/city/BuildingPanel'
import { MAX_BARS } from '../../../src/domain/checks'

afterEach(cleanup)

const badge = { text: 'VM', color: '#4fa6e0' }

it('shows the building name and badge', () => {
  render(<BuildingPanel name="media-vm" badge={badge} floors={[]} />)

  const header = within(screen.getByTestId('building-panel')).getByText(
    'media-vm',
    { selector: '.building-panel-title' },
  )
  expect(header).toBeTruthy()
  expect(screen.getByText('VM')).toBeTruthy()
})

it('lists every floor from the top down, with its status', () => {
  render(
    <BuildingPanel
      name="media-vm"
      badge={badge}
      floors={[
        { id: 'a', name: 'audiobookshelf', status: 'up', results: [] },
        { id: 'b', name: 'freshrss', status: 'down', results: [] },
        { id: 'c', name: 'karakeep', status: 'unknown', results: [] },
      ]}
    />,
  )

  const rows = screen.getAllByRole('listitem').map((li) => li.textContent)
  expect(rows).toEqual([
    '📈audiobookshelfup',
    '📈freshrssdown',
    '📈karakeepunknown',
  ])
})

const check = (ts: string, success: boolean) => ({
  ts,
  success,
  latency_ms: success ? 12 : null,
  error: success ? null : 'timeout',
  host_down: false,
})

it('shows the last checks of each service as bars, not a dot', () => {
  render(
    <BuildingPanel
      name="media-vm"
      badge={badge}
      floors={[
        {
          id: 'a',
          name: 'audiobookshelf',
          status: 'down',
          results: [
            check('2026-01-01T00:00:00Z', true),
            check('2026-01-01T00:01:00Z', false),
          ],
        },
        { id: 'b', name: 'freshrss', status: 'unknown', results: [] },
      ]}
    />,
  )

  const [first, second] = screen.getAllByRole('listitem')
  const greens = within(first).getAllByTestId('check-bar')
  expect(greens.map((bar) => bar.style.backgroundColor)).toEqual([
    'rgb(46, 204, 113)',
    'rgb(231, 76, 60)',
  ])
  expect(within(first).getAllByTestId('empty-bar')).toHaveLength(MAX_BARS - 2)
  expect(within(first).getByText('timeout')).toBeTruthy()
  expect(within(second).queryAllByTestId('check-bar')).toEqual([])
  expect(within(second).getAllByTestId('empty-bar')).toHaveLength(MAX_BARS)
  expect(screen.queryAllByRole('img')).toEqual([])
})

it('says so when the building has no services', () => {
  render(<BuildingPanel name="empty-vm" badge={badge} floors={[]} />)

  expect(screen.getByText('No services.')).toBeTruthy()
  expect(screen.queryAllByRole('listitem')).toEqual([])
})

it('shows UP in green, breathing, to the right of the badge when the VM host is up', () => {
  render(
    <BuildingPanel name="media-vm" badge={badge} floors={[]} hostStatus="up" />,
  )

  const status = screen.getByTestId('host-status')
  expect(status.textContent).toBe('UP')
  expect(status.style.color).toBe('rgb(46, 204, 113)')
  expect(status.classList.contains('breathing')).toBe(true)
  // After the badge, in the header.
  const header = screen.getByRole('banner')
  expect(header.lastElementChild).toBe(status)
  expect(screen.getByText('VM').nextElementSibling).toBe(status)
})

it('shows DOWN in red, breathing, when the VM host is down', () => {
  render(
    <BuildingPanel
      name="media-vm"
      badge={badge}
      floors={[]}
      hostStatus="down"
    />,
  )

  const status = screen.getByTestId('host-status')
  expect(status.textContent).toBe('DOWN')
  expect(status.style.color).toBe('rgb(231, 76, 60)')
  expect(status.classList.contains('breathing')).toBe(true)
})

it('shows no host status without one, or before the host was probed', () => {
  const { rerender } = render(
    <BuildingPanel name="media-vm" badge={badge} floors={[]} />,
  )
  expect(screen.queryByTestId('host-status')).toBeNull()

  rerender(
    <BuildingPanel
      name="media-vm"
      badge={badge}
      floors={[]}
      hostStatus="unknown"
    />,
  )
  expect(screen.queryByTestId('host-status')).toBeNull()
})

it('opens the graph of a floor from its graph button, and closes it again', async () => {
  render(
    <BuildingPanel
      name="media-vm"
      badge={badge}
      floors={[
        {
          id: 'a',
          name: 'audiobookshelf',
          status: 'up',
          results: [check('2026-01-01T00:00:00Z', true)],
        },
        { id: 'b', name: 'freshrss', status: 'up', results: [] },
      ]}
    />,
  )
  expect(screen.queryByRole('region')).toBeNull()

  const button = screen.getByRole('button', { name: 'Graph of audiobookshelf' })
  expect(button.textContent).toBe('📈')
  await userEvent.click(button)
  expect(
    screen.getByRole('region', { name: 'Response times of audiobookshelf' }),
  ).toBeTruthy()

  await userEvent.click(screen.getByRole('button', { name: 'Close the graph' }))
  expect(screen.queryByRole('region')).toBeNull()
})
