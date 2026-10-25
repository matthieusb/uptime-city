// Pure logic of the recovery: when a service comes back up, a shock wave like the one that
// restores a nuked tile spreads from the middle of its floor, in a circle, past the walls of the
// building, and only the floor of that service lights up green. Independent of three.js.
import type { BuildingState } from '../../domain/status'

// Seconds the wave takes to spend itself.
export const RECOVERY_S = 1.4
// The wave starts this far from the middle of the building, and ends this far past its walls.
const START_RADIUS = 0.3
const REACH = 1.6

// The services that came back up, as floors: down before, up now. Not the host (floor 0), which
// has its building rebuilt, and not a building that falls or stands again.
export function recoveredFloors(
  previous: BuildingState | null,
  next: BuildingState,
): number[] {
  if (!previous || previous.collapsed || next.collapsed) return []
  return next.floors.flatMap((status, i) =>
    i > 0 && previous.floors[i] === 'down' && status === 'up' ? [i] : [],
  )
}

// Whether the wave still shows `age` seconds after the service came back.
export const recoveryActive = (age: number): boolean =>
  age >= 0 && age < RECOVERY_S

const progress = (age: number) => Math.min(1, Math.max(0, age / RECOVERY_S))

// The radius of the front of the wave around a building of the given width: fast at first, like a
// shock, then slower.
export function waveRadius(age: number, width: number): number {
  const spent = 1 - (1 - progress(age)) ** 2
  return START_RADIUS + (width / 2 + REACH - START_RADIUS) * spent
}

// 1 for a fresh wave, down to 0 once it has spent itself.
export const waveFade = (age: number): number =>
  recoveryActive(age) ? 1 - progress(age) : 0

// How lit the floor of the service is, 1 down to 0. No other floor lights up.
export const floorFlash = (age: number): number => waveFade(age)
