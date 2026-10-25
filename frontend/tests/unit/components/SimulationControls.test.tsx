import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import SimulationBadges from '../../../src/ui/SimulationBadges'

const info = {
  lab_name: 'lab',
  simulation: true,
  simulation_running: false,
  next_refresh_in_s: 30,
}

// No query is mounted here, so a reload is told by what the client is asked to invalidate.
const client = new QueryClient()

function renderBadges(running = false) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ ...info, simulation_running: running })),
  )
  render(
    <QueryClientProvider client={client}>
      <SimulationBadges
        nextRefreshInS={30}
        updatedAt={Date.now()}
        running={running}
      />
    </QueryClientProvider>,
  )
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const NAMES = [
  'Reset everything up',
  'Nuke a host',
  'Demolish a VM',
  'Down services',
  'Revive a host',
  'Revive a VM',
  'Revive services',
]

// The box is closed at first: an arrow on top of the simulation badge opens it.
async function open() {
  await userEvent.click(
    screen.getByRole('button', { name: 'Show the simulation events' }),
  )
}

it('has the box closed at first, with an arrow on top of the simulation badge to open it', () => {
  renderBadges(false)
  // Still there, so that it can slide, but shut and out of reach.
  const box = screen.getByTestId('simulation-controls')
  expect(box.getAttribute('data-open')).toBe('false')
  expect(box.getAttribute('aria-hidden')).toBe('true')
  expect(box.hasAttribute('inert')).toBe(true)
  expect(screen.queryByRole('button', { name: 'Nuke a host' })).toBeNull()
  const arrow = screen.getByRole('button', {
    name: 'Show the simulation events',
  })
  expect(arrow.getAttribute('aria-expanded')).toBe('false')
  const badge = screen.getByText('Simulation')
  expect(badge.parentElement!.contains(arrow)).toBe(true)
})

it('slides the box open with the arrow and shut again', async () => {
  renderBadges(false)
  await open()
  const arrow = screen.getByRole('button', {
    name: 'Hide the simulation events',
  })
  const box = screen.getByTestId('simulation-controls')
  expect(arrow.getAttribute('aria-expanded')).toBe('true')
  expect(box.getAttribute('data-open')).toBe('true')
  expect(box.hasAttribute('inert')).toBe(false)
  expect(screen.getByRole('button', { name: 'Nuke a host' })).toBeTruthy()

  await userEvent.click(arrow)

  // Not removed: it slides down and out of sight.
  expect(screen.getByTestId('simulation-controls')).toBe(box)
  expect(box.getAttribute('data-open')).toBe('false')
  expect(box.hasAttribute('inert')).toBe(true)
  expect(screen.queryByRole('button', { name: 'Nuke a host' })).toBeNull()
  expect(
    screen.getByRole('button', { name: 'Show the simulation events' }),
  ).toBeTruthy()
})

it('has a button for each event, in a box above the simulation badge, once opened', async () => {
  renderBadges(false)
  await open()
  const box = screen.getByTestId('simulation-controls')
  for (const name of NAMES) {
    expect(box.contains(screen.getByRole('button', { name }))).toBe(true)
  }
  const badges = box.parentElement!
  expect(badges.firstElementChild).toBe(box)
  expect(box.querySelector('.simulation-controls')).toBeTruthy()
})

it('has neither the arrow nor the box while the simulation runs', () => {
  renderBadges(true)
  expect(screen.queryByTestId('simulation-controls')).toBeNull()
  expect(screen.queryByRole('button', { name: 'Nuke a host' })).toBeNull()
  expect(
    screen.queryByRole('button', { name: /the simulation events/ }),
  ).toBeNull()
})

it.each([
  ['Reset everything up', 'reset'],
  ['Nuke a host', 'nuke-host'],
  ['Demolish a VM', 'demolish-vm'],
  ['Revive a host', 'revive-host'],
  ['Revive a VM', 'revive-vm'],
])(
  '%s sends %s, then reloads the info and the statuses',
  async (name, action) => {
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    renderBadges(false)
    await open()
    await userEvent.click(screen.getByRole('button', { name }))
    await waitFor(() => {
      const calls = vi.mocked(fetch).mock.calls
      expect(
        calls.some(
          ([url, init]) =>
            String(url) === `/api/v1/simulation/actions/${action}` &&
            init?.method === 'POST',
        ),
      ).toBe(true)
      const keys = invalidate.mock.calls.map(([filters]) => filters?.queryKey)
      expect(keys).toContainEqual(['info'])
      expect(keys).toContainEqual(['history'])
    })
  },
)

it('sends the number of services to the two buttons that take one', async () => {
  renderBadges(false)
  await open()
  const count = screen.getByRole('spinbutton', { name: 'Number of services' })
  expect((count as HTMLInputElement).value).toBe('1')
  await userEvent.clear(count)
  await userEvent.type(count, '3')

  await userEvent.click(screen.getByRole('button', { name: 'Down services' }))
  await userEvent.click(screen.getByRole('button', { name: 'Revive services' }))

  await waitFor(() => {
    const urls = vi.mocked(fetch).mock.calls.map(([url]) => String(url))
    expect(urls).toContain('/api/v1/simulation/actions/down-services?count=3')
    expect(urls).toContain('/api/v1/simulation/actions/revive-services?count=3')
  })
})

it('keeps the number of services at one or more', async () => {
  renderBadges(false)
  await open()
  const count = screen.getByRole('spinbutton', { name: 'Number of services' })
  await userEvent.clear(count)
  await userEvent.type(count, '0')
  await userEvent.click(screen.getByRole('button', { name: 'Down services' }))
  await waitFor(() => {
    const urls = vi.mocked(fetch).mock.calls.map(([url]) => String(url))
    expect(urls).toContain('/api/v1/simulation/actions/down-services?count=1')
  })
})
