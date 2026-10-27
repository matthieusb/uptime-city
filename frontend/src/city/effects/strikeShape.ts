// The missile that nukes a neighbourhood and the smoke it leaves, as pure
// functions of time, independent of three.js. Times are in seconds from the
// moment the strike starts, unless said otherwise.
import { hash, seededRandom } from '../layout'

// The missile falls for this long, then explodes.
export const MISSILE_S = 3.2
// The mushroom takes this long to grow after the impact.
export const GROW_S = 5
// How long the smoke of the missile lasts.
export const TRAIL_LIFE = 4
// The white flash of the impact.
export const FLASH_S = 0.7
// The whole strike, from launch to the last wisp.
export const STRIKE_S = MISSILE_S + Math.max(GROW_S, TRAIL_LIFE) + 0.5

// Where the missile lands, and the height it is launched from, off the tile.
const END: Vec = [0, 0.6, 0]
const LAUNCH_HEIGHT = 5
// From the middle of the missile to the tail where the smoke comes out.
const TAIL = 2.4
// How far outside the map a missile is launched.
const MARGIN = 8

type Vec = [number, number, number]

// Where the missile is launched from, relative to the middle of the tile it
// hits, and how high it flies above the straight line at the top of its arc.
export interface Course {
  x: number
  z: number
  peak: number
}

// The sides it can come from, as unit vectors on the ground: the left of the
// screen (the default), then the right, the top and the bottom of it.
const SIDES: [number, number][] = [
  [-0.8, 0.6],
  [0.8, -0.6],
  [-Math.SQRT1_2, -Math.SQRT1_2],
  [Math.SQRT1_2, Math.SQRT1_2],
]
export const DEFAULT_COURSE: Course = { x: -16, z: 12, peak: 20 }

export interface MapBounds {
  halfWidth: number
  halfDepth: number
}

// A missile comes from the left of the screen, and from another side in one
// case out of three, the same for the same key. It is always launched from
// outside the map, never from a tile: `plate` is where the tile it hits
// stands on the map, which is centered on the origin.
export function courseFor(
  key: string,
  plate: { x: number; z: number },
  map: MapBounds,
): Course {
  const random = seededRandom(hash(key))
  const side =
    random() >= 1 / 3 ? 0 : 1 + Math.floor(random() * (SIDES.length - 1))
  const [dx, dz] = SIDES[side]
  // Walk from the tile along the side until the map is left.
  const exit = (from: number, step: number, half: number) =>
    step === 0
      ? Infinity
      : ((step > 0 ? 1 : -1) * (half + MARGIN) - from) / step
  const distance = Math.min(
    exit(plate.x, dx, map.halfWidth),
    exit(plate.z, dz, map.halfDepth),
  )
  return {
    x: dx * distance,
    z: dz * distance,
    peak: Math.max(20, distance / 3),
  }
}

export interface MissilePose {
  x: number
  y: number
  z: number
  // Unit vector, the way the nose points.
  dir: Vec
}

const clamp = (n: number) => Math.min(1, Math.max(0, n))

// Where the missile is at time t: it flies over the map at a steady pace along
// a parabola, rises to its top, then dives onto the tile, nose first.
export function missileAt(
  t: number,
  course: Course = DEFAULT_COURSE,
): MissilePose {
  const u = clamp(t / MISSILE_S)
  const rise = END[1] - LAUNCH_HEIGHT
  const velocity: Vec = [
    -course.x,
    rise + 4 * course.peak * (1 - 2 * u),
    -course.z,
  ]
  const speed = Math.hypot(...velocity)
  return {
    x: course.x * (1 - u),
    y: LAUNCH_HEIGHT + rise * u + 4 * course.peak * u * (1 - u),
    z: course.z * (1 - u),
    dir: [velocity[0] / speed, velocity[1] / speed, velocity[2] / speed],
  }
}

export interface MissileBox {
  x: number
  y: number
  z: number
  w: number
  h: number
  d: number
  color: string
}

