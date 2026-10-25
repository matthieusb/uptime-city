import { describe, expect, it } from 'vitest'
import {
  approachOf,
  DRIVE_DISTANCE,
  roadParking,
  truckScale,
  LADDER_PIVOT,
  ladderReach,
  MAX_TRUCKS,
  fireTrucks,
  initialTruck,
  parking,
  stepTruck,
  truckOffset,
  truckSprays,
  waterPoint,
} from '../../src/city/effects/fireTruckShape'
import { RUBBLE_HEIGHT, COLLAPSE_S, PRELUDE_S } from '../../src/city/collapse'
import { floorBase, floorHeight } from '../../src/city/layout'

const burning = (...floors: number[]) =>
  Array.from({ length: 5 }, (_, i) => floors.includes(i))

describe('fireTrucks', () => {
  it('sends none to a building that burns nowhere', () => {
    expect(fireTrucks('a', burning(), false)).toEqual(
      Array.from({ length: MAX_TRUCKS }, () => null),
    )
  })

  it('sends none to a standing building, whatever burns in it', () => {
    for (let n = 0; n < 100; n++) {
      expect(fireTrucks(`lot-${n}`, burning(1, 2, 3, 4), false)).toEqual(
        Array.from({ length: MAX_TRUCKS }, () => null),
      )
    }
  })

  it('does not always send one to a fallen building: it is a medium chance', () => {
    const sent = Array.from(
      { length: 200 },
      (_, n) => fireTrucks(`lot-${n}`, burning(), true).filter(Boolean).length,
    )
    const ratio = sent.reduce((a, b) => a + b, 0) / (sent.length * MAX_TRUCKS)
    expect(ratio).toBeGreaterThan(0.3)
    expect(ratio).toBeLessThan(0.7)
  })

  it('has one slot per truck at most', () => {
    expect(fireTrucks('a', burning(), true)).toHaveLength(MAX_TRUCKS)
  })

  it('is the same every time for the same building and fire', () => {
    expect(fireTrucks('a', burning(), true)).toEqual(
      fireTrucks('a', burning(), true),
    )
  })

  it('can send several to a fallen building', () => {
    const counts = new Set(
      Array.from(
        { length: 100 },
        (_, n) =>
          fireTrucks(`lot-${n}`, burning(), true).filter(Boolean).length,
      ),
    )
    expect(Math.max(...counts)).toBeGreaterThan(1)
    expect(Math.max(...counts)).toBeLessThanOrEqual(MAX_TRUCKS)
  })

  it('aims at the rubble of a fallen building, once it has fallen', () => {
    const trucks = fireTrucks('lot-1', burning(), true).filter(Boolean)
    expect(trucks.length).toBeGreaterThan(0)
    for (const truck of trucks) {
      expect(truck!.targetY).toBe(RUBBLE_HEIGHT)
      expect(truck!.delay).toBeGreaterThan(PRELUDE_S + COLLAPSE_S)
    }
  })

  it('puts the trucks of a building on different sides', () => {
    const spots = Array.from({ length: MAX_TRUCKS }, (_, slot) =>
      parking(slot, 4),
    ).map((p) => `${p.nx},${p.nz}`)
    expect(new Set(spots).size).toBe(MAX_TRUCKS)
  })
})

describe('parking', () => {
  it('stands just outside the wall, on the side asked for', () => {
    const p = parking(0, 4)
    expect(p.z).toBeGreaterThan(2)
    expect(p.x).toBeCloseTo(0)
    const q = parking(1, 4)
    expect(q.x).toBeGreaterThan(2)
    expect(q.z).toBeCloseTo(0)
  })

  it('heads along the wall', () => {
    const p = parking(0, 4)
    expect(p.dx * p.nx + p.dz * p.nz).toBeCloseTo(0)
  })
})

