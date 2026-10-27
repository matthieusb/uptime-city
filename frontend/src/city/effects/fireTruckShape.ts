// Pure logic of the fire trucks, independent of three.js. A building in rubble may call
// out trucks, up to three, one for each side of it. Each drives in along the wall after a delay,
// parks, hoses the fire with water until it is out, then drives on and away.
import { COLLAPSE_S, PRELUDE_S, RUBBLE_HEIGHT } from '../collapse'
import { floorBase, floorHeight, hash, seededRandom } from '../layout'
import { FADE, LANE, ROUNDABOUT } from '../traffic'
import type { Way } from '../world'

export const MAX_TRUCKS = 3
// Each truck that could go does so with this chance: a medium one.
const TRUCK_CHANCE = 0.5
// The alarm: seconds before a truck sets off, at least, and how much longer it can take.
const RESPONSE_MIN = 1.5
const RESPONSE_SPREAD = 3
// How far from its parking spot a truck comes from, in tiles, and how long it takes to drive in.
export const DRIVE_DISTANCE = 10
export const DRIVE_S = 4
// How far the middle of a parked truck is from the wall.
const WALL_GAP = 1.1
// The sides of the building that trucks park on, towards the camera first: their outward normal.
const SIDES: [number, number][] = [
  [0, 1],
  [1, 0],
  [0, -1],
]
// How high the water arcs over a straight line from the nozzle to its target, in tiles.
export const ARC = 1.2
// Seconds the ladder takes to go up to its floor, or to come down.
export const LADDER_S = 2.5
// Where the turntable of the ladder is on the truck, in its own frame (+X ahead, +Y up, +Z away
// from the building), and how far from the wall the tip of the ladder stops.
export const LADDER_PIVOT = { x: -0.35, y: 0.9, z: 0 }
const TIP_GAP = 0.6

// How fast a truck drives along a road, in tiles per second: faster than the cars.
export const TRUCK_SPEED = 4
// How far from its wall, at most, a building is from the road its trucks come by, and how far
// apart two parked trucks are.
const ROAD_REACH = 4
const TRUCK_SPACING = 2.6

export interface FireTruck {
  // How far along the road, in driving direction, from the middle of the building it parks.
  shift: number
  // How high on the wall the water is aimed.
  targetY: number
  // Seconds after the fire starts before the truck sets off.
  delay: number
  // Whether it hoses from the tip of a ladder (a floor on fire) or from its roof (rubble).
  ladder: boolean
}

// The trucks that a building calls out, one slot per side, null where none comes. Chance decides
// each, but the same fire in the same building always calls the same ones.
export function fireTrucks(
  id: string,
  burning: boolean[],
  collapsed: boolean,
): (FireTruck | null)[] {
  // A service on fire alone does not call them out: only a fallen building does.
  if (!collapsed) return Array.from({ length: MAX_TRUCKS }, () => null)
  const floors = burning.flatMap((on, i) => (on ? [i] : []))
  // A fallen building burns on its whole pile; floors on fire are spread among the trucks.
  const count = Math.min(floors.length, MAX_TRUCKS)
  const targets = collapsed
    ? Array.from({ length: MAX_TRUCKS }, () => RUBBLE_HEIGHT)
    : Array.from({ length: count }, (_, n) => {
        const floor = floors[Math.floor((n * floors.length) / count)]
        return floorBase(floor) + floorHeight(floor) / 2
      })
  const pattern = collapsed ? 'down' : burning.map(Number).join('')
  const fall = collapsed ? PRELUDE_S + COLLAPSE_S : 0
  const sent = Array.from({ length: MAX_TRUCKS }, (_, slot) => {
    const targetY = targets[slot]
    if (targetY === undefined) return null
    const random = seededRandom(hash(`truck:${id}:${pattern}:${slot}`))
    if (random() >= TRUCK_CHANCE) return null
    return {
      shift: 0,
      targetY,
      delay: fall + RESPONSE_MIN + random() * RESPONSE_SPREAD,
      ladder: !collapsed,
    }
  })
  // The first to come parks the furthest ahead, so that the next ones do not drive through it.
  const arrivals = sent
    .filter((truck) => truck !== null)
    .sort((a, b) => a.delay - b.delay)
  arrivals.forEach((truck, rank) => {
    truck.shift =
      (arrivals.length - 1 - rank - (arrivals.length - 1) / 2) * TRUCK_SPACING
  })
  return sent
}

