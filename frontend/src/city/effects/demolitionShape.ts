// The charges that demolish a building before it falls, and the dust that
// rises once it has fallen: pure functions, independent of three.js. The same
// ones every time for a given building.
import { PRELUDE_S } from '../collapse'
import { hash, seededRandom } from '../layout'

export interface Cube {
  x: number
  y: number
  z: number
  scale: number
  color: string
}

// Charges around the foot of a building, and cubes thrown by each.
export const CHARGES = 9
const CUBES_PER_CHARGE = 4
export const MAX_BLAST_CUBES = CHARGES * CUBES_PER_CHARGE
// How much bigger the explosions are than the building's own scale.
const BLAST_SCALE = 4
// How long one charge burns.
const BLAST_S = 0.45

// Dust puffs, and how long the cloud lasts for each building.
export const PUFFS = 16
const MIN_SMOKE_S = 2
const MAX_SMOKE_S = 4

const SPARKS = ['#fff3b0', '#ffd23f', '#ff7b00', '#d62828']
const DEBRIS = ['#7a7a85', '#5c5c66', '#d9c5a0']

export function smokeDuration(id: string): number {
  const random = seededRandom(hash(`dust:${id}`))
  return MIN_SMOKE_S + random() * (MAX_SMOKE_S - MIN_SMOKE_S)
}

// How strongly the charges light the foot of the building, from 0 to 1.
export function blastLight(id: string, elapsed: number): number {
  return Math.min(
    1,
    chargesOf(id).reduce((sum, c) => {
      const age = (elapsed - c.at) / BLAST_S
      return age >= 0 && age < 1 ? sum + (1 - age) : sum
    }, 0),
  )
}

interface Charge {
  // Where it goes off, around the foot of the building.
  angle: number
  at: number
  size: number
}

function chargesOf(id: string): Charge[] {
  const random = seededRandom(hash(`charges:${id}`))
  return Array.from({ length: CHARGES }, (_, i) => ({
    // Spread around the building, in an order that jumps from side to side.
    angle: ((i * 5) / CHARGES) * 2 * Math.PI + random() * 0.4,
    at: random() * (PRELUDE_S - BLAST_S),
    size: (1.2 + random() * 0.9) * BLAST_SCALE,
  }))
}

// The cubes of fire and debris at `elapsed` seconds into the demolition.
// Fire fades from white to red as it rises and spreads, debris flies out.
export function blastCubes(id: string, width: number, elapsed: number): Cube[] {
  const random = seededRandom(hash(`blast:${id}`))
  const reach = width / 2
  const cubes: Cube[] = []
  for (const charge of chargesOf(id)) {
    const age = (elapsed - charge.at) / BLAST_S
    // Draw the same numbers whether or not the charge is burning.
    const throws = Array.from({ length: CUBES_PER_CHARGE }, () => ({
      spread: (0.8 + random() * 2) * BLAST_SCALE,
      rise: (1 + random() * 2.8) * BLAST_SCALE,
      turn: (random() - 0.5) * 1.2,
      debris: random() < 0.45,
    }))
    if (age < 0 || age >= 1) continue
    for (const t of throws) {
      const angle = charge.angle + t.turn * age
      const out = reach + 0.1 + t.spread * age
      cubes.push({
        x: Math.cos(angle) * out,
        y: 0.3 + t.rise * age - (t.debris ? 3.2 * BLAST_SCALE * age * age : 0),
        z: Math.sin(angle) * out,
        scale: charge.size * (t.debris ? 0.3 : 1 - 0.6 * age) * (1 - age * 0.5),
        color: t.debris
          ? DEBRIS[Math.floor(age * 3) % DEBRIS.length]
          : SPARKS[
              Math.min(SPARKS.length - 1, Math.floor(age * SPARKS.length))
            ],
      })
    }
  }
  return cubes
}

// How opaque the dust is `age` seconds after the fall: it is thickest as the
// building hits the ground, then thins out until it is gone.
export function smokeOpacity(id: string, age: number): number {
  const t = age / smokeDuration(id)
  if (t < 0 || t >= 1) return 0
  return 0.85 * (1 - t * t)
}

// The puffs of dust `age` seconds after the fall: they billow out of the
// rubble, rise and swell as they thin out.
export function smokeCubes(id: string, width: number, age: number): Cube[] {
  const t = age / smokeDuration(id)
  if (t < 0 || t >= 1) return []
  const random = seededRandom(hash(`puffs:${id}`))
  const reach = width / 2
  return Array.from({ length: PUFFS }, () => {
    const angle = random() * 2 * Math.PI
    const distance = Math.sqrt(random()) * reach * 1.3
    const rise = 1.5 + random() * 3.2
    const size = 1.8 + random() * 1.5
    const grey = 0x6b + Math.floor(random() * 0x40)
    return {
      x: Math.cos(angle) * distance * (1 + t * 0.5),
      y: 0.8 + rise * Math.sqrt(t),
      z: Math.sin(angle) * distance * (1 + t * 0.5),
      scale: size * (0.5 + 1.1 * Math.sqrt(t)),
      color: `#${grey.toString(16).repeat(3)}`,
    }
  })
}
