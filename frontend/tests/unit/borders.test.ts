import { expect, it } from 'vitest'
import {
  BORDER_PALETTES,
  DEFAULT_PALETTE,
  type PaletteName,
  borderColors,
  borderRing,
} from '../../src/city/borders'

const ids = (n: number) => Array.from({ length: n }, (_, i) => `host-${i}`)

it('gives every neighbourhood its own colour, even past the size of the palette', () => {
  for (const count of [1, 5, 8, 9, 40]) {
    const colors = borderColors(ids(count))
    expect(colors.size).toBe(count)
    expect(new Set(colors.values()).size).toBe(count)
  }
})

it('takes the first colours from the palette, then makes up others', () => {
  const palette = BORDER_PALETTES[DEFAULT_PALETTE]
  const colors = [...borderColors(ids(12)).values()]
  expect(palette).toEqual(
    expect.arrayContaining(colors.slice(0, palette.length)),
  )
  for (const c of colors) expect(c).toMatch(/^#[0-9a-f]{6}$/)
})

it('keeps the colour of a neighbourhood whatever the order of the list', () => {
  const forward = borderColors(['a', 'b', 'c'])
  const backward = borderColors(['c', 'b', 'a'])
  for (const id of ['a', 'b', 'c']) {
    expect(backward.get(id)).toBe(forward.get(id))
  }
})

it('has several palettes, each of distinct colours', () => {
  const names = Object.keys(BORDER_PALETTES)
  expect(names.length).toBeGreaterThan(2)
  for (const name of names) {
    const colors = BORDER_PALETTES[name as keyof typeof BORDER_PALETTES]
    expect(colors.length).toBeGreaterThanOrEqual(6)
    expect(new Set(colors).size).toBe(colors.length)
    for (const c of colors) expect(c).toMatch(/^#[0-9a-f]{6}$/)
  }
})

it('takes the colours from the palette it is given', () => {
  for (const name of Object.keys(BORDER_PALETTES) as PaletteName[]) {
    expect(BORDER_PALETTES[name]).toContain(
      borderColors(['host-b'], name).get('host-b'),
    )
  }
})

it('draws a closed ring inside the tile, pulled in by the inset', () => {
  const ring = borderRing(10, 6, 1, 0.3)
  expect(ring).toHaveLength(5)
  expect(ring[0]).toEqual(ring[4])
  for (const [x, y, z] of ring) {
    expect(Math.abs(x)).toBe(9)
    expect(Math.abs(z)).toBe(5)
    expect(y).toBe(0.3)
  }
})
