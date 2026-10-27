import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { lazy, Suspense, useEffect, useState } from 'react'
import {
  fetchCity,
  fetchEndpoints,
  fetchInfo,
  fetchPlanet,
  regenerateCity,
  regeneratePlanet,
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

// The splash screen stays at least this long over a regeneration or a change of view, so that it
// does not just flash.
const MIN_REGENERATION_MS = 500

// Reads back the stored view (see `usePersistentState`): the planet or the flat plan.
const decodePlanet = (raw: unknown): boolean | undefined =>
  typeof raw === 'boolean' ? raw : undefined

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
  // The planet in place of the flat plan, kept for the next visit.
  const [planet, setPlanet] = usePersistentState('planet', false, decodePlanet)
  // The splash screen covers a change of view for a moment.
  const [switching, setSwitching] = useState(false)
  useEffect(() => {
    if (!switching) return
    const timer = setTimeout(() => setSwitching(false), MIN_REGENERATION_MS)
    return () => clearTimeout(timer)
  }, [switching])
  const togglePlanet = () => {
    setSwitching(true)
    setPlanet((now) => !now)
  }
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
  // What the layout of the planet is drawn from, kept apart from the city's, only asked for on it.
  const { data: planetSettings } = useQuery({
    queryKey: ['planet'],
    queryFn: fetchPlanet,
    enabled: planet,
  })
  const regeneratePlanetSeed = useMutation({
    mutationFn: async () => {
      const [next] = await Promise.all([
        regeneratePlanet(),
        new Promise((resolve) => setTimeout(resolve, MIN_REGENERATION_MS)),
      ])
      return next
    },
    onSuccess: (next) => queryClient.setQueryData(['planet'], next),
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
  const ready =
    !!endpoints &&
    !!city &&
    (!planet || !!planetSettings) &&
    !regenerate.isPending &&
    !regeneratePlanetSeed.isPending &&
    !switching
  const splash = planet ? 'Building the planet…' : 'Building the city…'
  return (
    <main className="app">
      <header className="app-header">
        <h1>🏙️ Uptime City</h1>
      </header>
      <div className="app-view">
        {!ready && <SplashScreen message={splash} />}
        {endpoints && city && ready && (
          <Suspense fallback={<SplashScreen message={splash} />}>
            <CityView
              endpoints={endpoints}
              labName={info?.lab_name}
              seed={city.seed}
              onRegenerate={() =>
                planet ? regeneratePlanetSeed.mutate() : regenerate.mutate()
              }
              planet={planet}
              planetSeed={planetSettings?.seed}
              onTogglePlanet={togglePlanet}
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
