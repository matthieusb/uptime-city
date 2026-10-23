// The shape of a mushroom cloud, as puffs of smoke, and how they move: pure
// functions, independent of three.js. The same puffs every time.
import { hash, seededRandom } from '../layout'

// How high the cloud rises above the ground.
export const NUKE_HEIGHT = 17

export interface Puff {
  x: number
  y: number
  z: number
  radius: number
  // A glowing puff lights itself, an ash puff is lit by the sun.
  glow: boolean
  color: string
  // Each puff billows at its own pace.
  phase: number
  speed: number
}

const GLOWS = ['#ff6a1a', '#ff8c42', '#d6451f', '#ffb703']
const DARK_ASH = ['#4a3f38', '#5a4d44', '#665a50']
const LIGHT_ASH = ['#8b8379', '#a39b90', '#c9c2b6']

export function mushroomPuffs(): Puff[] {
  const random = seededRandom(hash('mushroom'))
  const pick = (colors: string[]) =>
    colors[Math.floor(random() * colors.length)]
  const jitter = (spread: number) => (random() - 0.5) * spread
  const puffs: Puff[] = []
  const add = (
    x: number,
    y: number,
    z: number,
    radius: number,
    glow: boolean,
    colors: string[],
  ) =>
    // No puff sinks into the ground or rises above the cloud.
    puffs.push({
      x,
      y: Math.min(NUKE_HEIGHT - radius, Math.max(radius, y)),
      z,
      radius,
      glow,
      color: pick(colors),
      phase: random() * 2 * Math.PI,
      speed: 0.6 + random() * 0.8,
    })
  // Puffs set in a ring around the vertical axis.
  const ring = (
    count: number,
    ringRadius: number,
    y: number,
    radius: number,
    spread: number,
    glow: (y: number) => boolean,
    colors: (y: number) => string[],
  ) => {
    for (let i = 0; i < count; i++) {
      const angle = ((i + random() * 0.5) / count) * 2 * Math.PI
      const py = y + jitter(spread)
      add(
        Math.cos(angle) * ringRadius + jitter(0.4),
        py,
        Math.sin(angle) * ringRadius + jitter(0.4),
        radius * (0.8 + random() * 0.4),
        glow(py),
        colors(py),
      )
    }
  }
  const never = () => false

  // The fireball and the dust it throws up at the foot.
  for (let i = 0; i < 6; i++) {
    add(jitter(2.4), 2 + jitter(0.4), jitter(2.4), 2, true, GLOWS)
  }
  ring(16, 4.2, 1.4, 1.4, 0.3, never, () => DARK_ASH)

  // The stem, a little wider at the foot, and hot at the bottom.
  for (let level = 0; level < 12; level++) {
    const t = level / 11
    const y = 2.5 + t * 8.2
    const hot = t < 0.45
    ring(
      4,
      1.6 - 0.7 * t,
      y,
      1,
      0.3,
      () => hot,
      () => (hot ? GLOWS : DARK_ASH),
    )
    add(jitter(0.4), y, jitter(0.4), 0.9, hot, hot ? GLOWS : DARK_ASH)
  }

  // The cap: a thick ring of billows, glowing underneath, and a dome on top.
  ring(
    34,
    4.4,
    11.5,
    1.8,
    1.6,
    (y) => y < 11.6,
    (y) => (y < 11.6 ? GLOWS : DARK_ASH),
  )
  ring(14, 2.8, 12.9, 1.6, 0.8, never, () => DARK_ASH)
  ring(8, 3.2, 13.6, 1.5, 0.6, never, () => LIGHT_ASH)
  ring(6, 1.6, 14.6, 1.3, 0.4, never, () => LIGHT_ASH)
  add(0, 15.3, 0, 1.6, false, LIGHT_ASH)
  return puffs
}

export interface Pose {
  x: number
  y: number
  z: number
  scale: number
}

// Where a puff is at time t, in seconds: the cloud turns slowly, faster at
// the cap than in the stem, and each puff bobs and breathes.
export function puffPose(puff: Puff, t: number): Pose {
  const cap = Math.min(1, Math.max(0, (puff.y - 8) / 6))
  const turn = (0.04 + 0.12 * cap) * t
  const angle = Math.atan2(puff.z, puff.x) + turn
  const distance = Math.hypot(puff.x, puff.z)
  return {
    x: Math.cos(angle) * distance,
    y: puff.y + 0.4 * Math.sin(t * puff.speed * 0.6 + puff.phase),
    z: Math.sin(angle) * distance,
    scale: 1 + 0.1 * Math.sin(t * puff.speed * 0.9 + puff.phase),
  }
}

export interface Wisp {
  // When it starts rising, up to a whole number of its periods.
  start: number
  pose: (t: number) => Pose
}

// Thin smoke rising from the cap and thinning out, again and again.
export function wisps(): Wisp[] {
  const random = seededRandom(hash('wisps'))
  return Array.from({ length: 36 }, () => {
    const period = 14 + random() * 10
    const offset = random() * period
    const angle = random() * 2 * Math.PI
    const size = 0.9 + random() * 0.8
    return {
      start: -offset,
      pose: (t: number) => {
        const u = ((((t + offset) / period) % 1) + 1) % 1
        const a = angle + u * 0.8
        const radius = 3 + 4 * u
        return {
          x: Math.cos(a) * radius,
          y: 10.5 + 11 * u,
          z: Math.sin(a) * radius,
          // Grows, then fades out: nothing at either end of its life.
          scale: size * Math.sin(Math.PI * u),
        }
      },
    }
  })
}
