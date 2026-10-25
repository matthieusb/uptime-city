import { describe, expect, it } from 'vitest'
import {
  RUNWAY_Z,
  STAND_Z,
  airportLayout,
  standCount,
} from '../../../src/city/airport'
import {
  BASE_PLANES,
  CRAFT,
  CYCLE_SLOTS,
  LIVERIES,
  MAX_PLANES,
  OUT,
  PLANE_KINDS,
  cruiseHeight,
  cycleOf,
  flightKind,
  flightTimes,
  kindsOf,
  planeCount,
  planeLocal,
  planeState,
  slotOf,
  type AirportSpec,
  type PlaneKind,
} from '../../../src/city/flights'

const spec = (
  length: number,
  reach = { pos: 60, neg: 90 },
  turn = 0,
): AirportSpec => ({
  layout: airportLayout(length),
  x: 0,
  z: 0,
  y: 0.09,
  turn,
  reach,
  cruise: CRUISE,
})

// How high the top of the clouds is over the tallest building: 2 for their underside, 2 for their
// height at most, and 2.5 for their three layers of cubes.
const CLOUD_THICKNESS = 6.5
// Above the clouds of a map of tallest building 6 (see `cruiseHeight`).
const CRUISE = cruiseHeight(6)
const LENGTHS = [14, 24, 30, 40]
const STEP = 0.1

// Plane `i` at each step of `cycles` cycles, in the frame of the airport.
function* samples(s: AirportSpec, cycles = 2) {
  const end = cycles * cycleOf(s)
  for (let t = 0; t < end; t += STEP) {
    for (let i = 0; i < MAX_PLANES; i++) {
      yield { t, i, p: planeLocal(s, i, t) }
    }
  }
}

describe('planeCount', () => {
  it('has no plane at density 0 and at least one otherwise', () => {
    expect(planeCount(0)).toBe(0)
    expect(planeCount(0.1)).toBe(1)
  })

  it('has more planes the higher the density, up to twice as many', () => {
    expect(planeCount(1)).toBe(BASE_PLANES)
    expect(planeCount(2)).toBe(2 * BASE_PLANES)
    expect(planeCount(1.5)).toBeGreaterThan(planeCount(1))
    expect(planeCount(0.5)).toBeLessThan(planeCount(1))
    expect(planeCount(5)).toBe(MAX_PLANES)
  })
})

