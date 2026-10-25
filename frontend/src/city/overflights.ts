// Pure logic of the planes that cross the sky from one edge of the map to another, just above the
// clouds, at random and unrelated to the airport. Each of the planes of the sky has a cycle of its
// own, long enough for the longest crossing; in each cycle it makes one, with its own edges, kind
// and livery drawn by hash, and starts at a moment of the cycle drawn the same way.
import { CRAFT, LIVERIES, OUT, PLANE_KINDS } from './flights'
import type { PlaneKind, PlaneState } from './flights'
import { hash } from './layout'

export interface SkyBounds {
  halfWidth: number
  halfDepth: number
}

// The sky planes are a bit faster than the planes of the airport.
const SPEED = 1.4
// The most a plane strays from the middle of an edge, as a share of the half length of that edge.
const SPREAD = 0.85
// Seconds in a cycle that no crossing takes, and what each plane adds to it so that they are
// not all on the same beat.
const IDLE = 2
const STAGGER = 3
// How much higher or lower than the cruise height a flight is, at most.
const LEVELS = 2

// The planes of the sky at the normal density, and at the most: twice the planes of the airport, as
// it is the sky that shows the planes most of the time.
export const SKY_BASE_PLANES = 6
export const SKY_PLANES = 2 * SKY_BASE_PLANES

// How many planes cross the sky at a density: none at 0, at least one otherwise.
export function overflightCount(density: number): number {
  return density > 0
    ? Math.min(SKY_PLANES, Math.max(1, Math.round(SKY_BASE_PLANES * density)))
    : 0
}

// The edges, in turn: -X, +X, -Z, +Z.
export type Side = 0 | 1 | 2 | 3

// Where a plane is, outside the edge `side`, at `u` (-1 to 1) along it.
function outside(
  { halfWidth, halfDepth }: SkyBounds,
  side: Side,
  u: number,
): [number, number] {
  const out = OUT + 4
  if (side === 0) return [-halfWidth - out, u * halfDepth]
  if (side === 1) return [halfWidth + out, u * halfDepth]
  if (side === 2) return [u * halfWidth, -halfDepth - out]
  return [u * halfWidth, halfDepth + out]
}

const unit = (text: string) => (hash(text) % 10000) / 10000
const slowest = Math.min(...PLANE_KINDS.map((k) => CRAFT[k].vFly)) * SPEED

// Seconds of the cycle of plane `i`: the longest crossing of the map (corner to corner) at the
// slowest speed, plus a pause.
export function overflightCycle(bounds: SkyBounds, i: number): number {
  const reach = Math.hypot(
    2 * bounds.halfWidth + 2 * (OUT + 4),
    2 * bounds.halfDepth + 2 * (OUT + 4),
  )
  return reach / slowest + IDLE + STAGGER * i
}

// The kind of the flight, by hash, with the weights of the kinds of plane.
function kindOf(i: number, c: number): PlaneKind {
  const total = PLANE_KINDS.reduce((sum, k) => sum + CRAFT[k].weight, 0)
  let roll = hash(`sky:${i}:${c}:kind`) % total
  for (const k of PLANE_KINDS) {
    roll -= CRAFT[k].weight
    if (roll < 0) return k
  }
  return PLANE_KINDS[0]
}

// What is fixed about the crossing of plane `i` in cycle `c`.
export function overflightTimes(bounds: SkyBounds, i: number, c: number) {
  const enter = (hash(`sky:${i}:${c}:enter`) % 4) as Side
  const exit = ((enter + 1 + (hash(`sky:${i}:${c}:exit`) % 3)) % 4) as Side
  const spread = (what: string) =>
    (unit(`sky:${i}:${c}:${what}`) * 2 - 1) * SPREAD
  const from = outside(bounds, enter, spread('from'))
  const to = outside(bounds, exit, spread('to'))
  const kind = kindOf(i, c)
  const speed = CRAFT[kind].vFly * SPEED
  const length = Math.hypot(to[0] - from[0], to[1] - from[1])
  const cycle = overflightCycle(bounds, i)
  const duration = length / speed
  const start = c * cycle + unit(`sky:${i}:${c}:start`) * (cycle - duration)
  return {
    enter,
    exit,
    from,
    to,
    kind,
    speed,
    start,
    end: start + duration,
    livery: hash(`sky:${i}:${c}:livery`) % LIVERIES,
    level: unit(`sky:${i}:${c}:level`) * LEVELS,
  }
}

const IDLE_STATE: PlaneState = {
  active: false,
  x: 0,
  y: 0,
  z: 0,
  heading: 0,
  pitch: 0,
  livery: 0,
  kind: 'tourism',
}

// Plane `i` of the sky at time `t` (seconds), in the frame of the map, or inactive. `cruise` is the
// height above the ground at which the planes fly (see `cruiseHeight`).
export function overflightState(
  bounds: SkyBounds,
  cruise: number,
  i: number,
  t: number,
): PlaneState {
  if (i >= SKY_PLANES) return IDLE_STATE
  const c = Math.floor(t / overflightCycle(bounds, i))
  const f = overflightTimes(bounds, i, c)
  if (t < f.start || t > f.end) return IDLE_STATE
  const u = (t - f.start) / (f.end - f.start)
  const dx = f.to[0] - f.from[0]
  const dz = f.to[1] - f.from[1]
  return {
    active: true,
    x: f.from[0] + dx * u,
    y: cruise + CRAFT[f.kind].climb.cap + f.level,
    z: f.from[1] + dz * u,
    heading: Math.atan2(-dz, dx),
    pitch: 0,
    livery: f.livery,
    kind: f.kind,
  }
}
