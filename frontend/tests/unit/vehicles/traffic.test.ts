import { describe, expect, it } from 'vitest'
import {
  FADE,
  LANE,
  ROUNDABOUT,
  carState,
  lanePoint,
  lanesOf,
  laneLength,
  plateAt,
  vehicleKind,
} from '../../../src/city/traffic'
import { worldLayout } from '../../../src/city/world'

const across: { vertical: boolean; at: number; from: number; to: number } = {
  vertical: false,
  at: 10,
  from: -50,
  to: 50,
}
const link = { vertical: true, at: 0, from: 10, to: 40 }
const roundabouts = [{ x: 0, z: 10 }]

describe('lanesOf', () => {
  it('gives each road a lane in each direction', () => {
    const lanes = lanesOf([across], [])
    expect(lanes.map((l) => l.dir).sort()).toEqual([-1, 1])
    const forward = lanes.find((l) => l.dir === 1)!
    const back = lanes.find((l) => l.dir === -1)!
    expect([forward.start, forward.end]).toEqual([-50, 50])
    expect([back.start, back.end]).toEqual([50, -50])
  })

  it('stops a lane at the ring of a roundabout where its road ends on it', () => {
    const [lane] = lanesOf([link], roundabouts).filter((l) => l.dir === 1)
    expect(lane.start).toBe(10 + ROUNDABOUT)
    expect(lane.end).toBe(40)
  })

  it('leaves out roads too short to carry anybody', () => {
    expect(lanesOf([{ ...across, from: 0, to: 3 }], [])).toEqual([])
  })

  it('keeps to the same hand on both axes', () => {
    // Seen from above, a car going along +X keeps to the +Z side, so one going along +Z keeps to -X.
    const along = (way: typeof across, dir: number) =>
      lanePoint(
        lanesOf([way], []).find((l) => l.dir === dir)!,
        5,
        [],
      )
    expect(along(across, 1).z).toBeGreaterThan(across.at)
    expect(along(across, -1).z).toBeLessThan(across.at)
    expect(along(link, 1).x).toBeLessThan(link.at)
    expect(along(link, -1).x).toBeGreaterThan(link.at)
  })
})

describe('vehicles', () => {
  const lane = lanesOf([{ ...across, from: -500, to: 500 }], [])[0]

  it('are mostly cars, with some trucks and motorcycles too', () => {
    const kinds = Array.from({ length: 400 }, (_, k) => vehicleKind(lane, k))
    const share = (kind: string) => kinds.filter((v) => v === kind).length / 400
    expect(share('car')).toBeGreaterThan(share('truck'))
    expect(share('truck')).toBeGreaterThan(0.1)
    expect(share('motorcycle')).toBeGreaterThan(0.1)
  })

  it('keep their kind from one frame to the next', () => {
    expect(vehicleKind(lane, 3)).toBe(vehicleKind(lane, 3))
  })
})

describe('density', () => {
  const count = (density: number) =>
    lanesOf([across], [], density).reduce((sum, l) => sum + l.count, 0)

  it('has no vehicle at 0, more of them as it grows, and the same lanes', () => {
    expect(lanesOf([across], [], 0)).toEqual([])
    expect(count(0.5)).toBeLessThan(count(1))
    expect(count(2)).toBeGreaterThan(count(1))
    expect(lanesOf([across], [], 2).map((l) => l.id)).toEqual(
      lanesOf([across], [], 1).map((l) => l.id),
    )
  })

  it('still puts a vehicle on each lane when it is thin', () => {
    expect(lanesOf([across], [], 0.25).every((l) => l.count >= 1)).toBe(true)
  })
})