describe('the schedule', () => {
  it('never has two planes on the runway at once', () => {
    for (const length of LENGTHS) {
      const s = spec(length)
      const half = length / 2
      let busy = 0
      for (let t = 0; t < 4 * cycleOf(s); t += STEP) {
        const on = Array.from({ length: MAX_PLANES }, (_, i) =>
          planeLocal(s, i, t),
        ).filter(
          (p) =>
            p &&
            p.y < 1 &&
            Math.abs(p.x) <= half &&
            Math.abs(p.z - RUNWAY_Z) < 1.45,
        )
        if (on.length > 0) busy++
        expect(on.length, `length ${length}, t=${t}`).toBeLessThanOrEqual(1)
      }
      expect(busy).toBeGreaterThan(0)
    }
  })

  it('has planes both landing and taking off, in both directions', () => {
    const s = spec(24)
    const landing = new Set<number>()
    const takeoff = new Set<number>()
    for (let c = 0; c < 6; c++) {
      for (let i = 0; i < MAX_PLANES; i++) {
        const f = flightTimes(s, i, c)
        landing.add(f.landing)
        takeoff.add(f.takeoff)
      }
    }
    expect([...landing].sort()).toEqual([-1, 1])
    expect([...takeoff].sort()).toEqual([-1, 1])
  })

  it('keeps every plane of a cycle parked long enough, and gone before its next cycle', () => {
    for (const length of LENGTHS) {
      const s = spec(length)
      for (let i = 0; i < MAX_PLANES; i++) {
        for (let c = 0; c < 3; c++) {
          const f = flightTimes(s, i, c)
          expect(f.turnStart).toBeGreaterThanOrEqual(f.arrivedAt)
          expect(f.end).toBeLessThan(flightTimes(s, i, c + 1).start)
        }
      }
    }
  })

  it('never lets two planes meet on the ground, whatever their size', () => {
    for (const length of LENGTHS) {
      const s = spec(length)
      const radius = (k: PlaneKind) =>
        Math.max(CRAFT[k].length, CRAFT[k].span) / 2
      for (let t = 0; t < 4 * cycleOf(s); t += STEP) {
        const ground = Array.from({ length: MAX_PLANES }, (_, i) =>
          planeLocal(s, i, t),
        ).filter((p) => p && p.y < 0.2)
        for (const a of ground) {
          for (const b of ground) {
            if (a === b) continue
            expect(
              Math.hypot(a!.x - b!.x, a!.z - b!.z),
              `length ${length}, t=${t}`,
            ).toBeGreaterThan(0.85 * (radius(a!.kind) + radius(b!.kind)))
          }
        }
      }
    }
  })

  it('parks the planes on distinct stands', () => {
    const s = spec(30)
    for (let t = 0; t < 2 * cycleOf(s); t += 1) {
      const parked = Array.from({ length: MAX_PLANES }, (_, i) =>
        planeLocal(s, i, t),
      ).filter((p) => p && p.y === 0 && Math.abs(p.z - STAND_Z) < 0.01)
      const xs = parked.map((p) => Math.round(p!.x))
      expect(new Set(xs).size).toBe(xs.length)
    }
  })

  it('has a slot long enough for a use of the runway', () => {
    for (const length of LENGTHS) {
      expect(slotOf(spec(length))).toBeGreaterThanOrEqual(16)
    }
    expect(slotOf(spec(40))).toBeGreaterThan(slotOf(spec(14)))
    expect(cycleOf(spec(14))).toBe(CYCLE_SLOTS * slotOf(spec(14)))
  })
})

