// The planes of the planet's sky: each one circles the planet along a great circle of its own,
// above the clouds, for ever. Pure logic, independent of three.js.
import { CRAFT, LIVERIES, PLANE_KINDS, type PlaneKind } from '../flights'
import { hash } from '../layout'
import { add, cross, scale, unit, type Vec3 } from './sphere'

// How high over the sea they fly.
export const SKY_ALTITUDE = 16
// How much higher or lower than that a plane flies, at most.
const LEVELS = 2
// They are a bit faster than the planes of the airport, as on the flat map.
const SPEED = 1.4

const roll = (text: string) => (hash(text) % 10000) / 10000

export interface SkyFlight {
  position: Vec3
  // The way it heads, and its up, away from the middle of the planet.
  xAxis: Vec3
  yAxis: Vec3
  kind: PlaneKind
  livery: number
}

// Where plane `i` is at time `t`, round a planet of this radius.
export function skyFlight(radius: number, i: number, t: number): SkyFlight {
  // A direction drawn by hash, and a second one across it, make the plane of its circle.
  const start = unit([
    roll(`sky:${i}:x`) - 0.5,
    roll(`sky:${i}:y`) - 0.5,
    roll(`sky:${i}:z`) - 0.5,
  ])
  const aside = unit(
    cross(start, Math.abs(start[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0]),
  )
  const across = roll(`sky:${i}:turn`) < 0.5 ? aside : scale(aside, -1)
  const kind = PLANE_KINDS[hash(`sky:${i}:kind`) % PLANE_KINDS.length]
  const altitude = SKY_ALTITUDE + (roll(`sky:${i}:level`) * 2 - 1) * LEVELS
  const angular = (CRAFT[kind].vFly * SPEED) / (radius + altitude)
  const angle = roll(`sky:${i}:phase`) * 2 * Math.PI + angular * t
  const [cos, sin] = [Math.cos(angle), Math.sin(angle)]
  const direction = add(scale(start, cos), scale(across, sin))
  return {
    position: scale(direction, radius + altitude),
    xAxis: add(scale(start, -sin), scale(across, cos)),
    yAxis: direction,
    kind,
    livery: hash(`sky:${i}:livery`) % LIVERIES,
  }
}
