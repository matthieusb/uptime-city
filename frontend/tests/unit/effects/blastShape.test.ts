import { describe, expect, it } from 'vitest'
import {
  BLAST_S,
  blastActive,
  blastFade,
  blastRadius,
  blastWallHeight,
  CUBES,
  flameBurn,
  flameCube,
  FLAME_GROW_S,
  fireFlames,
  flameCount,
  blastHeat,
  waveThickness,
  MAX_FLAMES,
  MIN_FLAMES,
} from '../../../src/city/effects/blastShape'
import { FIRE_STAGES } from '../../../src/city/effects/fireShape'

describe('the blast wave', () => {
  const max = 40

  it('starts at the impact and reaches the farthest corner of the tile when it ends', () => {
    expect(blastRadius(0, max)).toBe(0)
    expect(blastRadius(-1, max)).toBe(0)
    expect(blastRadius(BLAST_S, max)).toBeCloseTo(max)
    expect(blastRadius(BLAST_S * 3, max)).toBeCloseTo(max)
  })

  it('runs out fast and slows down, like a shock', () => {
    const first = blastRadius(BLAST_S / 4, max) - blastRadius(0, max)
    const last = blastRadius(BLAST_S, max) - blastRadius((3 * BLAST_S) / 4, max)
    expect(first).toBeGreaterThan(last)
    let radius = 0
    for (let t = 0; t <= BLAST_S; t += 0.1) {
      expect(blastRadius(t, max)).toBeGreaterThanOrEqual(radius)
      radius = blastRadius(t, max)
    }
  })

  it('is bright at first and gone at the end', () => {
    expect(blastFade(0)).toBe(1)
    expect(blastFade(BLAST_S / 2)).toBeGreaterThan(0)
    expect(blastFade(BLAST_S / 2)).toBeLessThan(1)
    expect(blastFade(BLAST_S)).toBe(0)
    expect(blastFade(-1)).toBe(0)
  })

  it('shows only while it runs, and gets lower as it spreads', () => {
    expect(blastActive(0)).toBe(true)
    expect(blastActive(BLAST_S - 0.01)).toBe(true)
    expect(blastActive(BLAST_S)).toBe(false)
    expect(blastActive(-1)).toBe(false)
    expect(blastWallHeight(BLAST_S)).toBeLessThan(blastWallHeight(0))
    expect(blastWallHeight(BLAST_S)).toBeGreaterThan(0)
  })
})

describe('fireFlames', () => {
  const half = { w: 20, d: 12 }
  const flames = fireFlames(half.w, half.d)
  const reach = Math.hypot(half.w, half.d)

  it('lights as many fires as the tile asks for, the same every time', () => {
    expect(flames).toHaveLength(flameCount(half.w, half.d))
    expect(fireFlames(half.w, half.d)).toEqual(flames)
    expect(fireFlames(10, 10)).not.toEqual(flames)
  })

  it('spreads them over the tile, none outside it', () => {
    for (const flame of flames) {
      expect(Math.abs(flame.x)).toBeLessThanOrEqual(half.w)
      expect(Math.abs(flame.z)).toBeLessThanOrEqual(half.d)
    }
    expect(
      new Set(flames.map((flame) => Math.round(flame.x))).size,
    ).toBeGreaterThan(5)
  })

  it('sets each one alight after the wave has reached it', () => {
    for (const flame of flames) {
      const arrives = (Math.hypot(flame.x, flame.z) / reach) * BLAST_S
      expect(flame.ignite).toBeGreaterThanOrEqual(arrives)
      expect(flame.ignite).toBeLessThanOrEqual(BLAST_S + 0.5)
    }
  })

  it('lets the ones nearest the impact catch first', () => {
    const byDistance = [...flames].sort(
      (flame, b) => Math.hypot(flame.x, flame.z) - Math.hypot(b.x, b.z),
    )
    expect(byDistance[0].ignite).toBeLessThan(byDistance.at(-1)!.ignite)
  })
})

