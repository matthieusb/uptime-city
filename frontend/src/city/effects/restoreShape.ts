// The restoration of a nuked neighbourhood whose host is back up, as pure
// functions of time, independent of three.js: a shock wave spreads from the
// middle of the tile in a circle, and what it passes goes back to its normal
// look. Times
// are in seconds from the start of the restoration.

// The wave reaches the farthest corner of the tile in this time.
export const SWEEP_S = 3.5
// A ruined building takes this long to stand again once the wave passed it.
export const RISE_S = 1.2
// The whole restoration.
export const RESTORE_S = SWEEP_S + RISE_S + 0.3

// How far a point of the ground is from the middle of the plate, where the
// wave starts.
export function fromMiddle(x: number, z: number): number {
  return Math.hypot(x, z)
}

export interface SweepRange {
  min: number
  max: number
}

// From the middle of a plate to its farthest corner, in the plate's own
// coordinates, whose origin is at its middle.
export function sweepRange(halfWidth: number, halfDepth: number): SweepRange {
  return { min: 0, max: Math.hypot(halfWidth, halfDepth) }
}

// How many planes make up the circle of the wave.
export const WAVE_SIDES = 24

export interface WavePlane {
  // Unit vector on the ground, pointing outwards.
  x: number
  z: number
  // Distance from the middle.
  distance: number
}

// The wave is a circle of this radius, drawn as a ring of planes tangent to
// it: three.js clips with planes, not with curves.
export function wavePlanes(radius: number): WavePlane[] {
  return Array.from({ length: WAVE_SIDES }, (_, i) => {
    const angle = (i / WAVE_SIDES) * 2 * Math.PI
    return { x: Math.cos(angle), z: Math.sin(angle), distance: radius }
  })
}

// Where the front of the wave is, its radius, growing at a steady pace.
export function sweepFront(elapsed: number, range: SweepRange): number {
  const done = Math.min(1, Math.max(0, elapsed / SWEEP_S))
  return range.min + (range.max - range.min) * done
}

// When the front reaches a point at this distance from the middle.
export function passTime(s: number, range: SweepRange): number {
  return ((s - range.min) / (range.max - range.min)) * SWEEP_S
}

// How much in ruins a building at distance s from the middle still is: 1 until the wave reaches it,
// then it stands again, rising smoothly, and 0 once it does.
export function lotCollapse(
  s: number,
  elapsed: number,
  range: SweepRange,
): number {
  const x = Math.min(1, Math.max(0, (elapsed - passTime(s, range)) / RISE_S))
  return 1 - x * x * (3 - 2 * x)
}
