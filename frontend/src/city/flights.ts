// Pure logic of the flights of the airport, independent of three.js. One runway, and a schedule of
// slots in which it is used by one plane at a time. Plane `i` of a cycle lands in an even slot,
// parks at a stand, taxis to the runway and takes off in an odd slot some slots later, then is gone
// until its next cycle. An arrival appears outside an edge of the map and descends onto the
// runway, rolls out, and taxis to its stand; a departure takes off, climbs, and disappears beyond
// an edge of the map. Everything is in the frame of the airport (see airport.ts), turned and
// moved onto the plate by `planeState`.
import { hash } from './layout'
import {
  RUNWAY_Z,
  STAND_Z,
  TAXI_Z,
  turned,
  type AirportLayout,
} from './airport'

// How far above the tallest building the planes cruise: just over the top of the clouds, which float
// 2 tiles above it and rise 4.5 tiles at most, so that the planes show against them.
export const CRUISE_ABOVE = 9
export const cruiseHeight = (top: number) => top + CRUISE_ABOVE

// The planes of a cycle at the normal density, and at the most.
export const BASE_PLANES = 3
export const MAX_PLANES = 2 * BASE_PLANES
// Slots in a cycle: each plane of the cycle uses two (it lands in an even one, takes off in an odd one).
export const CYCLE_SLOTS = 2 * MAX_PLANES
// The shortest a slot is, in seconds.
const MIN_SLOT = 16
export const LIVERIES = 6

// How far outside the edge of the map a plane appears and disappears.
export const OUT = 6
// When, in its slot, a landing plane touches down and a departing one begins its take-off roll.
const TOUCHDOWN = 1.5
const LINE_UP = 1
// Turning round on its stand before it leaves.
const TURN_TIME = 3
// How wide the turns of a plane on the ground are.
const TURN_RADIUS = 1.5
// How far to the side of the runway line the planes in the air keep, far from the runway.
const LATERAL = 9

// The kinds of plane: a light tourism plane, an Airbus Beluga-like cargo plane and a 747-like jumbo
// jet. Sizes (tiles, nose to tail and wing tip to wing tip; the models in Planes.tsx follow them)
// fit the stands (5 apart), the taxiway (a lane 1 tile wide, 4.3 from the stands' noses) and the
// runway; speeds are in tiles per second: the bigger, the faster in the air and on the ground, the
// longer its take-off roll (`rollShare` of the runway after the line-up), the gentler its climb and
// descent (slopes, up to the cruise height of the sky plus `cap`), and the longer the runway it
// needs.
export type PlaneKind = 'tourism' | 'cargo' | 'jumbo'
export interface Craft {
  length: number
  span: number
  vTaxi: number
  vFly: number
  rollShare: number
  climb: { cap: number; slope: number }
  descent: { cap: number; slope: number }
  // The shortest runway of an airport that has this kind, and how often it comes up (relative).
  minRunway: number
  weight: number
}
export const CRAFT: Record<PlaneKind, Craft> = {
  tourism: {
    length: 1.7,
    span: 2.2,
    vTaxi: 2,
    vFly: 5,
    rollShare: 0.45,
    climb: { cap: 0, slope: 0.6 },
    descent: { cap: 0, slope: 0.3 },
    minRunway: 0,
    weight: 3,
  },
  cargo: {
    length: 3.5,
    span: 3,
    vTaxi: 2.6,
    vFly: 8,
    rollShare: 0.8,
    climb: { cap: 1, slope: 0.5 },
    descent: { cap: 1, slope: 0.25 },
    minRunway: 4,
    weight: 2,
  },
  jumbo: {
    length: 4,
    span: 3.4,
    vTaxi: 3.2,
    vFly: 10,
    rollShare: 1,
    climb: { cap: 2, slope: 0.4 },
    descent: { cap: 2, slope: 0.2 },
    minRunway: 6,
    weight: 1,
  },
}
export const PLANE_KINDS: PlaneKind[] = ['tourism', 'cargo', 'jumbo']

