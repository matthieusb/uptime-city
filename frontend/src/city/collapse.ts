// Pure collapse of a building whose host is down, independent of three.js.
// The floors drop like stones and end as a low pile of tilted slabs.
import type { Status } from '../domain/status'
import { floorBase, floorHeight, hash, seededRandom } from './layout'

export const COLLAPSE_S = 2.4
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
}

// Only a host seen up then down falls before our eyes: one that is down
// from the start, while its history loads, is shown in ruins at once.
export function trackCollapse(
  previous: Collapse | null,
  status: Status,
  now: number,
): Collapse {
  if (status !== 'down') return { status, start: null }
  if (previous?.status === 'down') return previous
  return { status, start: previous?.status === 'up' ? now : -Infinity }
}

// 0 while standing, 1 once in ruins.
export function collapseProgress(collapse: Collapse, now: number): number {
  if (collapse.start === null) return 0
  return Math.min(1, Math.max(0, (now - collapse.start) / COLLAPSE_S))
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