describe('planes', () => {
  it('appear outside an edge of the map and disappear beyond an edge', () => {
    const reach = { pos: 60, neg: 90 }
    for (const length of LENGTHS) {
      const s = spec(length, reach)
      let appeared = 0
      let gone = 0
      for (let i = 0; i < MAX_PLANES; i++) {
        let before = planeLocal(s, i, 0)
        for (let t = STEP; t < 2 * cycleOf(s); t += STEP) {
          const now = planeLocal(s, i, t)
          if (!before && now) {
            appeared++
            expect(now.x > reach.pos || now.x < -reach.neg).toBe(true)
          }
          if (before && !now) {
            gone++
            expect(
              before.x > reach.pos + OUT / 2 || before.x < -reach.neg - OUT / 2,
            ).toBe(true)
          }
          before = now
        }
      }
      expect(appeared).toBeGreaterThan(MAX_PLANES)
      expect(gone).toBeGreaterThan(MAX_PLANES)
    }
  })

  it('come in from and leave by both edges along the runway', () => {
    const s = spec(24)
    const entered = new Set<string>()
    const left = new Set<string>()
    for (const { i, t, p } of samples(s, 6)) {
      const before = planeLocal(s, i, t - STEP)
      if (!before && p) entered.add(p.x > 0 ? 'pos' : 'neg')
      if (before && !p) left.add(before.x > 0 ? 'pos' : 'neg')
    }
    expect([...entered].sort()).toEqual(['neg', 'pos'])
    expect([...left].sort()).toEqual(['neg', 'pos'])
  })

  it('move continuously: no jump of place, heading or pitch', () => {
    for (const length of LENGTHS) {
      const s = spec(length)
      for (let i = 0; i < MAX_PLANES; i++) {
        let before = planeLocal(s, i, 0)
        for (let t = STEP; t < 2 * cycleOf(s); t += STEP) {
          const now = planeLocal(s, i, t)
          if (before && now) {
            // At most about 8 tiles per second.
            expect(
              Math.hypot(now.x - before.x, now.z - before.z, now.y - before.y),
              `length ${length} plane ${i} t=${t}`,
            ).toBeLessThan(1.3)
            let turn = now.heading - before.heading
            turn -= 2 * Math.PI * Math.round(turn / (2 * Math.PI))
            expect(Math.abs(turn), `heading ${length} ${i} ${t}`).toBeLessThan(
              0.65,
            )
            expect(Math.abs(now.pitch - before.pitch)).toBeLessThan(0.1)
          }
          before = now
        }
      }
    }
  })

  it('land on and take off from the runway, level on the ground', () => {
    const s = spec(24)
    let onRunway = 0
    for (const { p } of samples(s)) {
      if (!p) continue
      if (p.y === 0) expect(p.pitch).toBe(0)
      if (p.y === 0 && Math.abs(p.z - RUNWAY_Z) < 0.05) onRunway++
      // Never underground, never above the cruise height of the biggest plane.
      expect(p.y).toBeGreaterThanOrEqual(0)
      expect(p.y).toBeLessThan(CRUISE + CRAFT.jumbo.climb.cap + 0.01)
    }
    expect(onRunway).toBeGreaterThan(0)
  })

  it('climb above the clouds before they leave, and come down from above them', () => {
    const clouds = 6 + CLOUD_THICKNESS
    for (const length of LENGTHS) {
      const s = spec(length, { pos: 120, neg: 120 })
      let highest = 0
      let arrivedHigh = 0
      for (const { t, i, p } of samples(s, 2)) {
        if (!p) continue
        highest = Math.max(highest, p.y)
        const before = planeLocal(s, i, t - STEP)
        if (!before && p.y > clouds) arrivedHigh++
      }
      expect(highest, `length ${length}`).toBeGreaterThan(clouds + 1)
      expect(arrivedHigh).toBeGreaterThan(0)
    }
  })

  it('are put on their plate, turned and moved with the airport', () => {
    const plain = spec(24)
    const placed: AirportSpec = { ...plain, x: 10, z: -4, turn: 1 }
    for (let t = 0; t < 400; t += 7) {
      const a = planeLocal(plain, 0, t)
      const b = planeState(placed, 0, t)
      expect(b.active).toBe(a !== null)
      if (!a) continue
      // A quarter turn sends the runway axis (+X) to +Z.
      expect(b.x).toBeCloseTo(10 - a.z)
      expect(b.z).toBeCloseTo(-4 + a.x)
      expect(b.y).toBeCloseTo(0.09 + a.y)
      expect(b.livery).toBeLessThan(LIVERIES)
    }
  })

  it('are all inactive when out of their cycle', () => {
    const s = spec(24)
    const idle = planeState(s, 0, -1e6)
    expect(idle.active).toBe(false)
  })
})

describe('the cruise height', () => {
  it('is just above the clouds, and higher over a taller city', () => {
    expect(cruiseHeight(6)).toBeGreaterThan(6 + CLOUD_THICKNESS)
    expect(cruiseHeight(6)).toBeLessThan(6 + CLOUD_THICKNESS + 4)
    expect(cruiseHeight(30)).toBeGreaterThan(cruiseHeight(6))
  })
})

