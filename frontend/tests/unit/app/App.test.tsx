import {
  QueryClient,
  QueryClientProvider,
  useQueries,
} from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import App from '../../../src/App'
import { historyQuery } from '../../../src/api/queries'
import type { EndpointInfo } from '../../../src/api/client'

// jsdom has no WebGL: the 3D city is replaced by a stub listing its buildings.
// Like the city, it loads the history of every endpoint.
vi.mock('../../../src/city/CityView', () => ({
  default: function CityStub({
    endpoints,
    refreshMenu,
    seed,
    onRegenerate,
  }: {
    endpoints: EndpointInfo[]
    refreshMenu: ReactNode
    seed: string
    onRegenerate: () => void
  }) {
    useQueries({ queries: endpoints.map(historyQuery) })
    return (
      <div data-testid="city-view">
        {refreshMenu}
        <span data-testid="city-seed">{seed}</span>
        <button onClick={onRegenerate}>regenerate</button>
        {endpoints.map((e) => (
          <span key={e.id} data-testid="city-building" />
        ))}
      </div>
    )
  },
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
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

async function renderApp(
  endpoints: (typeof endpoint)[] = [endpoint],
  historyOf: (url: string) => unknown[] = () => results,
  simulation = false,
  nextRefreshInS = 42,
  running = false,
  seed = '',
) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.endsWith('/info'))
        return Response.json({
          simulation,
          simulation_running: simulation && running,
          next_refresh_in_s: simulation ? nextRefreshInS : null,
        })
      if (url.endsWith('/city')) return Response.json({ seed })
      if (url.endsWith('/city/regenerate'))
        return Response.json({ seed: 'fresh' })
      return Response.json(
        url.endsWith('/endpoints') ? endpoints : historyOf(url),
      )
    }),
  )
  render(
    <QueryClientProvider client={new QueryClient()}>
      <App />
    </QueryClientProvider>,
  )
}

it('shows a simulation badge at the bottom left only when the backend simulates', async () => {
  await renderApp([endpoint], () => results, true)

  const badge = await screen.findByText(/simulation/i)
  expect(badge.closest('.simulation-badge')).toBeTruthy()
  expect((await screen.findByTestId('refresh-counter')).textContent).toBe('42s')
  cleanup()

  await renderApp([endpoint], () => results, false)
  await screen.findByTestId('city-view')
  expect(screen.queryByText(/simulation/i)).toBeNull()
  expect(screen.queryByTestId('refresh-counter')).toBeNull()
})

it('shows the simulation counter stopped at first, with a start badge at its top right', async () => {
  await renderApp([endpoint], () => results, true)
  const counter = await screen.findByRole('button', {
    name: /start the simulation/i,
  })
  expect(counter.contains(screen.getByTestId('refresh-counter'))).toBe(true)
  expect(screen.getByTestId('refresh-counter').textContent).toBe('42s')
  const badge = screen.getByTestId('simulation-toggle-badge')
  expect(counter.contains(badge)).toBe(true)
  expect(badge.textContent).toBe('▶')
  expect(
    screen.queryByRole('button', { name: /stop the simulation/i }),
  ).toBeNull()
})

it('starts the simulation when its stopped counter is clicked', async () => {
  await renderApp([endpoint], () => results, true)
  const calls = () => vi.mocked(fetch).mock.calls
  const infos = calls().filter(([url]) => String(url).endsWith('/info')).length

  await userEvent.click(
    await screen.findByRole('button', { name: /start the simulation/i }),
  )

  await waitFor(() => {
    expect(
      calls().some(
        ([url, init]) =>
          String(url).endsWith('/simulation/start') && init?.method === 'POST',
      ),
    ).toBe(true)
    expect(
      calls().filter(([url]) => String(url).endsWith('/info')).length,
    ).toBeGreaterThan(infos)
  })
})

it('shows a stop badge on a running counter, and stops it when clicked', async () => {
  await renderApp([endpoint], () => results, true, 42, true)
  const counter = await screen.findByRole('button', {
    name: /stop the simulation/i,
  })
  expect(screen.getByTestId('simulation-toggle-badge').textContent).toBe('■')
  expect(screen.getByTestId('refresh-counter').textContent).toMatch(
    /^(42|41)s$/,
  )

  await userEvent.click(counter)

  await waitFor(() => {
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(
          ([url, init]) =>
            String(url).endsWith('/simulation/stop') && init?.method === 'POST',
        ),
    ).toBe(true)
  })
})

