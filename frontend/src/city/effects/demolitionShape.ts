// The shock wave that climbs a building before it falls, and the dust that
// rises once it has fallen: pure functions, independent of three.js. The same
// ones every time for a given building.
import { PRELUDE_S } from '../collapse'
import { hash, seededRandom } from '../layout'

// Where a piece is and how big, written into a pose that is reused from one frame to the next.
// `tone` is an index into `BLAST_COLORS`.
export interface Pose {
  x: number
  y: number
  z: number
  scale: number
  tone: number
}

export const newPose = (): Pose => ({ x: 0, y: 0, z: 0, scale: 0, tone: 0 })

// A shock wave climbs the building: its floors burst one after the other from the foot to the
// roof, which bursts last. A tall building bursts by bands of floors, at most `MAX_BANDS`.
export const MAX_BANDS = 10
const FIREBALLS_PER_WALL = 2
const CHUNKS = 4
const CUBES_PER_BURST = 4 * FIREBALLS_PER_WALL + CHUNKS
export const MAX_BLAST_CUBES = (MAX_BANDS + 1) * CUBES_PER_BURST
// How long one burst lasts, and how fast the pieces of a burst fly, in tiles per second.
const BLAST_S = 0.5
const GRAVITY = 9

// Dust puffs, and how long the cloud lasts for each building.
export const PUFFS = 16
const MIN_SMOKE_S = 2
const MAX_SMOKE_S = 4

const SPARKS = ['#fff3b0', '#ffd23f', '#ff7b00', '#d62828']
const DEBRIS = ['#7a7a85', '#5c5c66', '#d9c5a0']
// The colors of the pieces: the sparks, then the debris.
export const BLAST_COLORS = [...SPARKS, ...DEBRIS]

export function smokeDuration(id: string): number {
  const random = seededRandom(hash(`dust:${id}`))
  return MIN_SMOKE_S + random() * (MAX_SMOKE_S - MIN_SMOKE_S)
}

// The bursts of a building of `floors` floors: one per band of floors, then the roof.
const burstsOf = (floors: number): number => Math.min(floors, MAX_BANDS) + 1

// When burst `i` (the last one being the roof) goes off.
const burstAt = (i: number, bursts: number): number =>
  (i / Math.max(1, bursts - 1)) * (PRELUDE_S - BLAST_S)

// One fireball or chunk of a burst, with everything it needs to be placed at any time.
export interface Piece {
  at: number
  chunk: boolean
  // Where it leaves the wall, and which way it goes.
  x: number
  y: number
  z: number
  nx: number
  nz: number
  speed: number
  lift: number
  size: number
}

// The pieces of a demolition, the same every time for a given building: fireballs burst out of
// the windows of a band of floors, while chunks fly off. The roof bursts last, upwards. Made
// once per building, not every frame.
export function blastPlan(
  id: string,
  width: number,
  height: number,
  floors: number,
): Piece[] {
  const bursts = burstsOf(floors)
  const half = width / 2
  const walls = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const
  const pieces: Piece[] = []
  for (let i = 0; i < bursts; i++) {
    const roof = i === bursts - 1
    const random = seededRandom(hash(`burst:${id}:${i}`))
    const between = (min: number, max: number) => min + random() * (max - min)
    const bottom = roof ? height : (i / (bursts - 1)) * height
    const band = roof ? 0.6 : height / (bursts - 1)
    for (let k = 0; k < CUBES_PER_BURST; k++) {
      const [nx, nz] = walls[k % 4]
      const along = between(-(half - 0.3), half - 0.3)
      const chunk = k >= 4 * FIREBALLS_PER_WALL
      pieces.push({
        at: burstAt(i, bursts),
        chunk,
        x: nx * half + (nx === 0 ? along : 0),
        y: bottom + between(0.2, 1) * band,
        z: nz * half + (nz === 0 ? along : 0),
        nx,
        nz,
        speed: between(3, 4.5),
        lift: roof ? between(3, 6) : between(0.5, 1.2),
        size: chunk
          ? between(0.15, 0.3)
          : roof
            ? between(1.1, 1.7)
            : between(0.7, 1.1),
      })
    }
  }
  return pieces
}

// Where a piece is `elapsed` seconds into the demolition, written into `pose`; false while it is
// not burning. Fireballs slow down as they spread, grow and shrink away, and go from white to
// red; chunks fly in an arc and fall.
export function piecePose(piece: Piece, elapsed: number, pose: Pose): boolean {
  const age = (elapsed - piece.at) / BLAST_S
  if (age < 0 || age >= 1) return false
  const t = age * BLAST_S
  const spread = age - age ** 2 / 2
  const out = piece.chunk
    ? piece.speed * 0.6 * t
    : piece.speed * BLAST_S * spread
  pose.x = piece.x + piece.nx * out
  pose.z = piece.z + piece.nz * out
  pose.y = Math.max(
    0,
    piece.chunk
      ? piece.y + (piece.lift + 2) * t - 0.5 * GRAVITY * t * t
      : piece.y + piece.lift * spread * BLAST_S,
  )
  pose.scale = piece.chunk
    ? piece.size * (1 - age)
    : piece.size * Math.sin(Math.PI * age)
  pose.tone = piece.chunk
    ? SPARKS.length + (Math.floor(age * 3) % DEBRIS.length)
    : Math.min(SPARKS.length - 1, Math.floor(age * SPARKS.length))
  return true
}

// How opaque the dust is `age` seconds after the fall: it is thickest as the
// building hits the ground, then thins out until it is gone.
export function smokeOpacity(id: string, age: number): number {
  const t = age / smokeDuration(id)
  if (t < 0 || t >= 1) return 0
  return 0.85 * (1 - t * t)
}

// A puff of dust, with everything it needs to be placed at any time.
export interface Puff {
  angle: number
  distance: number
  rise: number
  size: number
  color: string
}

// The puffs of dust of a building, the same every time. Made once per building.
export function smokePlan(id: string, width: number): Puff[] {
  const random = seededRandom(hash(`puffs:${id}`))
  const reach = width / 2
  return Array.from({ length: PUFFS }, () => {
    const angle = random() * 2 * Math.PI
    const distance = Math.sqrt(random()) * reach * 1.3
    const rise = 1.5 + random() * 3.2
    const size = 1.8 + random() * 1.5
    const grey = 0x6b + Math.floor(random() * 0x40)
    return {
      angle,
      distance,
      rise,
      size,
      color: `#${grey.toString(16).repeat(3)}`,
    }
  })
}

// Where a puff is `t` of the way through the cloud's life, from 0 to 1: it billows out of the
// rubble, rises and swells as it thins out.
export function puffPose(puff: Puff, t: number, pose: Pose): void {
  pose.x = Math.cos(puff.angle) * puff.distance * (1 + t * 0.5)
  pose.y = 0.8 + puff.rise * Math.sqrt(t)
  pose.z = Math.sin(puff.angle) * puff.distance * (1 + t * 0.5)
  pose.scale = puff.size * (0.5 + 1.1 * Math.sqrt(t))
}

// How far through its life the cloud is `age` seconds after the fall, or null once it is gone.
export function smokeProgress(id: string, age: number): number | null {
  const t = age / smokeDuration(id)
  return t < 0 || t >= 1 ? null : t
}