// The kinds of plane an airport has: the light plane always, the others from a long enough runway.
export function kindsOf(layout: AirportLayout): PlaneKind[] {
  return PLANE_KINDS.filter((k) => layout.length >= CRAFT[k].minRunway)
}

// The kind of plane `i` in cycle `c`, by hash, among those the airport has: about half tourism, a
// third cargo and a sixth jumbo when it has all three.
export function flightKind(
  layout: AirportLayout,
  i: number,
  c: number,
): PlaneKind {
  const kinds = kindsOf(layout)
  const total = kinds.reduce((sum, k) => sum + CRAFT[k].weight, 0)
  let roll = hash(`flight:${i}:${c}:kind`) % total
  for (const k of kinds) {
    roll -= CRAFT[k].weight
    if (roll < 0) return k
  }
  return kinds[0]
}

// How many planes there are at a density: none at 0, at least one otherwise.
export function planeCount(density: number): number {
  return density > 0
    ? Math.min(MAX_PLANES, Math.max(1, Math.round(BASE_PLANES * density)))
    : 0
}

// The frame of the plane: x along, z across, y up; heading is the rotation around Y that points
// the nose (+X) along the way, pitch the nose up.
export interface PlaneState {
  active: boolean
  x: number
  y: number
  z: number
  heading: number
  pitch: number
  // 0 to LIVERIES - 1.
  livery: number
  kind: PlaneKind
}

const INACTIVE: PlaneState = {
  active: false,
  x: 0,
  y: 0,
  z: 0,
  heading: 0,
  pitch: 0,
  livery: 0,
  kind: 'tourism',
}

const smooth = (u: number) => {
  const c = Math.min(1, Math.max(0, u))
  return c * c * (3 - 2 * c)
}

// A path on the ground, with its corners rounded, followed by distance.
interface Path {
  length: number
  at: (s: number) => { x: number; z: number; heading: number }
}

type P = [number, number]

function makePath(points: P[]): Path {
  // Drop repeated points.
  const pts = points.filter(
    (p, i) =>
      i === 0 ||
      Math.hypot(p[0] - points[i - 1][0], p[1] - points[i - 1][1]) > 1e-6,
  )
  const dense: { x: number; z: number; h: number }[] = []
  const angle = (a: P, b: P) => Math.atan2(-(b[1] - a[1]), b[0] - a[0])
  const dist = (a: P, b: P) => Math.hypot(b[0] - a[0], b[1] - a[1])
  dense.push({ x: pts[0][0], z: pts[0][1], h: angle(pts[0], pts[1]) })
  for (let k = 1; k < pts.length - 1; k++) {
    const [a, c, b] = [pts[k - 1], pts[k], pts[k + 1]]
    const cut = Math.min(TURN_RADIUS, dist(a, c) / 2, dist(c, b) / 2)
    const toward = (to: P): P => {
      const d = dist(c, to)
      return [
        c[0] + ((to[0] - c[0]) / d) * cut,
        c[1] + ((to[1] - c[1]) / d) * cut,
      ]
    }
    const [s, e] = [toward(a), toward(b)]
    const STEPS = 10
    for (let n = 0; n <= STEPS; n++) {
      const u = n / STEPS
      // A quadratic curve from s to e, bent around the corner c.
      const x = (1 - u) ** 2 * s[0] + 2 * u * (1 - u) * c[0] + u * u * e[0]
      const z = (1 - u) ** 2 * s[1] + 2 * u * (1 - u) * c[1] + u * u * e[1]
      const dx = 2 * (1 - u) * (c[0] - s[0]) + 2 * u * (e[0] - c[0])
      const dz = 2 * (1 - u) * (c[1] - s[1]) + 2 * u * (e[1] - c[1])
      dense.push({ x, z, h: Math.atan2(-dz, dx) })
    }
  }
  const last = pts[pts.length - 1]
  dense.push({
    x: last[0],
    z: last[1],
    h: angle(pts[pts.length - 2], last),
  })
  const cum = [0]
  for (let k = 1; k < dense.length; k++) {
    cum.push(
      cum[k - 1] +
        Math.hypot(dense[k].x - dense[k - 1].x, dense[k].z - dense[k - 1].z),
    )
  }
  const length = cum[cum.length - 1]
  return {
    length,
    at(s) {
      const d = Math.min(length, Math.max(0, s))
      let k = 1
      while (k < cum.length - 1 && cum[k] < d) k++
      const [p, q] = [dense[k - 1], dense[k]]
      const span = cum[k] - cum[k - 1]
      const u = span > 0 ? (d - cum[k - 1]) / span : 0
      // The shortest way round between the two headings.
      let dh = q.h - p.h
      dh -= 2 * Math.PI * Math.round(dh / (2 * Math.PI))
      return {
        x: p.x + (q.x - p.x) * u,
        z: p.z + (q.z - p.z) * u,
        heading: p.h + dh * u,
      }
    },
  }
}