describe('stepTruck', () => {
  it('stays away while it waits for the alarm', () => {
    let truck = initialTruck()
    truck = stepTruck(truck, true, 1, 3)
    expect(truck.s).toBe(-1)
    expect(truck.waited).toBeCloseTo(1)
  })

  it('drives in then stops by the building', () => {
    let truck = initialTruck()
    for (let i = 0; i < 100; i++) truck = stepTruck(truck, true, 0.2, 1)
    expect(truck.s).toBe(0)
    expect(truckOffset(truck.s)).toBe(0)
  })

  it('brakes as it comes in', () => {
    expect(truckOffset(-1)).toBeCloseTo(-DRIVE_DISTANCE)
    expect(Math.abs(truckOffset(-0.5))).toBeLessThan(DRIVE_DISTANCE / 2)
  })

  it('drives on and away once the fire is out', () => {
    let truck = { s: 0, waited: 5, ladder: 0 }
    for (let i = 0; i < 100; i++) truck = stepTruck(truck, false, 0.2, 1)
    expect(truck.s).toBe(1)
  })

  it('does not come back if it never came', () => {
    const truck = stepTruck(initialTruck(), false, 5, 1)
    expect(truck.s).toBe(-1)
  })

  it('starts over when called back after it left', () => {
    const truck = stepTruck({ s: 1, waited: 9, ladder: 0 }, true, 0.1, 1)
    expect(truck.s).toBeLessThan(0)
  })
})

describe('ladders', () => {
  it('reaches the height of the floor, just short of the wall', () => {
    const tip = ladderReach(floorBase(3) + floorHeight(3) / 2).tip
    expect(tip.y).toBeCloseTo(floorBase(3) + floorHeight(3) / 2)
    expect(tip.z).toBeLessThan(0)
    expect(tip.z).toBeGreaterThan(-parking(0, 4).z + 2)
  })

  it('is longer for a higher floor and leans towards the wall', () => {
    const low = ladderReach(floorBase(1) + 1)
    const high = ladderReach(floorBase(5) + 1)
    expect(high.length).toBeGreaterThan(low.length)
    expect(low.length).toBeGreaterThan(LADDER_PIVOT.y)
    expect(low.tilt).toBeLessThan(0)
  })

  it('goes up once parked, and only then do the hoses spray', () => {
    let truck = { s: 0, waited: 9, ladder: 0 }
    truck = stepTruck(truck, true, 0.5, 1, true)
    expect(truck.ladder).toBeGreaterThan(0)
    expect(truck.ladder).toBeLessThan(1)
    expect(truckSprays(truck, true)).toBe(false)
    for (let i = 0; i < 50; i++) truck = stepTruck(truck, true, 0.2, 1, true)
    expect(truck.ladder).toBe(1)
    expect(truckSprays(truck, true)).toBe(true)
  })

  it('does not wait for a ladder that it does not have', () => {
    let truck = { s: 0, waited: 9, ladder: 0 }
    truck = stepTruck(truck, true, 0.1, 1, false)
    expect(truckSprays(truck, true)).toBe(true)
  })

  it('comes down before the truck drives off', () => {
    let truck = { s: 0, waited: 9, ladder: 1 }
    truck = stepTruck(truck, false, 0.5, 1, true)
    expect(truck.s).toBe(0)
    expect(truck.ladder).toBeLessThan(1)
    for (let i = 0; i < 100; i++) truck = stepTruck(truck, false, 0.2, 1, true)
    expect(truck.ladder).toBe(0)
    expect(truck.s).toBe(1)
  })
})

describe('waterPoint', () => {
  it('goes from the nozzle to the target in an arc', () => {
    const from = { x: 3, y: 1, z: 0 }
    const to = { x: 0, y: 3, z: 0 }
    expect(waterPoint(from, to, 0)).toEqual(from)
    expect(waterPoint(from, to, 1)).toEqual(to)
    const middle = waterPoint(from, to, 0.5)
    expect(middle.x).toBeCloseTo(1.5)
    expect(middle.y).toBeGreaterThan(2)
  })
})

