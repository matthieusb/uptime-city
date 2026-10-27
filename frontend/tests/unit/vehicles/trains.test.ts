import { describe, expect, it } from 'vitest'
import { trackPoint, type Track } from '../../../src/city/tracks'
import {
  activeTrains,
  carriagePoint,
  carriageState,
  consist,
  isTgv,
  TGV_FACTOR,
  TRAIN_FACTOR,
  duration,
  FADE,
  trainOf,
  trainPeriod,
} from '../../../src/city/trains'
import { plateAt, SPEED as CAR_SPEED } from '../../../src/city/traffic'
import { worldLayout } from '../../../src/city/world'

const track: Track = {
  vertical: false,
  at: -50,
  from: -60,
  to: 60,
  crossings: [],
}
const L = track.to - track.from

// How many trains come in during `seconds`.
const departures = (density: number, seconds: number) => {
  const seen = new Set<number>()
  for (let t = 0; t < seconds; t += 0.5) {
    for (const train of activeTrains(t, density, L)) seen.add(train.id)
  }
  return seen.size
}

describe('how often a train passes', () => {
  it('is about every 60 seconds at density 1 and 30 at density 2', () => {
    expect(trainPeriod(1)).toBe(60)
    expect(trainPeriod(2)).toBe(30)
    expect(trainPeriod(0.5)).toBe(120)
    expect(departures(1, 600)).toBeGreaterThanOrEqual(9)
    expect(departures(1, 600)).toBeLessThanOrEqual(11)
    expect(departures(2, 600)).toBeGreaterThanOrEqual(19)
    expect(departures(2, 600)).toBeLessThanOrEqual(21)
  })

  it('is never at density 0', () => {
    expect(trainPeriod(0)).toBe(Infinity)
    for (let t = 0; t < 600; t += 5) {
      expect(activeTrains(t, 0, L)).toEqual([])
    }
  })

  it('brings the first train a little after the start', () => {
    expect(activeTrains(0, 1, L)).toEqual([])
    expect(activeTrains(10, 1, L).length).toBe(1)
  })
})

describe('what a train is made of', () => {
  const trains = Array.from({ length: 30 }, (_, id) => consist(id))

  it('has a locomotive first and several carriages behind it', () => {
    for (const cars of trains) {
      expect(['locomotive', 'tgvHead']).toContain(cars[0].kind)
      expect(cars.slice(1).every((c) => c.kind !== 'locomotive')).toBe(true)
      expect(cars.length).toBeGreaterThanOrEqual(7)
    }
  })

  it('is tens of tiles long', () => {
    for (let id = 0; id < 30; id++) {
      expect(trainOf(id, 1).length).toBeGreaterThanOrEqual(20)
      expect(trainOf(id, 1).length).toBeLessThanOrEqual(60)
    }
  })

  it('has passenger and freight, in different colors and kinds', () => {
    const kinds = new Set(trains.flat().map((c) => c.kind))
    expect(kinds.has('coach')).toBe(true)
    for (const freight of ['boxcar', 'tank', 'hopper', 'flatcar'] as const) {
      expect(kinds.has(freight)).toBe(true)
    }
    expect(new Set(trains.flat().map((c) => c.body)).size).toBeGreaterThan(6)
    // Some trains carry people, some goods, some both.
    const coaches = trains.map((cars) => cars.filter((c) => c.kind === 'coach'))
    expect(coaches.some((c) => c.length === 0)).toBe(true)
    expect(
      trains.some(
        (cars) =>
          cars.some((c) => c.kind === 'coach') &&
          cars.some((c) => c.kind === 'boxcar' || c.kind === 'tank'),
      ),
    ).toBe(true)
    expect(coaches.some((c) => c.length > 5)).toBe(true)
  })

  it('is always the same train for the same number', () => {
    expect(consist(7)).toEqual(consist(7))
  })
})

