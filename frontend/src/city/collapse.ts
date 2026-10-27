// Pure collapse of a building whose host is down, independent of three.js.
// The floors drop like stones and end as a low pile of tilted slabs.
import type { Status } from '../domain/status'
import { floorBase, floorHeight, hash, seededRandom } from './layout'

export const COLLAPSE_S = 2.4
// A building goes back up floor by floor over this long.
export const REBUILD_S = 7
// Charges go off at the foot of a building for this long, before it falls.
export const PRELUDE_S = 1.2
// Height of the top of the rubble, whatever the number of floors.
export const RUBBLE_HEIGHT = 1.4
// How flat a floor ends up in the rubble.
const SQUASH = 0.35
const MAX_TILT = 0.4
const MAX_DRIFT = 0.4

export interface Collapse {
  status: Status
  // When the fall started, -Infinity for a building already in ruins on
  // load, null while it stands.
  start: number | null
  // When the host came back up after a fall, if so: the building is rebuilt
  // from there.
  rebuildStart?: number
}

// Only a host seen up then down falls before our eyes: one that is down
// from the start, while its history loads, is shown in ruins at once.
// While `held`, a host that goes down stays standing, and starts to fall once
// released: the nuke explosions go first, to keep the animations smooth.
export function trackCollapse(
  previous: Collapse | null,
  status: Status,
  now: number,
  held = false,
  rebuild = false,
): Collapse {
  if (held && previous?.status === 'up') return previous
  if (status !== 'down') {
    // Back up after a fall before our eyes: the building is rebuilt.
    if (rebuild && status === 'up' && previous?.status === 'down')
      return { status, start: null, rebuildStart: now }
    if (previous?.status === status && previous.rebuildStart !== undefined)
      return previous
    return { status, start: null }
  }
  if (previous?.status === 'down') return previous
  return { status, start: previous?.status === 'up' ? now : -Infinity }
}

// Whether a host seen back up rebuilds its building before our eyes: not while the tile is being
// restored (the wave stands the building up again, and a rebuild started under it would go on
// after the wave is gone) nor while it lies in ruins at once.
export const rebuildWanted = (
  demolished: boolean,
  restoring: boolean,
  ruined: boolean,
): boolean => demolished && !restoring && !ruined

// The collapse of a building seen up in a restored tile once the wave has reached it, `since`
// seconds ago: it stays in ruins until then, and is rebuilt from the moment the wave passed.
export function rebuiltAfterWave(
  collapse: Collapse,
  now: number,
  since: number,
): Collapse {
  if (collapse.rebuildStart !== undefined) return collapse
  return { status: 'up', start: null, rebuildStart: now - Math.max(0, since) }
}

// Seconds since the rebuild began, or null when the building was not rebuilt
// before our eyes.
export function rebuildElapsed(collapse: Collapse, now: number): number | null {
  if (collapse.rebuildStart === undefined) return null
  return Math.max(0, now - collapse.rebuildStart)
}

// 0 while the building is not being rebuilt, then up to 1 as it goes up
// again, and null once rebuilt (or when it never was).
export function rebuildProgress(
  collapse: Collapse,
  now: number,
): number | null {
  if (collapse.rebuildStart === undefined) return null
  const progress = (now - collapse.rebuildStart) / REBUILD_S
  return progress < 1 ? Math.max(0, progress) : null
}

// 0 while standing, 1 once in ruins. The fall begins `delay` seconds after the
// host went down.
export function collapseProgress(
  collapse: Collapse,
  now: number,
  delay = 0,
): number {
  if (collapse.start === null) return 0
  return Math.min(1, Math.max(0, (now - collapse.start - delay) / COLLAPSE_S))
}

// Seconds since the host went down while the charges go off, or null when
// they do not: standing, already fallen, or in ruins since the load.
export function demolitionElapsed(
  collapse: Collapse,
  now: number,
): number | null {
  if (collapse.start === null || collapse.start === -Infinity) return null
  const elapsed = now - collapse.start
  return elapsed >= 0 && elapsed < PRELUDE_S ? elapsed : null
}

// Seconds since the building hit the ground, or null before that and for a
// building that never fell before our eyes.
export function smokeAge(
  collapse: Collapse,
  now: number,
  delay = 0,
): number | null {
  if (collapse.start === null || collapse.start === -Infinity) return null
  const age = now - collapse.start - delay - COLLAPSE_S
  return age >= 0 ? age : null
}

// Placement of a floor's center, relative to its lot, with its tilt around
// X and Z and its vertical scale.
export interface Pose {
  x: number
  y: number
  z: number
  rx: number
  rz: number
  sy: number
}

export function floorPose(
  id: string,
  floor: number,
  floors: number,
  progress: number,
): Pose {
  const standing = floorBase(floor) + floorHeight(floor) / 2
  if (progress <= 0) return { x: 0, y: standing, z: 0, rx: 0, rz: 0, sy: 1 }
  // The pile keeps the floors in order, squeezed below RUBBLE_HEIGHT.
  const rank = floors > 1 ? floor / (floors - 1) : 0
  const lying = 0.35 + rank * (RUBBLE_HEIGHT - 0.7)
  // Seeded, so that each building falls its own way.
  const random = seededRandom(hash(`rubble:${id}:${floor}`))
  const spread = (max: number) => (random() * 2 - 1) * max
  // Accelerates like a falling stone.
  const fall = progress * progress
  return {
    x: spread(MAX_DRIFT) * fall,
    y: standing + (lying - standing) * fall,
    z: spread(MAX_DRIFT) * fall,
    rx: spread(MAX_TILT) * fall,
    rz: spread(MAX_TILT) * fall,
    sy: 1 + (SQUASH - 1) * fall,
  }
}