describe('flameBurn', () => {
  const flame = fireFlames(20, 12)[0]

  it('is out before the fire is lit, grows, then burns fully', () => {
    expect(flameBurn(flame, flame.ignite - 0.01)).toBe(0)
    const growing = flameBurn(flame, flame.ignite + FLAME_GROW_S / 2)
    expect(growing).toBeGreaterThan(0)
    expect(growing).toBeLessThan(1)
    expect(flameBurn(flame, flame.ignite + FLAME_GROW_S)).toBe(1)
  })

  it('burns fully for a nuked tile seen from the start', () => {
    expect(flameBurn(flame, Infinity)).toBe(1)
  })
})

describe('flameCube', () => {
  const flame = fireFlames(20, 12)[3]

  it('rises from the ground to the height of the flame, then starts again', () => {
    for (let k = 0; k < CUBES; k++) {
      for (let t = 0; t < 3; t += 0.13) {
        const cube = flameCube(flame, k, t)
        expect(cube.y).toBeGreaterThanOrEqual(0)
        expect(cube.y).toBeLessThanOrEqual(flame.height + 0.5)
        expect(cube.scale).toBeGreaterThanOrEqual(0)
        expect(cube.stage).toBeGreaterThanOrEqual(0)
        expect(cube.stage).toBeLessThan(FIRE_STAGES.fire.length)
      }
    }
  })

  it('burns out as it rises: bright low, dark high', () => {
    const stages = Array.from({ length: 40 }, (_, i) =>
      flameCube(flame, 0, i * 0.05),
    )
    const low = stages.reduce((a, b) => (a.y < b.y ? a : b))
    const high = stages.reduce((a, b) => (a.y > b.y ? a : b))
    expect(low.stage).toBeLessThan(high.stage)
  })

  it('shrinks as it rises, and sways around the foot of its flame', () => {
    const stages = Array.from({ length: 40 }, (_, i) =>
      flameCube(flame, 1, i * 0.05),
    )
    const low = stages.reduce((a, b) => (a.y < b.y ? a : b))
    const high = stages.reduce((a, b) => (a.y > b.y ? a : b))
    expect(high.scale).toBeLessThan(low.scale)
    const cube = flameCube(flame, 2, 1.7)
    expect(Math.abs(cube.x - flame.x)).toBeLessThan(1)
    expect(Math.abs(cube.z - flame.z)).toBeLessThan(1)
  })

  it('flickers: it is not at the same place a moment later', () => {
    const a = flameCube(flame, 0, 1)
    const b = flameCube(flame, 0, 1.2)
    expect(a.x === b.x && a.y === b.y && a.z === b.z).toBe(false)
  })
})

describe('flameCount', () => {
  it('lights more fires on a bigger tile', () => {
    expect(flameCount(20, 20)).toBeGreaterThan(flameCount(10, 10))
    expect(flameCount(30, 12)).toBeGreaterThan(flameCount(15, 12))
  })

  it('follows the area: about the same for the same ground', () => {
    expect(flameCount(20, 10)).toBe(flameCount(10, 20))
    expect(
      Math.abs(flameCount(20, 10) - flameCount(14, 14)),
    ).toBeLessThanOrEqual(2)
  })

  it('keeps a few fires on the smallest tile and does not burn without end on the biggest', () => {
    expect(flameCount(1, 1)).toBe(MIN_FLAMES)
    expect(flameCount(500, 500)).toBe(MAX_FLAMES)
    expect(Number.isInteger(flameCount(17, 13))).toBe(true)
  })
})

describe('the fiery band of the wave', () => {
  it('gets thicker as the wave spreads, but never thicker than its radius', () => {
    expect(waveThickness(0)).toBe(0)
    expect(waveThickness(5)).toBeGreaterThan(0)
    expect(waveThickness(40)).toBeGreaterThan(waveThickness(5))
    for (const radius of [0.1, 1, 5, 20, 40, 80]) {
      expect(waveThickness(radius)).toBeLessThanOrEqual(radius)
    }
    expect(waveThickness(1000)).toBeLessThan(5)
  })

  it('goes from white-hot to red as it spends itself', () => {
    expect(blastHeat(0)).toBeLessThan(0.25)
    expect(blastHeat(BLAST_S)).toBeGreaterThan(blastHeat(0))
    expect(blastHeat(BLAST_S)).toBeLessThan(0.8)
    expect(blastHeat(Infinity)).toBeLessThan(0.8)
    expect(blastHeat(-1)).toBe(blastHeat(0))
  })
})