// The missile is made of boxes like the rest of the town, nose down, around
// its middle. The tail is at +y.
export function missileBoxes(): MissileBox[] {
  const box = (
    y: number,
    w: number,
    h: number,
    color: string,
    x = 0,
    z = 0,
    d = w,
  ): MissileBox => ({ x, y, z, w, h, d, color })
  const NOSE = '#d62828'
  const HULL = '#d9dce1'
  const FIN = '#4a4f57'
  return [
    // The nose, stepping down to a point.
    box(-2.1, 0.3, 0.4, NOSE),
    box(-1.75, 0.6, 0.5, NOSE),
    box(-1.3, 0.9, 0.5, NOSE),
    // The body.
    box(-0.8, 1.1, 0.9, HULL),
    box(0, 1.1, 0.9, HULL),
    box(0.55, 1.12, 0.25, NOSE),
    box(1.1, 1.1, 0.9, HULL),
    // Four fins at the tail.
    box(1.5, 0.15, 0.9, FIN, 0.85, 0, 0.6),
    box(1.5, 0.15, 0.9, FIN, -0.85, 0, 0.6),
    box(1.5, 0.6, 0.9, FIN, 0, 0.85, 0.15),
    box(1.5, 0.6, 0.9, FIN, 0, -0.85, 0.15),
    // The engine.
    box(1.75, 0.6, 0.35, '#2b2e33'),
  ]
}

export interface TrailSeed {
  // When this puff leaves the engine.
  emit: number
  jx: number
  jy: number
  jz: number
  phase: number
  size: number
}

const EMISSIONS = 90
const PER_EMISSION = 2

export function trailSeeds(): TrailSeed[] {
  const random = seededRandom(hash('missile-trail'))
  const seeds: TrailSeed[] = []
  for (let i = 0; i < EMISSIONS; i++) {
    for (let j = 0; j < PER_EMISSION; j++) {
      seeds.push({
        emit: (i / EMISSIONS) * MISSILE_S,
        jx: (random() - 0.5) * 0.8,
        jy: (random() - 0.5) * 0.8,
        jz: (random() - 0.5) * 0.8,
        phase: random() * 2 * Math.PI,
        size: 0.8 + random() * 0.6,
      })
    }
  }
  return seeds
}

export interface TrailPuff {
  x: number
  y: number
  z: number
  radius: number
  // 1 at the engine, glowing, 0 once it has cooled to grey smoke.
  heat: number
}

// The puff of a seed at time t, or null before it is emitted and after it is
// gone. A puff swells like a billowing cloud, drifts up and downwind, swirls,
// and thins out. Many of them overlap and their translucency adds up to a
// volume of smoke.
export function trailPuff(
  seed: TrailSeed,
  t: number,
  course: Course = DEFAULT_COURSE,
): TrailPuff | null {
  const age = t - seed.emit
  if (age < 0 || age > TRAIL_LIFE) return null
  const life = age / TRAIL_LIFE
  const from = missileAt(seed.emit, course)
  const swirl = life * 1.1
  const envelope = Math.min(1, age / 0.12) * (life < 0.6 ? 1 : (1 - life) / 0.4)
  return {
    x:
      from.x -
      from.dir[0] * TAIL +
      seed.jx +
      0.9 * age +
      swirl * Math.sin(age * 1.3 + seed.phase),
    y:
      from.y -
      from.dir[1] * TAIL +
      seed.jy +
      0.5 * age +
      swirl * 0.5 * Math.sin(age * 0.9 + seed.phase * 2),
    z:
      from.z -
      from.dir[2] * TAIL +
      seed.jz +
      0.3 * age +
      swirl * Math.cos(age * 1.1 + seed.phase),
    radius: seed.size * (0.35 + 1.9 * Math.sqrt(life)) * envelope,
    heat: Math.max(0, 1 - age / 0.5),
  }
}

// The flash of the explosion, 1 at the impact and 0 after FLASH_S. `since` is
// the time since the impact.
export function flashLevel(since: number): number {
  if (since < 0) return 0
  return 1 - clamp(since / FLASH_S)
}

// How much of the mushroom has grown, 0 to 1, from the start of the strike
// and the time now, both in milliseconds. A cloud with no start is full
// grown.
export function growthAt(startedAt: number | null, now: number): number {
  if (startedAt === null) return 1
  const x = clamp(((now - startedAt) / 1000 - MISSILE_S) / GROW_S)
  return 1 - (1 - x) * (1 - x)
}

// Seconds since the impact, from the start of the strike and the time now, both in milliseconds:
// negative while the missile still flies, Infinity for a tile nuked from the start, where all has
// long burnt.
export function sinceImpact(startedAt: number | null, now: number): number {
  return startedAt === null ? Infinity : (now - startedAt) / 1000 - MISSILE_S
}

// The radius of the flash: it swells as its level falls from 1 to 0.
export const flashSize = (level: number): number => 2 + 14 * (1 - level)
