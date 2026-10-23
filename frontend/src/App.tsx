import { useQuery } from '@tanstack/react-query'
import { lazy, Suspense, useState } from 'react'
import { fetchEndpoints } from './api/client'
import { groupByHost } from './domain/hosts'
import HostCard from './ui/HostCard'
import TabBar from './ui/TabBar'

// Lazy, so that three.js is only loaded when the city tab is opened.
const CityView = lazy(() => import('./city/CityView'))

const TABS = [
  { id: '2d', label: '2D' },
  { id: '3d', label: '3D' },
] as const

type View = (typeof TABS)[number]['id']

export default function App() {
  const [view, setView] = useState<View>('3d')
  const { data: endpoints } = useQuery({
    queryKey: ['endpoints'],
    queryFn: fetchEndpoints,
  })
  return (
    <main className="app">
      <header className="app-header">
        <h1>uptime-city</h1>
        <TabBar
          label="View"
          tabs={[...TABS]}
          active={view}
          onChange={setView}
        />
      </header>
      <div className="app-view" role="tabpanel">
        {view === '2d' && (
          <div className="card-row" data-testid="card-row">
            {endpoints &&
              groupByHost(endpoints).map((group) => (
                <HostCard key={group.host.id} {...group} />
              ))}
          </div>
        )}
        {view === '3d' && endpoints && (
          <Suspense fallback={<p className="card-meta">Building the city…</p>}>
            <CityView endpoints={endpoints} />
          </Suspense>
        )}
      </div>
    </main>
  )
}
