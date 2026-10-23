// Pure logic of the focus view, independent of three.js: a clicked
// neighbourhood is lifted towards the camera, in front of a dimming backdrop
// that hides the others.
import { worldFrame, type Frame, type Neighbourhood, type World } from './world'

// Unit vector from the ground towards the camera. It is the camera direction
// of CityView: 45° around Y and 30° above the ground.
const PITCH = Math.PI / 6
const NORM = Math.hypot(1, Math.SQRT2 * Math.tan(PITCH), 1)
export const VIEW: [number, number, number] = [
  1 / NORM,
  (Math.SQRT2 * Math.tan(PITCH)) / NORM,
  1 / NORM,
]

// How far a point is along the view direction: the larger, the closer to the
// camera. Moving a point along VIEW does not move it on screen.
export function depth(x: number, y: number, z: number): number {
  return x * VIEW[0] + y * VIEW[1] + z * VIEW[2]
}

// Room kept between the backdrop and what it hides or what stands in front.
const MARGIN = 2

// In focus view the neighbourhood grows and the rest of the map shrinks, both
// around the middle of the screen, as if it was further away. The camera is
// orthographic, so size is the only sign of distance.
export const NEAR = 1.1
export const FAR = 0.6

// Where and how big a neighbourhood stands in focus view: scaled around
// `center`, a point of the ground at the middle of the screen.
export interface Pose {
  center: [number, number, number]
  scale: number
}

export interface Focus {
  // How far the focused neighbourhood moves, along VIEW.
  lift: [number, number, number]
  // Depth of the backdrop once the neighbourhood is lifted.
  backdropDepth: number
}

// The depth of a corner of a neighbourhood once it is scaled around `center`.
function corners(
  n: Neighbourhood,
  top: number,
  center: [number, number, number],
  scale: number,
): number[] {
  const middle = depth(...center)
  return [-1, 1].flatMap((dx) =>
    [-1, 1].flatMap((dz) =>
      [0, top].map(
        (y) =>
          middle +
          scale *
            (depth(
              n.x + dx * n.layout.halfWidth,
              y,
              n.z + dz * n.layout.halfDepth,
            ) -
              middle),
      ),
    ),
  )
}

// Where the neighbourhood goes so that it is wholly in front of every other
// one, up to the top of their tallest building, with the backdrop in between.
// `center` is the point of the ground that the camera looks at.
export function focusFor(
  world: World,
  id: string,
  top: number,
  center: [number, number, number],
): Focus | null {
  const focused = world.neighbourhoods.find((n) => n.id === id)
  if (!focused) return null
  const others = [...world.neighbourhoods, ...world.wilds]
    .filter((n) => n !== focused)
    .flatMap((n) => corners(n, top, center, FAR))
  const behind = Math.max(-Infinity, ...others)
  const front = Math.min(...corners(focused, 0, center, NEAR))
  const distance = Math.max(0, behind - front) + MARGIN
  return {
    lift: [VIEW[0] * distance, VIEW[1] * distance, VIEW[2] * distance],
    backdropDepth: front + distance - MARGIN / 2,
  }
}

// What the camera frames to show one neighbourhood, up to its tallest
// building, as big as it gets in focus view.
export function plateFrame(n: Neighbourhood, top: number): Frame {
  const frame = worldFrame(
    {
      neighbourhoods: [n],
      wilds: [],
      halfWidth: Math.abs(n.x) + n.layout.halfWidth,
      halfDepth: Math.abs(n.z) + n.layout.halfDepth,
    },
    top,
  )
  return { ...frame, width: frame.width * NEAR, height: frame.height * NEAR }
}

// One step towards a goal, smooth whatever the frame rate.
export function approach(
  current: number,
  goal: number,
  seconds: number,
  speed = 8,
): number {
  const next = current + (goal - current) * (1 - Math.exp(-speed * seconds))
  return Math.abs(goal - next) < 0.001 ? goal : next
}

// Zoom at which a frame fits in a canvas of the given size, with some room
// around it.
export function fitZoom(frame: Frame, width: number, height: number): number {
  return Math.min(width / (frame.width * 1.05), height / (frame.height * 1.1))
}
