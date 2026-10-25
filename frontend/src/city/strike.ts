// The strike that nukes a neighbourhood when its physical host goes down,
// independent of three.js: a missile falls first, then the ground is nuked.
import type { Status } from '../domain/status'
import { RESTORE_S } from './effects/restoreShape'
import { MISSILE_S, STRIKE_S } from './effects/strikeShape'

export interface StrikeState {
  status: Status
  // When the strike started, in milliseconds, null when there is none to
  // play.
  startedAt: number | null
  // When the host came back up after its neighbourhood was nuked, in
  // milliseconds, if so.
  restoredAt?: number
}

// Only a host seen up then down is struck before our eyes: one that is down
// from the start, while its history loads, is shown in ruins at once, and so
// is any when animations are disabled.
export function trackStrike(
  previous: StrikeState | undefined,
  status: Status,
  now: number,
  animate = true,
): StrikeState {
  if (status !== 'down') {
    // Back up after the missile landed: the tile is restored before our eyes.
    const nuked =
      previous?.status === 'down' &&
      ['struck', 'ruins'].includes(strikePhase(previous, now))
    if (status === 'up' && animate && nuked)
      return { status, startedAt: null, restoredAt: now }
    if (previous?.status === status && previous.restoredAt !== undefined)
      return previous
    return { status, startedAt: null }
  }
  if (previous?.status === 'down') return previous
  return {
    status,
    startedAt: animate && previous?.status === 'up' ? now : null,
  }
}

export type StrikePhase = 'none' | 'incoming' | 'struck' | 'ruins' | 'restoring'

// 'incoming': the missile falls and the neighbourhood still stands.
// 'struck': it exploded, the mushroom grows and the buildings fall.
// 'restoring': the host is back, a wave brings the tile back to normal.
export function strikePhase(
  state: StrikeState | undefined,
  now: number,
  animate = true,
): StrikePhase {
  if (state?.status === 'up' && state.restoredAt !== undefined)
    return animate && now - state.restoredAt < RESTORE_S * 1000
      ? 'restoring'
      : 'none'
  if (state?.status !== 'down') return 'none'
  if (!animate) return 'ruins'
  if (state.startedAt === null) return 'ruins'
  const elapsed = (now - state.startedAt) / 1000
  if (elapsed < MISSILE_S) return 'incoming'
  return elapsed < STRIKE_S ? 'struck' : 'ruins'
}

// Once the last missile has hit, the other animations wait this long.
export const HOLD_AFTER_IMPACT_S = 1

// When the other animations may start, in milliseconds: one second after the
// last impact among the strikes that started at these times. 0 when there
// is none to wait for.
export function holdUntil(startedAts: number[]): number {
  return startedAts.reduce(
    (latest, startedAt) =>
      Math.max(latest, startedAt + (MISSILE_S + HOLD_AFTER_IMPACT_S) * 1000),
    0,
  )
}