describe('approachOf', () => {
  const ways = [{ vertical: false, at: 10, from: 0, to: 100 }]

  it('finds the road beside a building and which way to drive along it', () => {
    // South of the road (smaller z): the road is towards +Z, so the lane runs towards +X.
    const south = approachOf(ways, [], { x: 40, z: 7.8 }, 3)!
    expect([south.nx, south.nz]).toEqual([0, 1])
    expect(south.away).toBeCloseTo(2.2 - 0.4)
    expect(south.before).toBeCloseTo(40)
    expect(south.after).toBeCloseTo(60)
    // North of it, the other lane runs towards -X, from the other end.
    const north = approachOf(ways, [], { x: 40, z: 12.2 }, 3)!
    expect([north.nx, north.nz]).toEqual([0, -1])
    expect(north.before).toBeCloseTo(60)
    expect(north.after).toBeCloseTo(40)
  })

  it('drives along the roads that run along Z as well', () => {
    const vertical = [{ vertical: true, at: 10, from: 0, to: 100 }]
    const east = approachOf(vertical, [], { x: 12.2, z: 30 }, 3)!
    expect([east.nx, east.nz]).toEqual([-1, 0])
    const west = approachOf(vertical, [], { x: 7.8, z: 30 }, 3)!
    expect([west.nx, west.nz]).toEqual([1, 0])
    // The lane the truck takes is the one cars take: the same side of the road as the truck.
    expect(east.before + east.after).toBeCloseTo(100)
  })

  it('starts and ends at the ring of a roundabout, not on its island', () => {
    const a = approachOf(ways, [{ x: 20, z: 10 }], { x: 40, z: 7.8 }, 3)!
    expect(a.before).toBeCloseTo(40 - 20 - 3)
    expect(a.after).toBeCloseTo(60)
  })

  it('finds no road for a building that is far from every one', () => {
    expect(approachOf(ways, [], { x: 40, z: 50 }, 3)).toBeNull()
    expect(approachOf(ways, [], { x: 140, z: 7.8 }, 3)).toBeNull()
    expect(approachOf([], [], { x: 40, z: 7.8 }, 3)).toBeNull()
  })

  it('parks abreast of the building, on the lane, side by side along the road', () => {
    const a = approachOf(ways, [], { x: 40, z: 7.8 }, 3)!
    const spot = roadParking(a, 0)
    expect([spot.nx, spot.nz]).toEqual([0, 1])
    expect(spot.dx).toBe(1)
    expect(spot.dz).toBeCloseTo(0)
    expect(spot.z).toBeCloseTo(a.away)
    expect(roadParking(a, 2.5).x).toBeCloseTo(2.5)
  })
})

describe('long drives', () => {
  it('takes as long as it needs to cover the distance', () => {
    let truck = initialTruck()
    // Short drives take DRIVE_S, long ones longer: still on its way after that.
    for (let i = 0; i < 20; i++)
      truck = stepTruck(truck, true, 0.2, 1, false, 20)
    expect(truck.s).toBeLessThan(0)
    for (let i = 0; i < 200; i++)
      truck = stepTruck(truck, true, 0.2, 1, false, 20)
    expect(truck.s).toBe(0)
  })

  it('leaves over the time of its own way out', () => {
    let truck = { s: 0, waited: 5, ladder: 0 }
    for (let i = 0; i < 20; i++)
      truck = stepTruck(truck, false, 0.2, 1, false, 4, 20)
    expect(truck.s).toBeLessThan(1)
  })

  it('covers the whole way in and out', () => {
    expect(truckOffset(-1, 30, 50)).toBeCloseTo(-30)
    expect(truckOffset(1, 30, 50)).toBeCloseTo(50)
    expect(truckOffset(0, 30, 50)).toBe(0)
  })

  it('grows out of nothing at the start of the road and shrinks at its end', () => {
    expect(truckScale(-1, 30, 50)).toBe(0)
    expect(truckScale(0, 30, 50)).toBe(1)
    expect(truckScale(1, 30, 50)).toBe(0)
    expect(truckScale(-0.95, 30, 50)).toBeGreaterThan(0)
    expect(truckScale(-0.95, 30, 50)).toBeLessThan(1)
  })
})