describe('carState', () => {
  const lane = lanesOf([across], [])[0]

  it('fades a car in where it appears and out where it disappears', () => {
    const length = laneLength(lane)
    const at = (s: number) => {
      // Time at which car 0 has driven s tiles.
      const t = (s - lane.shift * lane.gap) / lane.speed
      return carState(lane, 0, t + (lane.gap * lane.count) / lane.speed)
    }
    expect(at(0).opacity).toBeCloseTo(0)
    expect(at(FADE / 2).opacity).toBeCloseTo(0.5)
    expect(at(length / 2).opacity).toBe(1)
    expect(at(length - FADE / 2).opacity).toBeCloseTo(0.5)
  })

  it('sends a car away and brings the next one later, again and again', () => {
    const loop = (lane.gap * lane.count) / lane.speed
    const seen = Array.from(
      { length: 4 * 60 },
      (_, i) => carState(lane, 0, (i / 60) * loop).active,
    )
    // On the road, off it, and on it again.
    expect(seen).toContain(true)
    expect(seen).toContain(false)
    const first = seen.indexOf(false)
    expect(seen.indexOf(true, first)).toBeGreaterThan(first)
  })

  it('spaces the cars of a lane evenly, without two of them at the same place', () => {
    const positions = Array.from(
      { length: lane.count },
      (_, k) => carState(lane, k, 3).s,
    ).sort((a, b) => a - b)
    for (let i = 1; i < positions.length; i++) {
      expect(positions[i] - positions[i - 1]).toBeGreaterThan(5)
    }
  })
})

describe('lanePoint', () => {
  const lanes = lanesOf([across, link], roundabouts)

  it('goes around the island of a roundabout, never over it', () => {
    for (const lane of lanes) {
      for (let s = 0; s <= laneLength(lane); s += 0.1) {
        const p = lanePoint(lane, s, roundabouts)
        const distance = Math.max(
          Math.abs(p.x - roundabouts[0].x),
          Math.abs(p.z - roundabouts[0].z),
        )
        expect(distance).toBeGreaterThan(1)
      }
    }
  })

  it('moves smoothly, turning only a little between two close points', () => {
    const lane = lanes.find((l) => !l.vertical && l.dir === 1)!
    let last = lanePoint(lane, 0, roundabouts)
    for (let s = 0.1; s <= laneLength(lane); s += 0.1) {
      const p = lanePoint(lane, s, roundabouts)
      expect(Math.hypot(p.x - last.x, p.z - last.z)).toBeLessThan(0.2)
      expect(Math.abs(p.heading - last.heading)).toBeLessThan(0.35)
      last = p
    }
  })

  it('runs along its road away from the roundabouts', () => {
    const lane = lanes.find((l) => !l.vertical && l.dir === -1)!
    const p = lanePoint(lane, 5, roundabouts)
    expect(p.z).toBeCloseTo(across.at - LANE)
    expect(Math.abs(Math.abs(p.heading) - Math.PI)).toBeLessThan(1e-6)
  })

  it('drives on the roads of a real map, from one edge to the other', () => {
    const world = worldLayout(
      Array.from({ length: 12 }, (_, i) => ({
        id: `host-${i}`,
        buildings: [{ id: `host-${i}`, services: 2 }],
      })),
    )
    const real = lanesOf(world.ways, world.roundabouts)
    expect(real.length).toBeGreaterThan(0)
    const longest = real.reduce((a, b) =>
      laneLength(a) > laneLength(b) ? a : b,
    )
    // Crosses more than one plate.
    const plots = [...world.neighbourhoods, ...world.wilds].map((n) => ({
      id: n.id,
      x: n.x,
      z: n.z,
      halfWidth: n.layout.halfWidth,
      halfDepth: n.layout.halfDepth,
    }))
    const crossed = new Set<number>()
    for (let s = 0; s <= laneLength(longest); s += 1) {
      const p = lanePoint(longest, s, world.roundabouts)
      const i = plateAt(plots, p.x, p.z)
      expect(i).toBeGreaterThanOrEqual(0)
      crossed.add(i)
    }
    expect(crossed.size).toBeGreaterThan(1)
  })
})

describe('plateAt', () => {
  const plots = [
    { id: 'a', x: 0, z: 0, halfWidth: 5, halfDepth: 5 },
    { id: 'b', x: 10, z: 0, halfWidth: 5, halfDepth: 5 },
  ]
  it('finds the plate under a point, trying the hint first', () => {
    expect(plateAt(plots, 8, 1)).toBe(1)
    expect(plateAt(plots, 2, 1, 0)).toBe(0)
    expect(plateAt(plots, 40, 0)).toBe(-1)
  })
})
