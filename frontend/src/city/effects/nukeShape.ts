// The shape of a mushroom cloud, as pure functions of its growth, independent of three.js. The
// cloud is four noise-shaded meshes (see `NukeMeshes.tsx`): a fireball that swells and turns into
// the cap, a cap shaped like a torus whose surface rolls, a stem lit from inside, and the ground
// glow. Growth `g` is 0 to 1 (see `growthAt`), 1 for a cloud full grown. The "heat" of a surface
// is its place on the ramp of colours: 0 white-hot, then yellow, orange, red, and 1 charcoal smoke.

// How high the cloud rises above the ground, for the smallest tile. The cloud is drawn at this
// size and scaled up by `cloudScale` for a bigger tile, so every profile below is the unscaled one.
export const NUKE_HEIGHT = 17

// ---- The size of the cloud: the bigger the tile, the taller and wider it is.

// The side of a square tile of the same area (the geometric mean of its sides) at which the cloud
// is at its smallest, and the one from which it is at its biggest: the smallest neighbourhoods are
// about 27 by 25 tiles and the biggest about 80 by 75.
export const CLOUD_MIN_SIDE = 26
export const CLOUD_MAX_SIDE = 80
// How much bigger than the unscaled cloud it gets on the biggest tiles, and beyond: taller a bit
// more than wider.
export const CLOUD_MAX_WIDTH = 2
export const CLOUD_MAX_HEIGHT = 2.4

// The scale of the whole cloud (fireball, cap, stem and the glow under them) on a tile of the
// given half sizes: `width` across the ground, `height` upwards. 1 on the smallest tiles, growing
// with the area of the tile up to the maximums, which every bigger tile keeps.
export function cloudScale(
  halfWidth: number,
  halfDepth: number,
): { width: number; height: number } {
  const side = Math.sqrt(4 * Math.max(0, halfWidth) * Math.max(0, halfDepth))
  const t = Math.min(
    1,
    Math.max(0, (side - CLOUD_MIN_SIDE) / (CLOUD_MAX_SIDE - CLOUD_MIN_SIDE)),
  )
  return {
    width: 1 + (CLOUD_MAX_WIDTH - 1) * t,
    height: 1 + (CLOUD_MAX_HEIGHT - 1) * t,
  }
}

// How high the cloud of a tile rises, scaled, for the frame of the camera.
export const nukeHeight = (halfWidth: number, halfDepth: number): number =>
  NUKE_HEIGHT * cloudScale(halfWidth, halfDepth).height

// The tallest a cloud ever gets, on the biggest tiles and beyond.
export const NUKE_MAX_HEIGHT = NUKE_HEIGHT * CLOUD_MAX_HEIGHT

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

