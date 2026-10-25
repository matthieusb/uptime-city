// The crane and the scaffolding that rebuild a building once its host is back
// up: pure functions, independent of three.js.
import { floorBase, floorHeight, hash, seededRandom } from '../layout'

// How much of a floor is built, from 0 to 1, when the rebuild is at
// `progress` (0 to 1). The floors go up one after the other from the ground.
export function floorBuilt(
  progress: number,
  floor: number,
  floors: number,
): number {
  return Math.min(1, Math.max(0, progress * floors - floor))
}

// Height of the top of what is built so far.
export function builtHeight(progress: number, floors: number): number {
  let height = 0
  for (let i = 0; i < floors; i++) {
    const built = floorBuilt(progress, i, floors)
    if (built > 0) height = floorBase(i) + floorHeight(i) * built
  }
  return height
}

// The crane stays this long after the building is repaired, 2 to 4 seconds
// for each building.
const MIN_LINGER_S = 2
const MAX_LINGER_S = 4

export function craneLinger(id: string): number {
  const random = seededRandom(hash(`linger:${id}`))
  return MIN_LINGER_S + random() * (MAX_LINGER_S - MIN_LINGER_S)
}

// Once the building is done, the scaffolding comes down level by level from
// the top, over this long: less than the crane's stay.
export const DISMANTLE_S = 1.6

// The scaffolding is an open frame, see-through, which goes up level by level
// with the building, then comes down from the top once it is done. `progress`
// is the rebuild's, in units of its duration: it goes past 1 once done.
export function scaffoldShown(
  progress: number,
  floor: number,
  floors: number,
  rebuildSeconds: number,
): boolean {
  if (progress < 1)
    return floor === 0 || floorBuilt(progress, floor - 1, floors) > 0
  const after = (progress - 1) * rebuildSeconds
  return after < ((floors - floor) * DISMANTLE_S) / floors
}

// Where the crane stands, beside a building of this width, at a random
// corner per building.
export function craneSpot(id: string, width: number): { x: number; z: number } {
  const random = seededRandom(hash(`crane:${id}`))
  const gap = width / 2 + 1.1
  return { x: random() < 0.5 ? gap : -gap, z: random() < 0.5 ? gap : -gap }
}

// Swing of the crane's jib, in radians, wandering at random yet smoothly:
// a few sines with phases of their own.
export function jibAngle(id: string, t: number): number {
  const random = seededRandom(hash(`jib:${id}`))
  let angle = random() * Math.PI * 2
  for (const speed of [0.35, 0.8, 1.7]) {
    angle +=
      Math.sin(t * speed * (0.7 + random() * 0.6) + random() * 6.28) * 0.9
  }
  return angle
}

// How far the trolley runs along the jib, from 0 (the mast) to 1 (the tip),
// and how high the hook hangs, from 0 (at the jib) to 1 (low).
export function trolley(id: string, t: number): { run: number; drop: number } {
  const random = seededRandom(hash(`trolley:${id}`))
  const a = random() * 6.28
  const b = random() * 6.28
  return {
    run: 0.55 + 0.35 * Math.sin(t * 0.6 + a),
    drop: 0.5 + 0.4 * Math.sin(t * 0.9 + b),
  }
}
