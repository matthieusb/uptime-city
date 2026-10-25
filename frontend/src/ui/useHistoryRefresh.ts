import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { REFRESH_PERIODS_MS, type RefreshMode } from './RefreshSelector'

// Lets the backend finish redrawing its simulated statuses first.
const SYNC_MARGIN_MS = 1000

// Reloads the history of every endpoint at the chosen period. Synced, it
// reloads once the simulation's next refresh (`syncDeadline`, a timestamp in
// ms) has passed, then asks for the next deadline. Tells the timestamp (ms) of
// the next reload (null when none is planned) and of the last one's start.
export function useHistoryRefresh(
  mode: RefreshMode,
  syncDeadline: number | null,
): { nextAt: number | null; startedAt: number | null } {
  const client = useQueryClient()
  const [nextAt, setNextAt] = useState<number | null>(null)
  const [startedAt, setStartedAt] = useState<number | null>(null)
  useEffect(() => {
    if (mode === 'sync') return
    const period = REFRESH_PERIODS_MS[mode]
    setNextAt(Date.now() + period)
    const timer = setInterval(() => {
      client.invalidateQueries({ queryKey: ['history'] })
      setStartedAt(Date.now())
      setNextAt(Date.now() + period)
    }, period)
    return () => clearInterval(timer)
  }, [client, mode])
  useEffect(() => {
    if (mode !== 'sync' || syncDeadline === null) return
    const timer = setTimeout(
      () => {
        client.invalidateQueries({ queryKey: ['history'] })
        client.invalidateQueries({ queryKey: ['info'] })
        setStartedAt(Date.now())
      },
      Math.max(0, syncDeadline - Date.now()) + SYNC_MARGIN_MS,
    )
    return () => clearTimeout(timer)
  }, [client, mode, syncDeadline])
  if (mode === 'sync') {
    return {
      nextAt: syncDeadline === null ? null : syncDeadline + SYNC_MARGIN_MS,
      startedAt,
    }
  }
  return { nextAt, startedAt }
}