// 0 up to `a`, 1 from `b` on, smooth in between.
function ease(a: number, b: number, x: number): number {
  const t = clamp01((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}

// ---- The fireball: swells out of the impact, rises, and is taken over by the cap.

export const FIREBALL_RADIUS = 3.6

export const fireballRadius = (g: number): number =>
  FIREBALL_RADIUS * ease(0, 0.18, g) * (1 - ease(0.3, 0.7, g))

// It sits on the ground while it swells, then rises with the cap it turns into.
export function fireballY(g: number): number {
  const ground = 0.75 * FIREBALL_RADIUS * ease(0, 0.18, g)
  return lerp(ground, capLift(g), ease(0.2, 0.7, g))
}

export const fireballHeat = (g: number): number => 0.5 * ease(0, 0.7, g)

// ---- The cap: a torus (major radius of the ring, minor radii of its tube) that grows as it rises.

export const CAP_Y = 13.2
const CAP_MAJOR = 3.4
const CAP_MINOR = 2.4
const CAP_MINOR_Y = 2.6
// How far the noise pushes the surface out and in, in all, along its normal.
export const CAP_DISP = 1
// How fast the surface rolls, in radians a second: up at the middle, out and down at the rim.
const CAP_ROLL_RATE = 1.2
// How much hotter the underside of the cap is than its top, on the ramp.
export const CAP_HEAT_SPAN = 0.55

export const capScale = (g: number): number => ease(0.1, 0.8, g)

// The height of the middle of the tube.
export const capLift = (g: number): number => lerp(3, CAP_Y, ease(0, 0.9, g))

export const capMajor = (g: number): number => CAP_MAJOR * capScale(g)
export const capMinor = (g: number): number => CAP_MINOR * capScale(g)
// The tube is a little taller than it is wide, which makes the cap a dome.
export const capMinorY = (g: number): number => CAP_MINOR_Y * capScale(g)

// The angle the noise has rolled round the tube at time t, in seconds.
export const capRoll = (t: number): number => CAP_ROLL_RATE * t

// The heat of the underside of the cap: its top is `CAP_HEAT_SPAN` more, charcoal once it is old.
export const capHeat = (g: number): number => lerp(0.05, 0.38, ease(0, 1, g))

// ---- The stem: a lathe, flaring at its foot, closing in a dome inside the cap.

// How far the stem reaches into the cap, over the middle of its tube, once it is full grown.
const STEM_OVERLAP = 1.4
export const STEM_HEIGHT = CAP_Y + STEM_OVERLAP
const DOME_START = 0.9

// Its height, up to the dome inside the cap.
export const stemHeight = (g: number): number =>
  capLift(g) + STEM_OVERLAP * capScale(g)

// How wide it is next to its full width: a thin column at first.
export const stemWidth = (g: number): number => 0.5 + 0.5 * ease(0, 0.8, g)

// Its radius at a fraction h (0 to 1) of its full height: a foot that flares out, a narrow
// middle, a little widening where it joins the cap, then a dome that closes it at h = 1.
export function stemRadius(h: number): number {
  const foot = 1.7 * Math.exp(-h * 10)
  const flare = 0.5 * ease(0.6, 0.9, h)
  const x = clamp01((h - DOME_START) / (1 - DOME_START))
  const dome = Math.sqrt(Math.max(0, 1 - x * x))
  return (1 + foot + flare) * dome
}

// The profile of the stem, from the ground to its top, in world units: points (radius, height)
// to turn into a lathe.
export function stemProfile(steps: number): { r: number; y: number }[] {
  return Array.from({ length: steps + 1 }, (_, i) => ({
    r: stemRadius(i / steps),
    y: (i / steps) * STEM_HEIGHT,
  }))
}

// The heat of the stem at a fraction h of its height: white-hot at the foot of a young cloud,
// charcoal smoke at the top of an old one, and cooler everywhere as it ages. It is linear in h,
// so the shader needs only the heat at the foot and the heat it adds from there to the top.
export const stemHeat = (h: number, g: number): number =>
  clamp01(0.05 + 0.25 * g + (0.5 + 0.2 * g) * h)

// ---- The glow on the ground under the cloud: lights up as the cloud grows, then stays.

export const groundGlowLevel = (g: number): number => ease(0, 0.4, g)

// ---- The ramp of colours, made once as a texture.

export interface RampStop {
  at: number
  color: string
}

export const RAMP_STOPS: RampStop[] = [
  { at: 0, color: '#fff6dc' },
  { at: 0.2, color: '#ffd23f' },
  { at: 0.4, color: '#ff8a1c' },
  { at: 0.6, color: '#d4381a' },
  { at: 0.78, color: '#5a2c20' },
  { at: 1, color: '#2a2623' },
]

const channels = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
]

// The colour at x on the ramp (0 to 1, clamped), as whole sRGB bytes.
export function rampColor(x: number): [number, number, number] {
  const at = clamp01(x)
  let i = 1
  while (i < RAMP_STOPS.length - 1 && RAMP_STOPS[i].at < at) i++
  const from = RAMP_STOPS[i - 1]
  const to = RAMP_STOPS[i]
  const t = clamp01((at - from.at) / (to.at - from.at))
  const a = channels(from.color)
  const b = channels(to.color)
  return [
    Math.round(lerp(a[0], b[0], t)),
    Math.round(lerp(a[1], b[1], t)),
    Math.round(lerp(a[2], b[2], t)),
  ]
}
