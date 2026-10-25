// Pure logic of the traffic, independent of three.js. Cars drive along the roads of the whole map
// (`World.ways`), one lane per direction, whatever the plate they are on. A car appears fading in
// where its lane begins, drives its whole length, goes around the islands of the roundabouts it
// meets, and fades out where the lane ends, at the edge of the map or where the road stops. Then,
// a few seconds later, the next car appears.
import { hash } from './layout'
import type { Way } from './world'

export const CAR_COLORS = [
  '#e63946',
  '#ffb703',
  '#219ebc',
  '#f1f1f1',
  '#8338ec',
  '#06d6a0',
]

// How far from the center line of a road the middle of a lane is.
export const LANE = 0.4
// Half the side of a roundabout, and the radius of the track around its island.
export const ROUNDABOUT = 3
export const RING = 2
// How far the ends of a lane fade the cars in and out.
export const FADE = 4
// The distance between two cars of a lane, about, and the speeds, in tiles per second.
const SPACING = 15
export const SPEED = [1.8, 2.8]
// Lanes shorter than this carry nobody.
const MIN_LENGTH = 2 * FADE

export interface Lane {
  id: string
  vertical: boolean
  // The center line of the road.
  at: number
  // Where cars appear and where they disappear, along the road (the lane runs from `start`
  // to `end`, whichever is the greater).
  start: number
  end: number
  // Which way it runs along its axis, +1 or -1.
  dir: 1 | -1
  // Tiles per second.
  speed: number
  // How far apart two cars of the lane are, along its whole loop (the lane and the gap before the
  // next car appears), and how many cars there are on the loop.
  gap: number
  count: number
  // Shifts the cars of the lane so that lanes do not move in step.
  shift: number
}

export interface Roundabout {
  x: number
  z: number
}

// Where the middle of the lane is, on the side of the road where cars drive: they keep to the same
// hand everywhere, so that they turn the same way around the roundabouts.
function side(vertical: boolean, dir: 1 | -1): number {
  return (vertical ? -dir : dir) * LANE
}

export type VehicleKind = 'car' | 'truck' | 'motorcycle'

// What car `k` of a lane is: mostly cars, with some trucks and motorcycles.
export function vehicleKind(lane: Lane, k: number): VehicleKind {
  const n = hash(`${lane.id}:${k}:kind`) % 10
  return n < 6 ? 'car' : n < 8 ? 'truck' : 'motorcycle'
}

// The two lanes of every road. A lane that ends at a roundabout stops at its ring instead of on
// its island. `density` multiplies the number of vehicles: 0 for none, 2 for twice as many.
export function lanesOf(
  ways: readonly Way[],
  roundabouts: readonly Roundabout[],
  density = 1,
): Lane[] {
  const lanes: Lane[] = []
  for (const way of ways) {
    const centers = roundabouts
      .filter((r) => Math.abs((way.vertical ? r.x : r.z) - way.at) < 1e-6)
      .map((r) => (way.vertical ? r.z : r.x))
    const trim = (c: number) =>
      centers.some((r) => Math.abs(r - c) < 1e-6) ? ROUNDABOUT : 0
    const from = way.from + trim(way.from)
    const to = way.to - trim(way.to)
    const length = to - from
    if (length < MIN_LENGTH) continue
    for (const dir of [1, -1] as const) {
      const id = `${way.vertical ? 'z' : 'x'}${way.at}:${way.from}:${dir}`
      const h = hash(id)
      const spacing = (SPACING * (0.8 + 0.4 * ((h % 97) / 97))) / density
      // Even a thin traffic has a vehicle on each lane.
      const count = density > 0 ? Math.max(1, Math.round(length / spacing)) : 0
      if (count === 0) continue
      // Room for the lane and a gap before the next car.
      const gap = Math.max(length + FADE, count * spacing) / count
      lanes.push({
        id,
        vertical: way.vertical,
        at: way.at,
        start: dir === 1 ? from : to,
        end: dir === 1 ? to : from,
        dir,
        speed: SPEED[0] + (SPEED[1] - SPEED[0]) * (((h >> 3) % 89) / 89),
        gap,
        count,
        shift: ((h >> 7) % 1013) / 1013,
      })
    }
  }
  return lanes
}

export const laneLength = (lane: Lane) => Math.abs(lane.end - lane.start)

export interface CarState {
  // Whether it is on the road at all.
  active: boolean
  // How far it has driven since it appeared.
  s: number
  // 0 to 1: it fades in as it appears and out as it disappears.
  opacity: number
}

// Car `k` of a lane, `t` seconds after the start.
export function carState(lane: Lane, k: number, t: number): CarState {
  const loop = lane.gap * lane.count
  const s0 = lane.speed * t + (lane.shift + k) * lane.gap
  const s = ((s0 % loop) + loop) % loop
  const length = laneLength(lane)
  if (s > length) return { active: false, s, opacity: 0 }
  const opacity = Math.min(1, s / FADE, (length - s) / FADE)
  return { active: true, s, opacity: Math.max(0, opacity) }
}

// How far the track of a lane is bent away from the road by the roundabouts it meets, at `a`
// along the road: cars drive around the island, on the side of their lane.
function bend(
  lane: Lane,
  a: number,
  roundabouts: readonly Roundabout[],
): number {
  let bump = 0
  for (const r of roundabouts) {
    if (Math.abs((lane.vertical ? r.x : r.z) - lane.at) > 1e-6) continue
    const d = Math.abs(a - (lane.vertical ? r.z : r.x))
    if (d < ROUNDABOUT) {
      bump = Math.max(bump, Math.cos((Math.PI / 2) * (d / ROUNDABOUT)) ** 2)
    }
  }
  const o = side(lane.vertical, lane.dir)
  return o + Math.sign(o) * (RING - Math.abs(o)) * bump
}

function place(
  lane: Lane,
  a: number,
  roundabouts: readonly Roundabout[],
): { x: number; z: number } {
  const across = lane.at + bend(lane, a, roundabouts)
  return lane.vertical ? { x: across, z: a } : { x: a, z: across }
}

// Where a car that has driven `s` tiles along a lane is, and where it heads (the rotation around Y
// that points +X along its way).
export function lanePoint(
  lane: Lane,
  s: number,
  roundabouts: readonly Roundabout[],
): { x: number; z: number; heading: number } {
  const a = lane.start + lane.dir * s
  const here = place(lane, a, roundabouts)
  const [before, after] = [-0.05, 0.05].map((d) =>
    place(lane, a + lane.dir * d, roundabouts),
  )
  return {
    ...here,
    heading: Math.atan2(-(after.z - before.z), after.x - before.x),
  }
}

export interface Plot {
  id: string
  x: number
  z: number
  halfWidth: number
  halfDepth: number
}

// The plate that a point of the map is on, if any. `hint` is tried first.
export function plateAt(
  plots: readonly Plot[],
  x: number,
  z: number,
  hint = 0,
): number {
  const inside = (p: Plot | undefined) =>
    p !== undefined &&
    Math.abs(x - p.x) <= p.halfWidth &&
    Math.abs(z - p.z) <= p.halfDepth
  if (inside(plots[hint])) return hint
  return plots.findIndex(inside)
}
