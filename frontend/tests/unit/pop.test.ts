import { expect, it } from 'vitest'
import { FADE_IN, POP_DURATION, popDelays, popScale } from '../../src/city/pop'

const tile = (id: string, x: number, z: number) => ({ id, x, z })

it('pops the tiles one after the other, from the back left to the front right', () => {
  const delays = popDelays([
    tile('front', 10, 10),
    tile('back', -10, -10),
    tile('middle', 0, 0),
  ])
  expect(delays.get('back')).toBe(FADE_IN)
  expect(delays.get('middle')!).toBeGreaterThan(0)
  expect(delays.get('front')!).toBeGreaterThan(delays.get('middle')!)
})

it('gives every tile its own moment', () => {
  const tiles = Array.from({ length: 8 }, (_, i) => tile(`t${i}`, i, 0))
  expect(new Set(popDelays(tiles).values()).size).toBe(8)
})

it('keeps the whole intro short, however many tiles there are', () => {
  const tiles = Array.from({ length: 400 }, (_, i) => tile(`t${i}`, i % 20, i))
  expect(
    Math.max(...popDelays(tiles).values()) + POP_DURATION,
  ).toBeLessThanOrEqual(3.5)
})

it('keeps a tile hidden until its turn, swells it past its size, and settles it', () => {
  expect(popScale(0.4, 1)).toBe(0)
  const sizes = Array.from({ length: 50 }, (_, i) =>
    popScale(1 + (i / 50) * POP_DURATION, 1),
  )
  expect(Math.max(...sizes)).toBeGreaterThan(1)
  expect(popScale(1 + POP_DURATION, 1)).toBe(1)
  expect(popScale(99, 1)).toBe(1)
})
