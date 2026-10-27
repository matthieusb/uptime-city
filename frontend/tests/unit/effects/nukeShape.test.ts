import { describe, expect, it } from 'vitest'
import {
  CAP_DISP,
  CAP_HEAT_SPAN,
  capHeat,
  capLift,
  capMajor,
  capMinor,
  capMinorY,
  capRoll,
  capScale,
  cloudScale,
  CLOUD_MAX_HEIGHT,
  CLOUD_MAX_SIDE,
  CLOUD_MAX_WIDTH,
  CLOUD_MIN_SIDE,
  fireballHeat,
  fireballRadius,
  fireballY,
  groundGlowLevel,
  NUKE_HEIGHT,
  NUKE_MAX_HEIGHT,
  nukeHeight,
  rampColor,
  RAMP_STOPS,
  stemHeat,
  stemHeight,
  stemRadius,
  stemWidth,
  STEM_HEIGHT,
} from '../../../src/city/effects/nukeShape'

const growths = Array.from({ length: 101 }, (_, i) => i / 100)

const nondecreasing = (values: number[]) =>
  values.every((v, i) => i === 0 || v >= values[i - 1] - 1e-9)

describe('the fireball', () => {
  it('swells out of nothing, then turns into the cap and is gone', () => {
    expect(fireballRadius(0)).toBe(0)
    expect(fireballRadius(1)).toBe(0)
    const peak = Math.max(...growths.map(fireballRadius))
    expect(peak).toBeGreaterThan(2.5)
    // At its biggest it comes before the middle of the growth.
    const at = growths.find((g) => fireballRadius(g) === peak)!
    expect(at).toBeLessThan(0.5)
  })

  it('sits on the ground at first, then rises with the cap, never sinking in', () => {
    expect(fireballY(0.2)).toBeLessThan(fireballY(0.6) + 0.01)
    for (const g of growths) {
      expect(fireballY(g) - fireballRadius(g)).toBeGreaterThan(-1.2)
    }
    expect(fireballY(1)).toBeCloseTo(capLift(1), 6)
  })

  it('is white-hot at first and cools down', () => {
    expect(fireballHeat(0)).toBeLessThan(0.1)
    expect(nondecreasing(growths.map(fireballHeat))).toBe(true)
    expect(fireballHeat(1)).toBeLessThan(0.7)
  })
})

describe('the cap', () => {
  it('has nothing at first, then grows to its full size and stays', () => {
    expect(capScale(0)).toBe(0)
    expect(capScale(1)).toBe(1)
    expect(nondecreasing(growths.map(capScale))).toBe(true)
    expect(capMajor(0)).toBe(0)
    expect(capMinor(0)).toBe(0)
    expect(capMinorY(0)).toBe(0)
    expect(capMajor(1)).toBeGreaterThan(capMinor(1))
    expect(capMajor(1) + capMinor(1)).toBeGreaterThan(5)
  })

  it('rises with the growth, and its top stays under the height of the cloud', () => {
    expect(nondecreasing(growths.map(capLift))).toBe(true)
    expect(capLift(1)).toBeGreaterThan(capLift(0))
    for (const g of growths) {
      expect(capLift(g) + capMinorY(g) + CAP_DISP / 2).toBeLessThanOrEqual(
        NUKE_HEIGHT,
      )
    }
    // And it nearly reaches it.
    expect(capLift(1) + capMinorY(1) + CAP_DISP / 2).toBeGreaterThan(
      NUKE_HEIGHT - 2,
    )
  })

  it('is much wider than the stem', () => {
    expect(capMajor(1) + capMinor(1)).toBeGreaterThan(2 * stemRadius(0.5))
  })

  it('rolls at a steady pace, forever', () => {
    expect(capRoll(0)).toBe(0)
    expect(capRoll(10) - capRoll(5)).toBeCloseTo(capRoll(5), 6)
    expect(capRoll(5)).toBeGreaterThan(0)
  })

  it('glows underneath and is dark smoke on top, more so as it ages', () => {
    expect(CAP_HEAT_SPAN).toBeGreaterThan(0.3)
    expect(nondecreasing(growths.map(capHeat))).toBe(true)
    expect(capHeat(1) + CAP_HEAT_SPAN).toBeGreaterThan(0.9)
    expect(capHeat(1) + CAP_HEAT_SPAN).toBeLessThanOrEqual(1.0001)
    expect(capHeat(1)).toBeLessThan(0.6)
  })
})