it('has a round button next to the simulation timer that redraws the statuses and reloads the data', async () => {
  await renderApp([endpoint], () => results, true)
  const button = await screen.findByRole('button', {
    name: /refresh the simulation/i,
  })
  expect(button.classList.contains('simulation-badge')).toBe(true)
  const calls = () => vi.mocked(fetch).mock.calls
  const count = (end: string) =>
    calls().filter(([url]) => String(url).endsWith(end)).length
  const infos = count('/info')
  const histories = count('/history?limit=50')

  await userEvent.click(button)

  await waitFor(() => {
    expect(
      calls().some(
        ([url, init]) =>
          String(url).endsWith('/simulation/refresh') &&
          init?.method === 'POST',
      ),
    ).toBe(true)
    expect(count('/info')).toBeGreaterThan(infos)
    expect(count('/history?limit=50')).toBeGreaterThan(histories)
  })
})

it('has no refresh button when the backend does not simulate', async () => {
  await renderApp([endpoint], () => results, false)
  await screen.findByTestId('city-view')
  expect(
    screen.queryByRole('button', { name: /refresh the simulation/i }),
  ).toBeNull()
})

it('gives the 3D view a refresh selector in the style of its menus, with the sync in simulation', async () => {
  await renderApp([endpoint], () => results, true)

  const selector = await screen.findByRole('combobox', { name: 'Refresh' })
  expect(selector.closest('.city-legend')).toBeTruthy()
  expect(await screen.findByText('Sync with simulation')).toBeTruthy()
})

it('syncs the refresh with the simulation by default, and keeps the choice made', async () => {
  await renderApp([endpoint], () => results, true)

  const selector = (await screen.findByRole('combobox', {
    name: 'Refresh',
  })) as HTMLSelectElement
  await waitFor(() => expect(selector.value).toBe('sync'))

  await userEvent.selectOptions(selector, '10s')
  expect(selector.value).toBe('10s')
})

it('restores the refresh picked in an earlier visit', async () => {
  await renderApp([endpoint], () => results, false)
  const first = (await screen.findByRole('combobox', {
    name: 'Refresh',
  })) as HTMLSelectElement
  await userEvent.selectOptions(first, '5m')
  cleanup()

  await renderApp([endpoint], () => results, false)
  const second = (await screen.findByRole('combobox', {
    name: 'Refresh',
  })) as HTMLSelectElement
  expect(second.value).toBe('5m')
})

it('ignores a stored sync with the simulation when the backend does not simulate', async () => {
  localStorage.setItem('uptime-city:refresh', JSON.stringify('sync'))
  await renderApp([endpoint], () => results, false)

  const selector = (await screen.findByRole('combobox', {
    name: 'Refresh',
  })) as HTMLSelectElement
  expect(selector.value).toBe('30s')
})

it('refreshes every 30s by default when the backend does not simulate', async () => {
  await renderApp([endpoint], () => results, false)

  const selector = (await screen.findByRole('combobox', {
    name: 'Refresh',
  })) as HTMLSelectElement
  expect(selector.value).toBe('30s')
})

it('shows the city, with one building per endpoint', async () => {
  await renderApp()

  expect(await screen.findByTestId('city-view')).toBeTruthy()
  expect(await screen.findAllByTestId('city-building')).toHaveLength(1)
})

it('names the app Uptime City, preceded by a building emoji', async () => {
  await renderApp()
  await screen.findByTestId('city-view')
  expect(
    screen.getByRole('heading', { level: 1, name: '🏙️ Uptime City' }),
  ).toBeTruthy()
})

it('builds the city with the seed kept by the backend', async () => {
  await renderApp([endpoint], () => results, false, 42, false, 'kept')

  expect((await screen.findByTestId('city-seed')).textContent).toBe('kept')
})

it('posts to regenerate the city, showing the splash screen until the new one is built', async () => {
  await renderApp()
  await screen.findByTestId('city-view')

  await userEvent.click(screen.getByRole('button', { name: 'regenerate' }))

  expect(await screen.findByText('Building the city…')).toBeTruthy()
  expect(screen.queryByTestId('city-view')).toBeNull()
  await waitFor(
    () => {
      expect(
        vi
          .mocked(fetch)
          .mock.calls.some(
            ([url, init]) =>
              String(url).endsWith('/city/regenerate') &&
              init?.method === 'POST',
          ),
      ).toBe(true)
      expect(screen.queryByText('Building the city…')).toBeNull()
      expect(screen.getByTestId('city-seed').textContent).toBe('fresh')
    },
    { timeout: 3000 },
  )
})