// How far along a leg of `len` tiles a plane is after `t` seconds, cruising at `v`, starting from
// rest or ending at rest (over a short ramp) or not.
const RAMP = 1.5
function legDistance(
  t: number,
  len: number,
  v: number,
  fromRest: boolean,
  toRest: boolean,
): number {
  const da = fromRest ? Math.min(RAMP, len / 3) : 0
  const db = toRest ? Math.min(RAMP, len / 3) : 0
  const ta = da ? (2 * da) / v : 0
  const tb = db ? (2 * db) / v : 0
  const cruise = len - da - db
  const tc = cruise / v
  if (t <= 0) return 0
  if (t <= ta) return ((v / ta) * t * t) / 2
  if (t <= ta + tc) return da + v * (t - ta)
  if (tb === 0) return len
  const tau = Math.min(t - ta - tc, tb)
  return da + cruise + v * tau - ((v / tb) * tau * tau) / 2
}
function legTime(len: number, v: number, fromRest: boolean, toRest: boolean) {
  const da = fromRest ? Math.min(RAMP, len / 3) : 0
  const db = toRest ? Math.min(RAMP, len / 3) : 0
  return (len + da + db) / v
}

// The airport as the flights need it.
export interface AirportSpec {
  layout: AirportLayout
  // Where the middle of the airport is on its plate, and the height of its ground.
  x: number
  z: number
  y: number
  turn: number
  // How high the planes cruise above the ground of the airport (see `cruiseHeight`).
  cruise: number
  // How far the edges of the map are from the middle, along the +X and the -X of the runway.
  reach: { pos: number; neg: number }
}

// What is fixed about the flight of plane `i` in cycle `c`.
interface Flight {
  livery: number
  kind: PlaneKind
  craft: Craft
  // Where it lifts off, along the runway.
  liftX: number
  // Seconds, in the time of the schedule.
  start: number
  touchdown: number
  rolloutEnd: number
  arrivedAt: number
  turnStart: number
  taxiStart: number
  rollStart: number
  liftOff: number
  end: number
  // The runway directions (+1 along +X) of the landing and of the take-off.
  landing: 1 | -1
  takeoff: 1 | -1
  stand: number
  approach: number
  rollout: number
  rolloutLength: number
  taxiIn: Path
  taxiOut: Path
  rollLength: number
  climbLength: number
}