describe('the TGV', () => {
  const ids = Array.from({ length: 400 }, (_, id) => id)
  const tgvs = ids.filter(isTgv)

  it('is about one train in four, picked from its number', () => {
    expect(tgvs.length / ids.length).toBeGreaterThan(0.18)
    expect(tgvs.length / ids.length).toBeLessThan(0.32)
    expect(ids.filter(isTgv)).toEqual(tgvs)
    expect(trainOf(tgvs[0], 1).tgv).toBe(true)
    expect(
      trainOf(
        ids.find((id) => !isTgv(id))!,
        1,
      ).tgv,
    ).toBe(false)
  })

  it('has a pointed power car at each end and 6 to 8 coaches between', () => {
    for (const id of tgvs) {
      const cars = consist(id)
      const coaches = cars.slice(1, -1)
      expect(cars[0].kind).toBe('tgvHead')
      expect(cars[0].reversed).toBeUndefined()
      expect(cars[cars.length - 1].kind).toBe('tgvHead')
      expect(cars[cars.length - 1].reversed).toBe(true)
      expect(coaches.length).toBeGreaterThanOrEqual(6)
      expect(coaches.length).toBeLessThanOrEqual(8)
      expect(coaches.every((c) => c.kind === 'tgvCoach')).toBe(true)
      // One livery for the whole train.
      expect(new Set(cars.map((c) => c.body)).size).toBe(1)
      expect(new Set(cars.map((c) => c.accent)).size).toBe(1)
      const { length } = trainOf(id, 1)
      expect(length).toBeGreaterThanOrEqual(20)
      expect(length).toBeLessThanOrEqual(60)
    }
    // Different from the others.
    const others = ids.filter((id) => !isTgv(id)).flatMap(consist)
    expect(others.some((c) => c.kind.startsWith('tgv'))).toBe(false)
  })

  it('runs 5 times as fast as the cars and the others 2 times, at a constant speed', () => {
    expect(TRAIN_FACTOR).toBe(2)
    expect(TGV_FACTOR).toBe(5)
    for (const id of ids) {
      const train = trainOf(id, 1)
      const factor = train.tgv ? TGV_FACTOR : TRAIN_FACTOR
      expect(train.speed).toBeGreaterThanOrEqual(factor * CAR_SPEED[0] - 1e-9)
      expect(train.speed).toBeLessThanOrEqual(factor * CAR_SPEED[1] + 1e-9)
      // The same all along.
      expect(trainOf(id, 2, 300).speed).toBe(train.speed)
    }
    const mean = (fast: boolean) => {
      const list = ids.filter((id) => isTgv(id) === fast)
      return (
        list.reduce((sum, id) => sum + trainOf(id, 1).speed, 0) / list.length
      )
    }
    expect(mean(true) / mean(false)).toBeGreaterThan(2.2)
    expect(mean(true) / mean(false)).toBeLessThan(2.8)
  })

  it('keeps its carriages together, articulated, and fades at the edges', () => {
    const train = trainOf(tgvs[0], 1)
    const t = train.departs + 8
    for (let j = 1; j < train.carriages.length; j++) {
      const [front, back] = [j - 1, j].map(
        (k) => carriageState(train, k, t, L).u,
      )
      const gap =
        (train.carriages[j - 1].length + train.carriages[j].length) / 2 +
        train.coupling
      expect(front - back).toBeCloseTo(gap)
    }
    expect(train.coupling).toBeLessThan(0.1)
    const at = (u: number) =>
      carriageState(
        train,
        1,
        train.departs + (u + train.behind[1]) / train.speed,
        L,
      )
    expect(at(FADE / 2).opacity).toBeCloseTo(0.5)
    expect(at(L / 2).opacity).toBe(1)
  })

  it('leaves at the usual times, so the frequency is unchanged', () => {
    for (const id of tgvs.slice(0, 20)) {
      expect(trainOf(id, 1, L).departs).toBeCloseTo((id + 0.1) * 60)
      expect(trainOf(id, 2, L).departs).toBeCloseTo((id + 0.1) * 30)
    }
  })
})