describe('the kinds of plane', () => {
  const flights = (length: number, cycles = 400) => {
    const layout = airportLayout(length)
    const counts: Record<PlaneKind, number> = { tourism: 0, cargo: 0, jumbo: 0 }
    for (let c = 0; c < cycles; c++) {
      for (let i = 0; i < MAX_PLANES; i++) counts[flightKind(layout, i, c)]++
    }
    return counts
  }

  it('is picked by hash: the same for a flight every time', () => {
    const layout = airportLayout(40)
    for (let c = 0; c < 20; c++) {
      for (let i = 0; i < MAX_PLANES; i++) {
        expect(flightKind(layout, i, c)).toBe(flightKind(layout, i, c))
        expect(flightKind(airportLayout(40), i, c)).toBe(
          flightKind(layout, i, c),
        )
      }
    }
    const kinds = new Set<PlaneKind>()
    for (let c = 0; c < 20; c++) kinds.add(flightKind(layout, 0, c))
    expect(kinds.size).toBeGreaterThan(1)
  })

  it('needs a runway of 4 tiles for the cargo plane and 6 for the jumbo, so every airport has all three', () => {
    expect(CRAFT.tourism.minRunway).toBe(0)
    expect(CRAFT.cargo.minRunway).toBe(4)
    expect(CRAFT.jumbo.minRunway).toBe(6)
    for (const length of LENGTHS) {
      expect(kindsOf(airportLayout(length))).toEqual(PLANE_KINDS)
    }
    expect(flights(14).tourism).toBeGreaterThan(0)
    expect(flights(14).cargo).toBeGreaterThan(0)
    expect(flights(14).jumbo).toBeGreaterThan(0)
  })

  it('is about half tourism, a third cargo and the rest jumbo on an airport', () => {
    const counts = flights(40)
    const total = counts.tourism + counts.cargo + counts.jumbo
    expect(counts.tourism / total).toBeGreaterThan(0.45)
    expect(counts.tourism / total).toBeLessThan(0.55)
    expect(counts.cargo / total).toBeGreaterThan(0.28)
    expect(counts.cargo / total).toBeLessThan(0.38)
    expect(counts.jumbo / total).toBeGreaterThan(0.12)
    expect(counts.jumbo / total).toBeLessThan(0.22)
  })

  it('sizes the planes in order: tourism, then cargo, then jumbo', () => {
    expect(CRAFT.tourism.length).toBeLessThan(CRAFT.cargo.length)
    expect(CRAFT.cargo.length).toBeLessThan(CRAFT.jumbo.length)
    expect(CRAFT.tourism.span).toBeLessThan(CRAFT.cargo.span)
    expect(CRAFT.cargo.span).toBeLessThan(CRAFT.jumbo.span)
  })

  it('makes the bigger planes faster, with a longer roll and a gentler climb', () => {
    const [a, b, c] = PLANE_KINDS.map((k) => CRAFT[k])
    for (const [small, big] of [
      [a, b],
      [b, c],
    ]) {
      expect(big.vFly).toBeGreaterThan(small.vFly)
      expect(big.vTaxi).toBeGreaterThan(small.vTaxi)
      expect(big.rollShare).toBeGreaterThan(small.rollShare)
      expect(big.climb.slope).toBeLessThan(small.climb.slope)
      expect(big.descent.slope).toBeLessThan(small.descent.slope)
    }
  })

  it('fits the stands, the taxiway and the airport', () => {
    for (const k of PLANE_KINDS) {
      // Stands are 5 apart, and the taxiway is 4.3 from the nose of a parked plane.
      expect(CRAFT[k].span).toBeLessThan(5)
      expect(CRAFT[k].length).toBeLessThan(4.3)
    }
    for (const length of LENGTHS) {
      const s = spec(length)
      const half = s.layout.width / 2
      for (let t = 0; t < 4 * cycleOf(s); t += STEP * 3) {
        for (let i = 0; i < MAX_PLANES; i++) {
          const p = planeLocal(s, i, t)
          if (!p || p.y > 0.2) continue
          // On the ground, within the airport, wings and all.
          const r = Math.max(CRAFT[p.kind].length, CRAFT[p.kind].span) / 2
          expect(Math.abs(p.x) + r).toBeLessThanOrEqual(half + 0.5)
          expect(p.z - r).toBeGreaterThan(-7.5)
          expect(p.z + r).toBeLessThan(7.5 + 0.5)
        }
      }
    }
  })

  it('has every kind fly, and each leave and enter beyond an edge', () => {
    const s = spec(40, { pos: 60, neg: 90 })
    const seen = new Set<PlaneKind>()
    for (let i = 0; i < MAX_PLANES; i++) {
      let before = planeLocal(s, i, 0)
      for (let t = STEP; t < 6 * cycleOf(s); t += STEP) {
        const now = planeLocal(s, i, t)
        if (now) seen.add(now.kind)
        if (!before && now) expect(now.x > 60 || now.x < -90).toBe(true)
        if (before && !now) {
          expect(before.x > 60 + OUT / 2 || before.x < -90 - OUT / 2).toBe(true)
        }
        before = now
      }
    }
    expect([...seen].sort()).toEqual([...PLANE_KINDS].sort())
  })

  it('has as many stands as the airport says', () => {
    expect(airportLayout(40).standX).toHaveLength(standCount(40))
  })
})
