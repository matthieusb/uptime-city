import { describe, expect, it } from 'vitest'
import {
  approach,
  depth,
  fitZoom,
  focusFor,
  plateFrame,
  VIEW,
} from '../../src/city/focus'
import {
  worldFrame,
  worldLayout,
  type NeighbourhoodSpec,
} from '../../src/city/world'

const spec = (id: string, ...vms: number[]): NeighbourhoodSpec => ({
  id,
  buildings: [
    { id, services: 2 },
    ...vms.map((services, i) => ({ id: `${id}-vm${i}`, services })),
  ],
})

const world = worldLayout([spec('a', 3), spec('b'), spec('c', 5), spec('d')])
const TOP = 20

describe('VIEW', () => {
  it('is a unit vector that looks down at 30° along the diagonal', () => {
    expect(Math.hypot(...VIEW)).toBeCloseTo(1)
    expect(VIEW[0]).toBeCloseTo(VIEW[2])
    expect(VIEW[1] / Math.hypot(VIEW[0], VIEW[2])).toBeCloseTo(
      Math.tan(Math.PI / 6),
    )
  })
})

describe('focusFor', () => {
  it('knows no neighbourhood that is not on the map', () => {
    expect(focusFor(world, 'nope', TOP)).toBeNull()
  })

  it('lifts a neighbourhood along the view, so that it does not move on screen', () => {
    const { lift } = focusFor(world, 'a', TOP)!
    const length = Math.hypot(...lift)
    expect(length).toBeGreaterThan(0)
    for (let i = 0; i < 3; i++) expect(lift[i] / length).toBeCloseTo(VIEW[i])
  })

  it.each(['a', 'b', 'c', 'd'])(
    'puts %s in front of the backdrop and every other one behind it',
    (id) => {
      const { lift, backdropDepth } = focusFor(world, id, TOP)!
      const plate = world.neighbourhoods.find((n) => n.id === id)!
      const corner = (n: typeof plate, y: number, sx: number, sz: number) =>
        depth(n.x + sx * n.layout.halfWidth, y, n.z + sz * n.layout.halfDepth)
      const signs = [-1, 1]
      const lifted = Math.min(
        ...signs.flatMap((sx) =>
          signs.map((sz) => corner(plate, 0, sx, sz) + Math.hypot(...lift)),
        ),
      )
      expect(lifted).toBeGreaterThan(backdropDepth)
      for (const other of world.neighbourhoods.filter((n) => n !== plate)) {
        const highest = Math.max(
          ...signs.flatMap((sx) =>
            signs.map((sz) => corner(other, TOP, sx, sz)),
          ),
        )
        expect(highest).toBeLessThan(backdropDepth)
      }
    },
  )

  it('works for a map of one neighbourhood', () => {
    const alone = worldLayout([spec('a')])
    expect(focusFor(alone, 'a', TOP)).not.toBeNull()
  })
})

describe('plateFrame', () => {
  it('frames one neighbourhood, smaller than the map', () => {
    const plate = world.neighbourhoods[0]
    const frame = plateFrame(plate, TOP)
    expect(frame.width).toBeGreaterThan(0)
    const whole = worldFrame(world, TOP)
    expect(frame.width).toBeLessThan(whole.width)
    expect(frame.height).toBeLessThan(whole.height)
  })
})

describe('plateFrame centering', () => {
  it.each([0, 1, 2, 3])(
    'puts the middle of what neighbourhood %i shows at the middle of the screen',
    (i) => {
      const plate = world.neighbourhoods[i]
      const tallest = Math.max(...plate.layout.lots.map((l) => l.height))
      const { target } = plateFrame(plate, tallest)
      const screen = (x: number, y: number, z: number) => ({
        sx: (x - z) / Math.SQRT2,
        sy:
          y * Math.cos(Math.PI / 6) -
          ((x + z) / Math.SQRT2) * Math.sin(Math.PI / 6),
      })
      const points = [-1, 1].flatMap((dx) =>
        [-1, 1].flatMap((dz) =>
          [0, tallest].map((y) =>
            screen(
              plate.x + dx * plate.layout.halfWidth,
              y,
              plate.z + dz * plate.layout.halfDepth,
            ),
          ),
        ),
      )
      const middle = (values: number[]) =>
        (Math.min(...values) + Math.max(...values)) / 2
      const centre = screen(...target)
      expect(centre.sx).toBeCloseTo(middle(points.map((p) => p.sx)), 6)
      expect(centre.sy).toBeCloseTo(middle(points.map((p) => p.sy)), 6)
    },
  )
})

describe('fitZoom', () => {
  it('zooms in more on a smaller frame', () => {
    const big = plateFrame(world.neighbourhoods[0], TOP)
    const small = { ...big, width: big.width / 2, height: big.height / 2 }
    expect(fitZoom(small, 800, 600)).toBeCloseTo(2 * fitZoom(big, 800, 600))
  })
})

describe('approach', () => {
  it('gets closer to the goal without passing it, then lands on it', () => {
    let value = 0
    for (let i = 0; i < 400; i++) {
      const next = approach(value, 1, 1 / 60)
      expect(next).toBeGreaterThanOrEqual(value)
      expect(next).toBeLessThanOrEqual(1)
      value = next
    }
    expect(value).toBe(1)
  })

  it('goes down as well', () => {
    expect(approach(1, 0, 0.1)).toBeLessThan(1)
  })
})