describe('a train on the railway', () => {
  const train = trainOf(0, 1)

  it('comes in at one edge and goes out at the other, then the next goes back', () => {
    const next = trainOf(1, 1)
    expect(train.dir).toBe(1)
    expect(next.dir).toBe(-1)
    expect(carriagePoint(track, train, 0).x).toBeCloseTo(track.from)
    expect(carriagePoint(track, train, L).x).toBeCloseTo(track.to)
    expect(carriagePoint(track, next, 0).x).toBeCloseTo(track.to)
    expect(carriagePoint(track, next, L).x).toBeCloseTo(track.from)
    expect(carriagePoint(track, train, 5).heading).toBeCloseTo(0)
    expect(carriagePoint(track, next, 5).heading).toBeCloseTo(Math.PI)
  })

  it('is on the railway from the head coming in to the tail going out', () => {
    const last = train.carriages.length - 1
    // Before it departs, nobody is on the railway.
    for (let j = 0; j <= last; j++) {
      expect(carriageState(train, j, train.departs - 1, L).active).toBe(false)
    }
    // The locomotive comes in first and goes out first.
    const t0 = train.departs + 2 / train.speed + train.behind[0] / train.speed
    expect(carriageState(train, 0, t0, L).active).toBe(true)
    expect(carriageState(train, last, t0, L).active).toBe(false)
    const end = train.departs + duration(train, L)
    expect(carriageState(train, last, end + 1, L).active).toBe(false)
    expect(carriageState(train, 0, end + 1, L).active).toBe(false)
    expect(activeTrains(end + 1, 1, L).map((t) => t.id)).not.toContain(0)
    expect(activeTrains(train.departs + 1, 1, L).map((t) => t.id)).toContain(0)
  })

  it('keeps its carriages coupled in order', () => {
    const t = train.departs + 12
    for (let j = 1; j < train.carriages.length; j++) {
      const [front, back] = [j - 1, j].map(
        (k) => carriageState(train, k, t, L).u,
      )
      const gap =
        (train.carriages[j - 1].length + train.carriages[j].length) / 2 +
        train.coupling
      expect(front - back).toBeCloseTo(gap)
    }
  })

  it('moves smoothly', () => {
    let before = carriagePoint(track, train, 0)
    for (let u = 0.25; u <= L; u += 0.25) {
      const here = carriagePoint(track, train, u)
      expect(Math.hypot(here.x - before.x, here.z - before.z)).toBeCloseTo(0.25)
      before = here
    }
    for (let j = 0; j < train.carriages.length; j++) {
      let u = carriageState(train, j, train.departs + 5, L).u
      for (let dt = 0.1; dt < 20; dt += 0.1) {
        const next = carriageState(train, j, train.departs + 5 + dt, L).u
        expect(next - u).toBeCloseTo(0.1 * train.speed)
        u = next
      }
    }
  })

  it('fades in and out near the edges', () => {
    const j = 1
    const at = (u: number) => {
      const t = train.departs + (u + train.behind[j]) / train.speed
      return carriageState(train, j, t, L)
    }
    expect(at(FADE / 2).opacity).toBeCloseTo(0.5)
    expect(at(L / 2).opacity).toBe(1)
    expect(at(L - FADE / 2).opacity).toBeCloseTo(0.5)
    expect(at(-1).active).toBe(false)
  })

  it('never meets the train coming the other way, nor another on its track', () => {
    // Short and long railways, TGV and slow trains alike, even a TGV that follows a slow train.
    const cases = [60, 120, 270, 500, 900].flatMap((length) =>
      [0.5, 1, 2].map((density) => ({ length, density })),
    )
    for (const { length, density } of cases) {
      for (let t = 0; t < 1500; t += 1.5) {
        const trains = activeTrains(t, density, length)
        for (const a of trains) {
          for (const b of trains) {
            if (a.id >= b.id) continue
            // Not on the same track.
            if (a.dir !== b.dir) {
              const [pa, pb] = [a, b].map((x) => carriagePoint(track, x, 10))
              expect(Math.abs(pa.z - pb.z)).toBeGreaterThan(1)
            } else {
              // The same way: the head of the later one is behind the tail of the first.
              const [ua, ub] = [a, b].map((x) => x.speed * (t - x.departs))
              expect(ua - a.length).toBeGreaterThan(ub)
              // Not on the other's tail at the far edge either.
              expect(a.departs + (length + a.length) / a.speed).toBeLessThan(
                b.departs + length / b.speed + 1e-6,
              )
            }
          }
        }
      }
    }
  })
})

describe('trains on the map', () => {
  const specs = Array.from({ length: 12 }, (_, i) => ({
    id: `host-${i}`,
    buildings: [{ id: `host-${i}`, services: 2 }],
  }))
  const world = worldLayout(specs)
  const plots = [...world.neighbourhoods, ...world.wilds].map(
    (neighbourhood) => ({
      id: neighbourhood.id,
      x: neighbourhood.x,
      z: neighbourhood.z,
      halfWidth: neighbourhood.layout.halfWidth,
      halfDepth: neighbourhood.layout.halfDepth,
    }),
  )

  it('spans several plates and is on a plate all along the railway', () => {
    const real = world.track!
    const length = real.to - real.from
    const seen = new Set<number>()
    for (const dir of [1, -1] as const) {
      for (let u = 0.5; u < length; u += 0.5) {
        const p = trackPoint(real, dir, u)
        const index = plateAt(plots, p.x, p.z)
        expect(index).toBeGreaterThanOrEqual(0)
        seen.add(index)
      }
    }
    expect(seen.size).toBeGreaterThan(1)
    // A train is longer than the plates it crosses are wide, at least for the smallest.
    expect(trainOf(0, 1).length).toBeGreaterThan(20)
  })
})