// The paths on the ground of a plane that lands in the direction `landing` and takes off in the
// direction `takeoff`, and parks at stand number `stand`.
function taxiPaths(
  layout: AirportLayout,
  landing: 1 | -1,
  takeoff: 1 | -1,
  stand: number,
): { taxiIn: Path; taxiOut: Path } {
  const half = layout.length / 2
  const xs = layout.standX[stand]
  const lineUp = -takeoff * layout.link
  return {
    taxiIn: makePath([
      [landing * (half - 4), RUNWAY_Z],
      [landing * layout.link, RUNWAY_Z],
      [landing * layout.link, TAXI_Z],
      [xs, TAXI_Z],
      [xs, STAND_Z],
    ]),
    taxiOut: makePath([
      [xs, STAND_Z],
      [xs, TAXI_Z],
      [lineUp, TAXI_Z],
      [lineUp, RUNWAY_Z],
      [lineUp + takeoff * 3, RUNWAY_Z],
    ]),
  }
}

const slots = new WeakMap<AirportLayout, number>()

// Seconds of a slot, one use of the runway: long enough for the plane that lands in one slot to
// be on its stand before the plane that takes off in the next one leaves for the runway, even
// with the longest taxi of each, so that they never meet on the taxiway.
export function slotOf(spec: AirportSpec): number {
  const known = slots.get(spec.layout)
  if (known !== undefined) return known
  const { layout } = spec
  let slowestIn = 0
  let slowestOut = 0
  // The worst case over every kind of plane the airport has.
  for (const kind of kindsOf(layout)) {
    const { vFly, vTaxi } = CRAFT[kind]
    for (const dir of [1, -1] as const) {
      for (let stand = 0; stand < layout.standX.length; stand++) {
        const { taxiIn, taxiOut } = taxiPaths(layout, dir, dir, stand)
        const rollout = (2 * (layout.length - 6)) / (vFly + vTaxi)
        slowestIn = Math.max(
          slowestIn,
          TOUCHDOWN + rollout + legTime(taxiIn.length, vTaxi, false, true),
        )
        slowestOut = Math.max(
          slowestOut,
          legTime(taxiOut.length, vTaxi, true, false),
        )
      }
    }
  }
  const slot = Math.max(
    MIN_SLOT,
    Math.ceil(slowestIn + slowestOut + 2 - LINE_UP),
  )
  slots.set(layout, slot)
  return slot
}

export const cycleOf = (spec: AirportSpec) => CYCLE_SLOTS * slotOf(spec)

const cache = new WeakMap<AirportSpec, Map<string, Flight>>()

export function standsOf(spec: AirportSpec) {
  return spec.layout.standX.length
}

function flightOf(spec: AirportSpec, i: number, c: number): Flight {
  let flights = cache.get(spec)
  if (!flights) cache.set(spec, (flights = new Map()))
  const key = `${i}:${c}`
  const known = flights.get(key)
  if (known) return known
  if (flights.size > 200) flights.clear()

  const { layout } = spec
  const half = layout.length / 2
  const link = layout.link
  const pick = (what: string): 1 | -1 =>
    hash(`flight:${i}:${c}:${what}`) % 2 ? 1 : -1
  const landing = pick('landing')
  const takeoff = pick('takeoff')
  const stands = standsOf(spec)
  const stand = (((c * MAX_PLANES + i) % stands) + stands) % stands
  const reach = (side: number) => (side > 0 ? spec.reach.pos : spec.reach.neg)

  const kind = flightKind(layout, i, c)
  const craft = CRAFT[kind]
  const { vFly, vTaxi } = craft

  // Landing: from outside the edge on the side opposite to the way it heads, to the touchdown.
  const approach = reach(-landing) + OUT - (half - 2)
  const rolloutLength = layout.length - 6
  const rollout = (2 * rolloutLength) / (vFly + vTaxi)
  const { taxiIn, taxiOut } = taxiPaths(layout, landing, takeoff, stand)
  const taxiInTime = legTime(taxiIn.length, vTaxi, false, true)
  const lineUp = -takeoff * link
  const taxiOutTime = legTime(taxiOut.length, vTaxi, true, false)
  // The roll goes from the line-up to where it lifts off: the bigger, the further down the runway.
  const rollStartX = lineUp + takeoff * 3
  const rollLength = (takeoff * (half - 2) - rollStartX) * craft.rollShare
  const liftX = rollStartX + rollLength
  const roll = (2 * Math.abs(rollLength)) / (vFly + vTaxi)
  const climbLength = reach(takeoff) + OUT - takeoff * liftX

  const slot = slotOf(spec)
  const arrivalSlot = (c * CYCLE_SLOTS + 2 * i) * slot
  const departureSlot =
    (c * CYCLE_SLOTS + 2 * (i + (standsOf(spec) - 1)) + 1) * slot
  const touchdown = arrivalSlot + TOUCHDOWN
  const rolloutEnd = touchdown + rollout
  const arrivedAt = rolloutEnd + taxiInTime
  const rollStart = departureSlot + LINE_UP
  const taxiStart = rollStart - taxiOutTime
  const turnStart = taxiStart - TURN_TIME
  const liftOff = rollStart + roll
  const flight: Flight = {
    livery: hash(`flight:${i}:${c}:livery`) % LIVERIES,
    kind,
    craft,
    liftX,
    start: touchdown - approach / vFly,
    touchdown,
    rolloutEnd,
    arrivedAt,
    turnStart,
    taxiStart,
    rollStart,
    liftOff,
    end: liftOff + climbLength / vFly,
    landing,
    takeoff,
    stand,
    approach,
    rollout,
    rolloutLength,
    taxiIn,
    taxiOut,
    rollLength,
    climbLength,
  }
  flights.set(key, flight)
  return flight
}

