import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import App from '../../src/App'

// jsdom has no WebGL: the 3D city is replaced by a stub listing its buildings.
vi.mock('../../src/city/CityView', () => ({
  default: ({ endpoints }: { endpoints: { id: string }[] }) => (
    <div data-testid="city-view">
      {endpoints.map((e) => (
        <span key={e.id} data-testid="city-building" />
      ))}
    </div>
  ),
}))

const endpoint = {
  id: 'macro-server1',
  name: 'macro-server1',
  hostname: 'macro-server1',
  interval_s: 30,
  host_id: null,
  kind: 'physical' as const,
  parent_id: null,
}
const service = {
  id: 'macro-server1-ssh',
  name: 'ssh',
  hostname: 'macro-server1',
  interval_s: 30,
  host_id: 'macro-server1',
  kind: 'service' as const,
  parent_id: null,
}
const vmHost = {
  id: 'monitoring-vm',
  name: 'monitoring-vm',
  hostname: 'monitoring-vm',
  interval_s: 30,
  host_id: null,
  kind: 'vm' as const,
  parent_id: 'macro-server1',
}
const vmService = {
  id: 'monitoring-vm-web',
  name: 'web',
  hostname: 'monitoring-vm',
  interval_s: 30,
  host_id: 'monitoring-vm',
  kind: 'service' as const,
  parent_id: null,
}
const results = [
  {
    ts: '2026-01-01T00:00:00Z',
    success: true,
    latency_ms: 3.4,
    error: null,
    host_down: false,
  },
  {
    ts: '2026-01-01T00:00:30Z',
    success: false,
    latency_ms: null,
    error: 'no reply',
    host_down: false,
  },
]
const hostDownResults = [
  {
    ts: '2026-01-01T00:00:30Z',
    success: false,
    latency_ms: null,
    error: 'host is down',
    host_down: true,
  },
]

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

// The app opens on the 3D tab: `tab` is the one to open first, or null to stay on it.
async function renderApp(
  endpoints: (typeof endpoint | typeof service | typeof vmHost)[] = [endpoint],
  historyOf: (url: string) => unknown[] = () => results,
  tab: '2D' | '3D' | null = '2D',
) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      Response.json(url.endsWith('/endpoints') ? endpoints : historyOf(url)),
    ),
  )
  render(
    <QueryClientProvider client={new QueryClient()}>
      <App />
    </QueryClientProvider>,
  )
  if (tab) await userEvent.click(await screen.findByRole('tab', { name: tab }))
}

it('shows one bar per check, green when ok and red on error', async () => {
  await renderApp()

  expect(await screen.findByText('macro-server1')).toBeTruthy()
  const bars = await screen.findAllByTestId('check-bar')
  expect(bars).toHaveLength(2)
  expect(bars[0].style.backgroundColor).toBe('rgb(46, 204, 113)')
  expect(bars[1].style.backgroundColor).toBe('rgb(231, 76, 60)')
})

it('opens on the 3D tab, without the cards', async () => {
  await renderApp([endpoint], () => results, null)

  expect(
    screen.getByRole('tab', { name: '3D' }).getAttribute('aria-selected'),
  ).toBe('true')
  expect(await screen.findByTestId('city-view')).toBeTruthy()
  expect(await screen.findAllByTestId('city-building')).toHaveLength(1)
  expect(screen.queryByTestId('card-row')).toBeNull()
})

it('shows the cards alone in the 2D tab, without loading the city', async () => {
  await renderApp()

  expect(await screen.findByTestId('card-row')).toBeTruthy()
  expect(
    screen.getByRole('tab', { name: '2D' }).getAttribute('aria-selected'),
  ).toBe('true')
  expect(screen.queryByTestId('city-view')).toBeNull()
})

it('goes back to the city from the 2D tab', async () => {
  await renderApp()
  await screen.findByTestId('card-row')

  await userEvent.click(screen.getByRole('tab', { name: '3D' }))

  expect(await screen.findByTestId('city-view')).toBeTruthy()
  expect(screen.queryByTestId('card-row')).toBeNull()
})

it('nests the service cards inside their host card', async () => {
  await renderApp([endpoint, service])

  const hostCard = await screen.findByTestId('host-card')
  expect(
    hostCard.querySelectorAll('[data-testid="service-card"]'),
  ).toHaveLength(1)
  expect(within(hostCard).getByText('ssh')).toBeTruthy()
})

it('shows the host as a header, not as a nested card', async () => {
  await renderApp([endpoint, service])

  const hostCard = await screen.findByTestId('host-card')
  const header = within(hostCard).getByTestId('host-header')
  expect(within(header).getByText('macro-server1')).toBeTruthy()
  expect(await within(header).findAllByTestId('check-bar')).toHaveLength(2)
  expect((await within(header).findByTestId('status')).textContent).toBe('down')
  // Only the service is a card.
  expect(hostCard.querySelectorAll('.card')).toHaveLength(1)
  expect(within(hostCard).getAllByTestId('service-card')).toHaveLength(1)
  expect(within(hostCard).getByTestId('host-separator')).toBeTruthy()
})

it('shows a host without services as a header and a separator', async () => {
  await renderApp()

  const hostCard = await screen.findByTestId('host-card')
  expect(within(hostCard).getByTestId('host-header')).toBeTruthy()
  expect(hostCard.querySelectorAll('.card')).toHaveLength(0)
  expect(within(hostCard).getByTestId('host-separator')).toBeTruthy()
  expect(within(hostCard).queryAllByTestId('service-card')).toHaveLength(0)
})

it('badges a service as host down when its host is down', async () => {
  await renderApp([endpoint, service], (url) =>
    url.includes('-ssh') ? hostDownResults : results,
  )

  const card = await screen.findByTestId('service-card')
  expect(await within(card).findByText('host down')).toBeTruthy()
  expect(within(card).queryByTestId('status')).toBeNull()
})

it('shows no host-down badge on a plain failure', async () => {
  await renderApp([endpoint, service])

  const card = await screen.findByTestId('service-card')
  expect(await within(card).findByTestId('average-latency')).toBeTruthy()
  expect(within(card).queryByTestId('status')).toBeNull()
  expect(within(card).queryByText('host down')).toBeNull()
})

it('marks a physical host with a badge', async () => {
  await renderApp([endpoint, service])

  const header = await screen.findByTestId('host-header')
  expect(within(header).getByTestId('kind-badge').textContent).toBe('physical')
})

it('nests a vm-host card in its physical host, above the physical host services', async () => {
  await renderApp([endpoint, service, vmHost, vmService])

  const physical = await screen.findByTestId('host-card')
  const vm = await within(physical).findByTestId('vm-host-card')
  expect(
    within(within(vm).getByTestId('host-header')).getByTestId('kind-badge')
      .textContent,
  ).toBe('VM')
  // The vm-host's service is in the vm-host card, not in the physical one.
  expect(within(vm).getByText('web')).toBeTruthy()
  expect(within(vm).queryByText('ssh')).toBeNull()
  const ssh = within(physical).getByText('ssh')
  expect(
    vm.compareDocumentPosition(ssh) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy()
  expect(screen.getAllByTestId('host-card')).toHaveLength(1)
})
