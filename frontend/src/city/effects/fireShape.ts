// What the flames and the smoke of a building share between their frames, made once: the colors a
// particle goes through as it burns out, as ready-made colors rather than strings to parse every
// frame, and where the flames burn.
import { Color } from 'three'
import { floorBase } from '../layout'

const make = (...hex: string[]) => hex.map((h) => new Color(h))

export const FIRE_STAGES = {
  // Flames fade from yellow to red, then turn to smoke.
  fire: make('#ffd23f', '#ff7b00', '#d62828', '#4a4a4a'),
  // A few embers, then grey dust.
  smoke: make('#ff7b00', '#6b6b6b', '#4a4a4a'),
}

export function fireStage(life: number): number {
  if (life < 0.3) return 0
  if (life < 0.6) return 1
  if (life < 0.85) return 2
  return 3
}

export function smokeStage(life: number): number {
  if (life < 0.12) return 0
  if (life < 0.5) return 1
  return 2
}

// Where each floor burns, the height of its foot, null for a floor that does not.
export function flameSlots(burning: readonly boolean[]): (number | null)[] {
  return burning.map((on, i) => (on ? floorBase(i) : null))
}
