import type { CheckResult } from '../api/client'

export type Status = 'up' | 'down' | 'unknown'

const COLORS: Record<Status, string> = {
  up: '#2ecc71',
  down: '#e74c3c',
  unknown: '#95a5a6',
}

export function statusColor(status: Status): string {
  return COLORS[status]
}

export function latestStatus(results: CheckResult[] | undefined): Status {
  const latest = results?.at(-1)
  if (!latest) return 'unknown'
  return latest.success ? 'up' : 'down'
}

// A service is not probed while its host is down: its latest result says so.
export function isHostDown(results: CheckResult[] | undefined): boolean {
  return results?.at(-1)?.host_down ?? false
}

export interface Glow {
  color: string
  intensity: number
  onFire: boolean
}

// Oscillates between 0 and 1 with the given period, in seconds.
const wave = (timeS: number, periodS: number) =>
  0.5 + 0.5 * Math.sin((2 * Math.PI * timeS) / periodS)

// Seconds of a breath of the badges that count services.
export const BADGE_BREATH_S = 4

// The least opaque a counting badge gets: it only dims a little.
export const BADGE_BREATH_MIN = 0.8

// How opaque a counting badge is at a given time: it breathes between a
// slightly dimmed and a full badge, as slowly as the green glow of a building.
export function badgeBreath(timeS: number): number {
  return BADGE_BREATH_MIN + (1 - BADGE_BREATH_MIN) * wave(timeS, BADGE_BREATH_S)
}

// How a building glows at a given time: a slow green breath when up,
// a slow red blink while burning when down.
export function buildingGlow(status: Status, timeS: number): Glow {
  switch (status) {
    case 'up':
      return {
        color: COLORS.up,
        intensity: 0.15 + 0.3 * wave(timeS, 4),
        onFire: false,
      }
    case 'down':
      return {
        color: COLORS.down,
        intensity: 0.15 + 0.85 * wave(timeS, 3),
        onFire: true,
      }
    case 'unknown':
      return { color: COLORS.unknown, intensity: 0, onFire: false }
  }
}

// A service that was not probed because its host is down tells nothing
// about itself.
export function floorStatus(results: CheckResult[] | undefined): Status {
  return isHostDown(results) ? 'unknown' : latestStatus(results)
}

export interface BuildingState {
  // The host itself is down: the building falls.
  collapsed: boolean
  // The ground floor is the host, then one floor per service.
  floors: Status[]
  burning: boolean[]
}

// A building in a neighbourhood that was nuked: all in ruins, nothing burns.
export function nukedState(floors: number): BuildingState {
  return {
    collapsed: true,
    floors: Array.from({ length: floors }, () => 'down' as const),
    burning: Array.from({ length: floors }, () => false),
  }
}

// How a host's building looks: its floors burn when their own service is
// down, and it all falls when the host is down.
export function buildingState(
  host: CheckResult[] | undefined,
  services: (CheckResult[] | undefined)[],
): BuildingState {
  const collapsed = latestStatus(host) === 'down'
  const floors = [latestStatus(host), ...services.map(floorStatus)]
  return {
    collapsed,
    floors,
    burning: floors.map(
      (status, i) => !collapsed && i > 0 && buildingGlow(status, 0).onFire,
    ),
  }
}
