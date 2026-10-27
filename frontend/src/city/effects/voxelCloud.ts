// The mushroom cloud as cubes, as pure functions of its growth `g` and the time `t`, independent of
// three.js: each cube sits on the shape of the fireball, the cap or the stem (see `nukeShape.ts`)
// at a place drawn once for it, and the caller snaps it to a grid for the chunky look. A cube is
// written into `out`, so that nothing is allocated every frame. Its `heat` is its place on the
// ramp of colours, 0 white-hot to 1 charcoal smoke, and a `scale` of 0 is a cube that is not there.
import { hash, seededRandom } from '../layout'
import {
  CAP_HEAT_SPAN,
  capHeat,
  capLift,
  capMajor,
  capMinor,
  capMinorY,
  capRoll,
  capScale,
  fireballHeat,
  fireballRadius,
  fireballY,
  stemHeat,
  stemHeight,
  stemRadius,
  stemWidth,
} from './nukeShape'

// The side of a cube, and of the grid they are snapped to, for the smallest cloud.
export const VOXEL = 0.7

export const BALL_CUBES = 120
export const CAP_CUBES = 600
export const STEM_CUBES = 300
export const CLOUD_CUBES = BALL_CUBES + CAP_CUBES + STEM_CUBES

export interface Cube {
  x: number
  y: number
  z: number
  scale: number
  heat: number
}

export const newCube = (): Cube => ({ x: 0, y: 0, z: 0, scale: 0, heat: 0 })

// Four stable values in [0, 1) for each cube of a part of the cloud.
function seedsOf(count: number, salt: string): Float32Array {
  const random = seededRandom(hash(salt))
  return Float32Array.from({ length: 4 * count }, () => random())
}

const BALL = seedsOf(BALL_CUBES, 'voxel-cloud:ball')
const CAP = seedsOf(CAP_CUBES, 'voxel-cloud:cap')
const STEM = seedsOf(STEM_CUBES, 'voxel-cloud:stem')

// The four values of a cube, in a buffer reused by every call so that nothing is allocated.
const picked: [number, number, number, number] = [0, 0, 0, 0]
function seedsAt(seeds: Float32Array, k: number) {
  picked[0] = seeds[4 * k]
  picked[1] = seeds[4 * k + 1]
  picked[2] = seeds[4 * k + 2]
  picked[3] = seeds[4 * k + 3]
  return picked
}

const TAU = 2 * Math.PI
const clamp01 = (x: number) => Math.min(1, Math.max(0, x))

// The value on the grid of the given step that is nearest.
export const snap = (value: number, step: number): number =>
  Math.round(value / step) * step

// A cube of the fireball: inside a sphere that swells, rises and shrinks away with the growth.
export function ballCube(k: number, g: number, t: number, out: Cube): Cube {
  const [u, v, w, q] = seedsAt(BALL, k)
  const radius = fireballRadius(g)
  const around = TAU * u
  const up = 2 * v - 1
  const flat = Math.sqrt(1 - up * up)
  const reach =
    radius * (0.35 + 0.65 * Math.cbrt(w)) + 0.25 * Math.sin(2 * t + TAU * q)
  out.x = flat * Math.cos(around) * reach
  out.y = fireballY(g) + up * reach
  out.z = flat * Math.sin(around) * reach
  out.scale = radius > 0.02 ? VOXEL * (1 + 0.5 * q) : 0
  out.heat = clamp01(fireballHeat(g) + 0.25 * w)
  return out
}

// A cube of the cap: round the tube of the torus, which rolls with time, up at the middle and
// down at the rim.
export function capCube(k: number, g: number, t: number, out: Cube): Cube {
  const [u, v, w, q] = seedsAt(CAP, k)
  const around = TAU * u
  const roll = TAU * v + capRoll(t)
  const inside = 0.75 + 0.25 * w
  const boil = 0.3 * Math.sin(1.7 * t + TAU * q)
  const reach =
    capMajor(g) + capMinor(g) * inside * Math.cos(roll) + boil * capScale(g)
  out.x = reach * Math.cos(around)
  out.y = capLift(g) + capMinorY(g) * inside * Math.sin(roll)
  out.z = reach * Math.sin(around)
  out.scale = capScale(g) > 0.01 ? VOXEL * (0.9 + 0.6 * q) : 0
  out.heat = clamp01(
    capHeat(g) +
      CAP_HEAT_SPAN * (0.5 + 0.5 * Math.sin(roll)) +
      0.12 * (w - 0.5),
  )
  return out
}

// A cube of the stem: round its lathe, which turns slowly, more at the foot than at the top.
export function stemCube(k: number, g: number, t: number, out: Cube): Cube {
  const [u, v, w, q] = seedsAt(STEM, k)
  const around = TAU * v + 0.3 * t * (1 - u)
  const reach = stemRadius(u) * stemWidth(g) * (0.55 + 0.45 * w)
  out.x = reach * Math.cos(around)
  out.y = u * stemHeight(g) + 0.2 * Math.sin(1.9 * t + TAU * q)
  out.z = reach * Math.sin(around)
  out.scale = g > 0.005 ? VOXEL * (0.9 + 0.5 * q) : 0
  out.heat = clamp01(stemHeat(u, g) + 0.12 * (w - 0.5))
  return out
}