export interface Parking {
  // The middle of the parked truck, relative to the middle of the building.
  x: number
  z: number
  // The outward normal of the wall it is by, and the direction it drives along it.
  nx: number
  nz: number
  dx: number
  dz: number
  // The rotation around Y that points +X along its direction.
  heading: number
}

// Where the truck of a side parks, by the wall of a building of the given width.
export function parking(side: number, width: number): Parking {
  const [nx, nz] = SIDES[side % SIDES.length]
  const [dx, dz] = [nz, -nx]
  const away = width / 2 + WALL_GAP
  return {
    x: nx * away,
    z: nz * away,
    nx,
    nz,
    dx,
    dz,
    heading: Math.atan2(-dz, dx),
  }
}

// Where a point of the truck, given in its own frame (+X ahead, +Y up), is relative to the middle
// of the building, once it has parked.
export function atTruck(
  parking: Parking,
  local: { x: number; y: number; z: number },
  offset = 0,
): { x: number; y: number; z: number } {
  return {
    x:
      parking.x +
      parking.dx * offset +
      local.x * parking.dx -
      local.z * parking.dz,
    y: local.y,
    z:
      parking.z +
      parking.dz * offset +
      local.x * parking.dz +
      local.z * parking.dx,
  }
}

// The road that the trucks of a building come by: they drive in the lane of the road on its side
// and park in it, abreast of the building.
export interface Approach {
  // The outward normal of the wall that faces the road.
  nx: number
  nz: number
  // How far the middle of the lane is from the middle of the building.
  away: number
  // How far the truck drives along the road from where the lane begins to the building, and from
  // the building to where the lane ends.
  before: number
  after: number
}

// The road a building at `center` stands by, if any: the closest road that runs along its side.
// The lane is the one that cars take on that side of the road, so the truck is facing the way they
// drive. It begins and ends at the ring of a roundabout or where the road stops.
export function approachOf(
  ways: readonly Way[],
  roundabouts: readonly { x: number; z: number }[],
  center: { x: number; z: number },
  width: number,
): Approach | null {
  let best: { way: Way; gap: number } | null = null
  for (const way of ways) {
    const across = way.vertical ? center.x : center.z
    const along = way.vertical ? center.z : center.x
    const gap = Math.abs(across - way.at)
    if (along < way.from || along > way.to) continue
    if (gap < width / 2 + LANE || gap > width / 2 + ROAD_REACH) continue
    if (!best || gap < best.gap) best = { way, gap }
  }
  if (!best) return null
  const { way, gap } = best
  const across = way.vertical ? center.x : center.z
  const along = way.vertical ? center.z : center.x
  // Towards the road, across it.
  const toward = across > way.at ? -1 : 1
  const [nx, nz] = way.vertical ? [toward, 0] : [0, toward]
  // The way the lane runs along the road: the one that keeps the road on the truck's left.
  const dir = way.vertical ? -nx : nz
  const centers = roundabouts
    .filter((r) => Math.abs((way.vertical ? r.x : r.z) - way.at) < 1e-6)
    .map((r) => (way.vertical ? r.z : r.x))
  const ring = (bound: number) =>
    centers.some((c) => Math.abs(c - bound) < 1e-6) ? ROUNDABOUT : 0
  const low = Math.max(way.from, ...centers.filter((c) => c <= along))
  const high = Math.min(way.to, ...centers.filter((c) => c >= along))
  const first = low + ring(low)
  const last = high - ring(high)
  return {
    nx,
    nz,
    away: gap - LANE,
    before: dir > 0 ? along - first : last - along,
    after: dir > 0 ? last - along : along - first,
  }
}

// Where the truck of an approach parks, `shift` further along the road than the building's middle.
export function roadParking(approach: Approach, shift: number): Parking {
  const { nx, nz, away } = approach
  const [dx, dz] = [nz, -nx]
  return {
    x: nx * away + dx * shift,
    z: nz * away + dz * shift,
    nx,
    nz,
    dx,
    dz,
    heading: Math.atan2(-dz, dx),
  }
}