// The schedule: when the flight of plane `i` begins and ends in cycle `c`, and whether the plane
// is parked for long enough (always, by construction).
export function flightTimes(spec: AirportSpec, i: number, c: number) {
  const f = flightOf(spec, i, c)
  return {
    start: f.start,
    touchdown: f.touchdown,
    arrivedAt: f.arrivedAt,
    turnStart: f.turnStart,
    rollStart: f.rollStart,
    liftOff: f.liftOff,
    end: f.end,
    landing: f.landing,
    takeoff: f.takeoff,
    kind: f.kind,
  }
}

// A height that rises (or falls, away from the touchdown) towards `top`, smoothly: at `slope` tiles
// per tile first, then more and more level.
const altitude = (d: number, top: number, slope: number) =>
  top * Math.tanh((slope * Math.max(0, d)) / top)

interface Local {
  x: number
  y: number
  z: number
  heading: number
  pitch: number
}

// In the air, `d` tiles from the touchdown or from the lift-off.
function airborne(
  f: Flight,
  d: number,
  arriving: boolean,
  spec: AirportSpec,
): Local {
  const half = spec.layout.length / 2
  const dir = arriving ? f.landing : f.takeoff
  const profile = arriving ? f.craft.descent : f.craft.climb
  const side = arriving ? 1 : -1
  const point = (e: number) => {
    // Arrivals come from further out than they fly in: the lateral offset closes up to 0.
    const lateral = arriving
      ? LATERAL * smooth((e - 20) / 40)
      : LATERAL * smooth(e / 40)
    // `dir` is where it heads; `e` is measured from the touchdown or the lift-off.
    const along = arriving ? -dir * (half - 2) - dir * e : f.liftX + dir * e
    return {
      x: along,
      z: RUNWAY_Z + side * lateral,
      y: altitude(e, spec.cruise + profile.cap, profile.slope),
    }
  }
  const [a, b] = [point(Math.max(0, d - 0.05)), point(d + 0.05)]
  // The plane moves from a to b when it departs, from b to a when it arrives.
  const [from, to] = arriving ? [b, a] : [a, b]
  const here = point(d)
  const ground = Math.hypot(to.x - from.x, to.z - from.z)
  const rise = arriving ? from.y - to.y : to.y - from.y
  const slope = Math.atan2(rise, ground)
  return {
    x: here.x,
    y: here.y,
    z: here.z,
    heading: Math.atan2(-(to.z - from.z), to.x - from.x),
    // Easing in, from level on the ground, over the first 8 tiles.
    pitch: (arriving ? -slope : slope) * smooth(d / 8),
  }
}

