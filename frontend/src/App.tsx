import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { lazy, Suspense, useState } from 'react'
import {
  fetchCity,
  fetchEndpoints,
  fetchInfo,
  regenerateCity,
} from './api/client'
import RefreshSelector, {
  decodeRefresh,
  type RefreshMode,
} from './ui/RefreshSelector'
import SimulationBadges from './ui/SimulationBadges'
import SplashScreen from './ui/SplashScreen'
import { useHistoryRefresh } from './ui/useHistoryRefresh'
import { usePersistentState } from './ui/usePersistentState'

// Lazy, so that three.js is only loaded once the endpoints are there.
const CityView = lazy(() => import('./city/CityView'))

// The splash screen stays at least this long over a regeneration, so that it does not just flash.
const MIN_REGENERATION_MS = 500

export default function App() {
  // The refresh the user picked, if any, kept for the next visit.
  const [picked, setRefresh] = usePersistentState<RefreshMode | null>(
    'refresh',
    null,
    decodeRefresh,
  )
  const { data: endpoints } = useQuery({
    queryKey: ['endpoints'],
    queryFn: fetchEndpoints,
  })
  const queryClient = useQueryClient()
  // The planet in place of the flat plan.
  const [planet, setPlanet] = useState(false)
  // What the layout of the city is drawn from.
  const { data: city } = useQuery({ queryKey: ['city'], queryFn: fetchCity })
  const regenerate = useMutation({
    mutationFn: async () => {
      const [next] = await Promise.all([
        regenerateCity(),
        new Promise((resolve) => setTimeout(resolve, MIN_REGENERATION_MS)),
      ])
      return next
    },
    onSuccess: (next) => queryClient.setQueryData(['city'], next),
  })
  // Polled so that the counter stays in step with the backend's refreshes.
  const { data: info, dataUpdatedAt } = useQuery({
    queryKey: ['info'],
    queryFn: fetchInfo,
    refetchInterval: (query) => (query.state.data?.simulation ? 5000 : false),
  })
  const nextRefreshInS = info?.next_refresh_in_s ?? null
  // Unless picked, it follows the simulation when the backend simulates. A
  // sync picked in an earlier visit does not hold once the simulation is over.
  const refresh =
    picked && (picked !== 'sync' || info?.simulation)
      ? picked
      : info?.simulation
        ? 'sync'
        : '30s'
  const { nextAt: nextRefreshAt, startedAt } = useHistoryRefresh(
    refresh,
    // A stopped simulation changes nothing: nothing to sync with.
    nextRefreshInS === null || !info?.simulation_running
      ? null
      : dataUpdatedAt + nextRefreshInS * 1000,
  )
  // The city goes away behind the splash screen while a new one is drawn.
  const ready = !!endpoints && !!city && !regenerate.isPending
  return (
    <main className="app">
      <header className="app-header">
        <h1>🏙️ Uptime City</h1>
      </header>
      <div className="app-view">
        {!ready && <SplashScreen message="Building the city…" />}
        {endpoints && city && ready && (
          <Suspense fallback={<SplashScreen message="Building the city…" />}>
            <CityView
              endpoints={endpoints}
              labName={info?.lab_name}
              seed={city.seed}
              onRegenerate={() => regenerate.mutate()}
              planet={planet}
              onTogglePlanet={() => setPlanet((now) => !now)}
              refreshMenu={
                <RefreshSelector
                  value={refresh}
                  simulation={info?.simulation ?? false}
                  nextRefreshAt={nextRefreshAt}
                  refreshStartedAt={startedAt}
                  onChange={setRefresh}
                />
              }
            />
          </Suspense>
        )}
      </div>
      {info?.simulation && (
        <SimulationBadges
          nextRefreshInS={nextRefreshInS}
          updatedAt={dataUpdatedAt}
          running={info.simulation_running}
        />
      )}
    </main>
  )
}