describe('the stem', () => {
  it('reaches up to the cap and into it, from nothing', () => {
    expect(nondecreasing(growths.map(stemHeight))).toBe(true)
    expect(stemHeight(1)).toBeCloseTo(STEM_HEIGHT, 6)
    expect(STEM_HEIGHT).toBeLessThanOrEqual(NUKE_HEIGHT)
    for (const g of growths) {
      expect(stemHeight(g)).toBeGreaterThan(capLift(g) - 0.001)
    }
  })

  it('is thin at first and gets to its full width', () => {
    expect(stemWidth(0)).toBeGreaterThan(0)
    expect(stemWidth(0)).toBeLessThan(1)
    expect(stemWidth(1)).toBe(1)
    expect(nondecreasing(growths.map(stemWidth))).toBe(true)
  })

  it('flares at the foot, is narrow in the middle, and closes in a dome at the top', () => {
    expect(stemRadius(0)).toBeGreaterThan(2 * stemRadius(0.5))
    expect(stemRadius(0.5)).toBeGreaterThan(0.5)
    expect(stemRadius(1)).toBeCloseTo(0, 6)
    // Narrower than the hole of the cap, so that it never shows through it.
    expect(stemRadius(0.6)).toBeLessThan(capMajor(1))
    for (let h = 0; h <= 1; h += 0.01) {
      expect(stemRadius(h)).toBeGreaterThanOrEqual(0)
      expect(Number.isFinite(stemRadius(h))).toBe(true)
    }
  })

  it('goes from white-hot to charcoal smoke with height, and cools with age', () => {
    for (const g of [0, 0.5, 1]) {
      expect(stemHeat(0, g)).toBeLessThan(stemHeat(0.5, g))
      expect(stemHeat(0.5, g)).toBeLessThan(stemHeat(1, g))
    }
    for (const h of [0, 0.5, 1]) {
      expect(stemHeat(h, 0)).toBeLessThanOrEqual(stemHeat(h, 1))
    }
    expect(stemHeat(0, 0)).toBeLessThan(0.1)
    expect(stemHeat(1, 1)).toBeCloseTo(1, 6)
    for (const g of growths) {
      for (const h of [0, 0.3, 1]) {
        expect(stemHeat(h, g)).toBeGreaterThanOrEqual(0)
        expect(stemHeat(h, g)).toBeLessThanOrEqual(1)
      }
    }
  })
})

describe('the ground glow', () => {
  it('lights up as the cloud grows and stays', () => {
    expect(groundGlowLevel(0)).toBe(0)
    expect(groundGlowLevel(1)).toBe(1)
    expect(nondecreasing(growths.map(groundGlowLevel))).toBe(true)
  })
})

describe('the colour ramp', () => {
  it('goes from white through yellow, orange and red to dark smoke', () => {
    const luminance = ([r, g, b]: number[]) => 0.3 * r + 0.59 * g + 0.11 * b
    const white = rampColor(0)
    const dark = rampColor(1)
    expect(white[0]).toBeGreaterThan(240)
    expect(white[1]).toBeGreaterThan(220)
    expect(white[2]).toBeGreaterThan(180)
    expect(luminance(dark)).toBeLessThan(70)
    // Yellow is greener than orange, which is greener than red.
    const [yellow, orange, red] = [0.2, 0.4, 0.6].map(rampColor)
    expect(yellow[1]).toBeGreaterThan(orange[1])
    expect(orange[1]).toBeGreaterThan(red[1])
    // Red dominates the warm part of the ramp.
    expect(red[0]).toBeGreaterThan(red[2] + 100)
  })

  it('is darker and darker from yellow on', () => {
    const lum = ([r, g, b]: number[]) => 0.3 * r + 0.59 * g + 0.11 * b
    const steps = Array.from({ length: 41 }, (_, i) =>
      lum(rampColor(0.2 + i / 50)),
    )
    steps.forEach((l, i) => {
      if (i > 0) expect(l).toBeLessThanOrEqual(steps[i - 1] + 1e-6)
    })
  })

  it('gives whole bytes, clamps outside 0 to 1, and starts and ends on its stops', () => {
    expect(rampColor(-3)).toEqual(rampColor(0))
    expect(rampColor(7)).toEqual(rampColor(1))
    expect(RAMP_STOPS[0].at).toBe(0)
    expect(RAMP_STOPS.at(-1)!.at).toBe(1)
    for (let x = 0; x <= 1; x += 0.037) {
      for (const channel of rampColor(x)) {
        expect(Number.isInteger(channel)).toBe(true)
        expect(channel).toBeGreaterThanOrEqual(0)
        expect(channel).toBeLessThanOrEqual(255)
      }
    }
  })
})