function localState(spec: AirportSpec, f: Flight, t: number): Local | null {
  const half = spec.layout.length / 2
  if (t < f.start || t > f.end) return null
  const ground = (p: { x: number; z: number; heading: number }): Local => ({
    x: p.x,
    y: 0,
    z: p.z,
    heading: p.heading,
    pitch: 0,
  })
  if (t < f.touchdown) {
    const d = f.approach - f.craft.vFly * (t - f.start)
    return airborne(f, d, true, spec)
  }
  if (t < f.rolloutEnd) {
    const e = t - f.touchdown
    const { vFly, vTaxi } = f.craft
    const a = (vFly - vTaxi) / f.rollout
    const s = vFly * e - (a * e * e) / 2
    return ground({
      x: -f.landing * (half - 2) + f.landing * s,
      z: RUNWAY_Z,
      heading: f.landing > 0 ? 0 : Math.PI,
    })
  }
  if (t < f.arrivedAt) {
    const s = legDistance(
      t - f.rolloutEnd,
      f.taxiIn.length,
      f.craft.vTaxi,
      false,
      true,
    )
    return ground(f.taxiIn.at(s))
  }
  const [parkedX, parkedZ] = [spec.layout.standX[f.stand], STAND_Z]
  if (t < f.turnStart) {
    return ground({ x: parkedX, z: parkedZ, heading: Math.PI / 2 })
  }
  if (t < f.taxiStart) {
    // It turns round on the spot, nose to the taxiway.
    const u = (t - f.turnStart) / (f.taxiStart - f.turnStart)
    return ground({
      x: parkedX,
      z: parkedZ,
      heading: Math.PI / 2 - Math.PI * smooth(u),
    })
  }
  if (t < f.rollStart) {
    const s = legDistance(
      t - f.taxiStart,
      f.taxiOut.length,
      f.craft.vTaxi,
      true,
      false,
    )
    return ground(f.taxiOut.at(s))
  }
  const roll = f.liftOff - f.rollStart
  if (t < f.liftOff) {
    const e = t - f.rollStart
    const { vFly, vTaxi } = f.craft
    const a = (vFly - vTaxi) / roll
    const s = vTaxi * e + (a * e * e) / 2
    return ground({
      x: -f.takeoff * (half - 5.5) + f.takeoff * s,
      z: RUNWAY_Z,
      heading: f.takeoff > 0 ? 0 : Math.PI,
    })
  }
  return airborne(f, f.craft.vFly * (t - f.liftOff), false, spec)
}

// Plane `i` in the airport frame at time `t` (seconds), or inactive.
export function planeLocal(
  spec: AirportSpec,
  i: number,
  t: number,
): (Local & { livery: number; kind: PlaneKind }) | null {
  const c0 = Math.floor(t / cycleOf(spec))
  for (const c of [c0 + 1, c0, c0 - 1]) {
    const f = flightOf(spec, i, c)
    const local = localState(spec, f, t)
    if (local) return { ...local, livery: f.livery, kind: f.kind }
  }
  return null
}

// Plane `i` on its plate at time `t`.
export function planeState(
  spec: AirportSpec,
  i: number,
  t: number,
): PlaneState {
  const local = planeLocal(spec, i, t)
  if (!local) return INACTIVE
  const [dx, dz] = turned(spec.turn, local.x, local.z)
  return {
    active: true,
    x: spec.x + dx,
    y: spec.y + local.y,
    z: spec.z + dz,
    heading: local.heading - (spec.turn * Math.PI) / 2,
    pitch: local.pitch,
    livery: local.livery,
    kind: local.kind,
  }
}
