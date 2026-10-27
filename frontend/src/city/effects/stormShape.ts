// The rain and the lightning of the clouds in cloudShape.ts, and how they
// move: pure functions, independent of three.js. The same drops and the same
// storm every time.
import type { Cloud } from './cloudShape'
import { hash, seededRandom } from '../layout'

// Where the rain lands, a little above the ground, in tiles.
export const GROUND = 0.3

// How many drops fall from a cloud of each kind.
const DROPS = { fair: 0, rain: 45, storm: 110 }

export interface Drop {
  // Under the cloud, relative to its middle, in tiles.
  x: number
  z: number
  // Tiles per second.
  speed: number
  // Where it is in its fall at time 0, between 0 and 1.
  phase: number
  length: number
}

// The drops under a cloud, spread over the underside of its lowest layer.
export function raindrops(cloud: Cloud): Drop[] {
  const count = DROPS[cloud.kind]
  if (count === 0) return []
  const random = seededRandom(hash(`rain:${cloud.lane}`))
  const base = cloud.blocks.filter((block) => block.y === 0)
  return Array.from({ length: count }, () => {
    const block = base[Math.floor(random() * base.length)]
    return {
      x: block.x + (random() - 0.5),
      z: block.z + (random() - 0.5),
      speed: 11 + random() * 5,
      phase: random(),
      length: 0.6 + random() * 0.6,
    }
  })
}

// How far rain falls from a cloud, whose underside floats at `height`.
export function fallOf(cloud: Cloud, height: number): number {
  return Math.max(1, height + cloud.y - GROUND)
}

// Where a drop is at time t, in seconds: `y` above the ground, between 0 and
// `fall`. It falls and, when it reaches the ground, starts again from the cloud.
export function dropPose(
  drop: Drop,
  t: number,
  fall: number,
): { x: number; y: number; z: number } {
  const u = ((((t * drop.speed) / fall + drop.phase) % 1) + 1) % 1
  return { x: drop.x, y: fall * (1 - u), z: drop.z }
}

// A storm strikes now and then, at its own pace.
function thunderClock(cloud: Cloud): { period: number; offset: number } {
  const random = seededRandom(hash(`thunder:${cloud.lane}`))
  const period = 6 + random() * 6
  return { period, offset: random() * period }
}

// 1 at the top of a pulse that starts at `start` and lasts `duration`, 0
// outside of it.
function pulse(x: number, start: number, duration: number): number {
  if (x < start || x > start + duration) return 0
  return 1 - Math.abs((2 * (x - start)) / duration - 1)
}

export interface Lightning {
  // How bright the flash is, between 0 and 1: 0 most of the time.
  flash: number
  // Which strike it is, counting up from the start.
  strike: number
}

// A strike flashes twice, quickly, the second time a little weaker.
export function lightning(cloud: Cloud, t: number): Lightning {
  if (cloud.kind !== 'storm') return { flash: 0, strike: 0 }
  const { period, offset } = thunderClock(cloud)
  const at = t + offset
  const strike = Math.floor(at / period)
  const local = at - strike * period
  const flash = Math.min(
    1,
    2 * (pulse(local, 0, 0.3) + 0.8 * pulse(local, 0.35, 0.3)),
  )
  return { flash, strike }
}

// How many straight pieces a bolt is made of.
export const BOLT_SEGMENTS = 8

// The bolt of a strike, from the underside of the cloud (y = 0) down to the
// ground (y = -fall), relative to the middle of the cloud: a zigzag, a
// different one for every strike.
export function boltPoints(
  cloud: Cloud,
  strike: number,
  fall: number,
): { x: number; y: number; z: number }[] {
  const random = seededRandom(hash(`bolt:${cloud.lane}:${strike}`))
  const reachX = Math.max(...cloud.blocks.map((block) => Math.abs(block.x)))
  const reachZ = Math.max(...cloud.blocks.map((block) => Math.abs(block.z)))
  let x = (random() - 0.5) * reachX
  let z = (random() - 0.5) * reachZ
  return Array.from({ length: BOLT_SEGMENTS + 1 }, (_, i) => {
    const point = {
      x,
      y: i === 0 ? 0 : -(fall * i) / BOLT_SEGMENTS,
      z,
    }
    x += (random() - 0.5) * 2
    z += (random() - 0.5) * 1.2
    return point
  })
}