describe('the size of the cloud, by its tile', () => {
  // A tile of the given side, square.
  const square = (side: number) => cloudScale(side / 2, side / 2)
  const sides = Array.from({ length: 121 }, (_, i) => 10 + i)

  it('is 1 on the smallest tiles, and nothing smaller on a tinier one', () => {
    // A neighbourhood of 27 by 25 tiles, the smallest there is.
    const small = cloudScale(13.5, 12.5)
    expect(small.width).toBeCloseTo(1, 1)
    expect(small.height).toBeCloseTo(1, 1)
    expect(cloudScale(2, 2)).toEqual({ width: 1, height: 1 })
    expect(cloudScale(0, 0)).toEqual({ width: 1, height: 1 })
  })

  it('grows, taller and wider, with the tile', () => {
    const widths = sides.map((s) => square(s).width)
    const heights = sides.map((s) => square(s).height)
    expect(nondecreasing(widths)).toBe(true)
    expect(nondecreasing(heights)).toBe(true)
    const [small, big] = [square(CLOUD_MIN_SIDE), square(CLOUD_MAX_SIDE)]
    expect(big.width).toBeGreaterThan(small.width)
    expect(big.height).toBeGreaterThan(small.height)
    expect(square(50).height).toBeGreaterThan(square(40).height)
    expect(square(50).width).toBeGreaterThan(square(40).width)
  })

  it('grows a little more in height than in width', () => {
    const mid = square(55)
    expect(mid.height).toBeGreaterThan(mid.width)
  })

  it('is about 2 to 2.5 times as high on the biggest neighbourhoods (80 by 75)', () => {
    const big = cloudScale(40, 37.5)
    expect(big.height).toBeGreaterThanOrEqual(2)
    expect(big.height).toBeLessThanOrEqual(2.5)
    expect(big.width).toBeGreaterThanOrEqual(1.5)
    expect(big.width).toBeLessThanOrEqual(2.5)
  })

  it('is clamped on tiles bigger than that', () => {
    expect(square(500)).toEqual({
      width: CLOUD_MAX_WIDTH,
      height: CLOUD_MAX_HEIGHT,
    })
    expect(cloudScale(1000, 30).height).toBeLessThanOrEqual(CLOUD_MAX_HEIGHT)
  })

  it('follows the area: the same for the same ground, whatever its shape', () => {
    expect(cloudScale(20, 40)).toEqual(cloudScale(40, 20))
    expect(cloudScale(20, 40).height).toBeCloseTo(
      cloudScale(28.28, 28.28).height,
      2,
    )
  })

  it('keeps the whole scaled cloud under the tallest height, for every tile', () => {
    const capTop = (g: number) => capLift(g) + capMinorY(g) + CAP_DISP / 2
    expect(NUKE_MAX_HEIGHT).toBeCloseTo(NUKE_HEIGHT * CLOUD_MAX_HEIGHT, 6)
    for (const side of [...sides, 500]) {
      const { height } = square(side)
      for (const g of growths) {
        expect(capTop(g) * height).toBeLessThanOrEqual(NUKE_MAX_HEIGHT)
        expect(stemHeight(g) * height).toBeLessThanOrEqual(NUKE_MAX_HEIGHT)
      }
      expect(nukeHeight(side / 2, side / 2)).toBeLessThanOrEqual(
        NUKE_MAX_HEIGHT + 1e-9,
      )
    }
  })

  it('gives the height of the cloud on its tile, from 17 for the smallest', () => {
    expect(nukeHeight(13.5, 12.5)).toBeCloseTo(NUKE_HEIGHT, 0)
    expect(nukeHeight(40, 37.5)).toBeGreaterThan(nukeHeight(13.5, 12.5))
  })
})
