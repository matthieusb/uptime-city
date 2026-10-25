// Pure logic of the intro, independent of three.js: once the city is built, its tiles pop up one
// by one.
import type { Neighbourhood } from './world'

// How long a tile takes to pop, in seconds.
export const POP_DURATION = 0.5
// The pause between two tiles, and the longest the whole intro may take to start the last one.
const STAGGER = 0.12
// The view fades in first (see `.city` in `index.css`): the first tile pops once it is under way.
export const FADE_IN = 0.4
const MAX_SPREAD = 2.5
// How far past its size a tile swells before it settles.
const OVERSHOOT = 2.2

// When each tile starts to pop, in seconds from the start of the intro: from the back left of the
// map to the front right, so that the pops sweep across it.
export function popDelays(
  tiles: readonly Pick<Neighbourhood, 'id' | 'x' | 'z'>[],
): Map<string, number> {
  const order = [...tiles].sort(
    (a, b) => a.x + a.z - (b.x + b.z) || a.z - b.z || a.id.localeCompare(b.id),
  )
  const step = Math.min(STAGGER, MAX_SPREAD / Math.max(1, order.length - 1))
  return new Map(order.map((tile, i) => [tile.id, FADE_IN + i * step]))
}

// The size of a tile (0 to 1, with a bounce past 1) `elapsed` seconds after the intro began.
export function popScale(elapsed: number, delay: number): number {
  const t = (elapsed - delay) / POP_DURATION
  if (t <= 0) return 0
  if (t >= 1) return 1
  // Ease out back: grows fast, swells past its size and settles.
  const u = t - 1
  return 1 + (OVERSHOOT + 1) * u * u * u + OVERSHOOT * u * u
}