export interface Truck {
  // -1 far before the spot, 0 parked, 1 far past it.
  s: number
  // Seconds spent waiting for the alarm, since the fire started.
  waited: number
  // How far up its ladder is, 0 down to 1 up to its floor.
  ladder: number
}

export const initialTruck = (): Truck => ({ s: -1, waited: 0, ladder: 0 })

// A truck sets off after `delay` seconds of fire, drives in, puts its ladder up if it has one, and
// stays until the fire is out. Then the ladder comes down and it drives on, away from where it
// came. One that is called again after it left starts over.
export function stepTruck(
  truck: Truck,
  active: boolean,
  dt: number,
  delay: number,
  hasLadder = false,
  // Seconds to drive in, and to drive on and away: longer on a long road.
  driveIn = DRIVE_S,
  driveOut = DRIVE_S,
): Truck {
  const stepIn = dt / driveIn
  const stepOut = dt / driveOut
  if (!active) {
    if (truck.s <= -1) return initialTruck()
    if (hasLadder && truck.ladder > 0) {
      return {
        ...truck,
        waited: 0,
        ladder: Math.max(0, truck.ladder - dt / LADDER_S),
      }
    }
    return {
      s: Math.min(1, truck.s + (truck.s < 0 ? stepIn : stepOut)),
      waited: 0,
      ladder: 0,
    }
  }
  if (truck.s >= 1) return initialTruck()
  if (truck.s > 0) return { ...truck, s: Math.max(0, truck.s - stepOut) }
  const waited = truck.waited + dt
  if (truck.s <= -1 && waited < delay) return { ...truck, waited }
  if (truck.s < 0) {
    return { s: Math.min(0, truck.s + stepIn), waited, ladder: 0 }
  }
  return {
    s: 0,
    waited,
    ladder: hasLadder ? Math.min(1, truck.ladder + dt / LADDER_S) : 1,
  }
}

// The ladder that reaches the middle of a floor at `targetY`, in the frame of the truck: its
// length, its tilt around X (0 is straight up, negative leans towards the building) and its tip.
export function ladderReach(targetY: number): {
  length: number
  tilt: number
  tip: { x: number; y: number; z: number }
} {
  const dy = targetY - LADDER_PIVOT.y
  const dz = -(WALL_GAP - TIP_GAP)
  return {
    length: Math.hypot(dy, dz),
    tilt: Math.atan2(dz, dy),
    tip: { x: LADDER_PIVOT.x, y: targetY, z: dz },
  }
}

// How far along the wall the truck is from its spot: it brakes as it comes in and picks up speed
// as it leaves.
export function truckOffset(
  s: number,
  legIn = DRIVE_DISTANCE,
  legOut = DRIVE_DISTANCE,
): number {
  return s < 0 ? -legIn * s * s : legOut * s * s
}

// How big the truck is: it grows out of nothing where its road begins and shrinks away where it
// ends, like the cars fade.
export function truckScale(s: number, legIn: number, legOut: number): number {
  if (s <= -1 || s >= 1) return 0
  const offset = truckOffset(s, legIn, legOut)
  const left = s < 0 ? legIn + offset : legOut - offset
  return Math.min(1, left / FADE)
}

// Whether the truck is on the map: out of sight while it waits and once it has left.
export const truckShown = (truck: Truck): boolean => truck.s > -1 && truck.s < 1

// Whether it is parked, hosing: it is called, has stopped and its ladder, if any, is up.
export const truckSprays = (truck: Truck, active: boolean): boolean =>
  active && truck.s === 0 && truck.ladder === 1

// A drop of water at fraction u of its flight from the nozzle to its target, in an arc.
export function waterPoint(
  from: { x: number; y: number; z: number },
  to: { x: number; y: number; z: number },
  u: number,
): { x: number; y: number; z: number } {
  return {
    x: from.x + (to.x - from.x) * u,
    y: from.y + (to.y - from.y) * u + 4 * u * (1 - u) * ARC,
    z: from.z + (to.z - from.z) * u,
  }
}
