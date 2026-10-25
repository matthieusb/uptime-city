import { useReducer, useRef } from 'react'
import type { Status } from '../domain/status'
import {
  strikePhase,
  trackStrike,
  type StrikePhase,
  type StrikeState,
} from './strike'

export interface Strikes {
  phases: ReadonlyMap<string, StrikePhase>
  // When each strike in progress started, in milliseconds.
  startedAt: ReadonlyMap<string, number>
  // When each restoration in progress started, in milliseconds.
  restoredAt: ReadonlyMap<string, number>
  // To call when a strike moves on to its next phase.
  refresh: () => void
}

// The strike of each neighbourhood, from the status of its physical host.
export function useStrikes(
  statuses: ReadonlyMap<string, Status>,
  animate: boolean,
): Strikes {
  const states = useRef(new Map<string, StrikeState>())
  const [, refresh] = useReducer((n: number) => n + 1, 0)
  const now = Date.now()
  // Worked out while rendering, so that a host that just went down never
  // shows in ruins for a frame. Idempotent for the same statuses.
  const next = new Map<string, StrikeState>()
  for (const [id, status] of statuses)
    next.set(id, trackStrike(states.current.get(id), status, now, animate))
  states.current = next
  const phases = new Map<string, StrikePhase>()
  const startedAt = new Map<string, number>()
  const restoredAt = new Map<string, number>()
  for (const [id, state] of next) {
    phases.set(id, strikePhase(state, now, animate))
    if (state.startedAt !== null) startedAt.set(id, state.startedAt)
    if (state.restoredAt !== undefined) restoredAt.set(id, state.restoredAt)
  }
  return { phases, startedAt, restoredAt, refresh: refresh as () => void }
}
