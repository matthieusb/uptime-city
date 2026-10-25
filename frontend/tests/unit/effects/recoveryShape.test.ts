import { describe, expect, it } from 'vitest'
import {
  floorFlash,
  recoveredFloors,
  RECOVERY_S,
  recoveryActive,
  waveFade,
  waveRadius,
} from '../../../src/city/effects/recoveryShape'
import type { BuildingState, Status } from '../../../src/domain/status'

const state = (floors: Status[], collapsed = false): BuildingState => ({
  collapsed,
  floors,
  burning: floors.map((s, i) => !collapsed && i > 0 && s === 'down'),
})

describe('recoveredFloors', () => {
  it('finds the services that went from down to up', () => {
    expect(
      recoveredFloors(
        state(['up', 'down', 'up', 'down']),
        state(['up', 'up', 'up', 'down']),
      ),
    ).toEqual([1])
    expect(
      recoveredFloors(
        state(['up', 'down', 'down', 'down']),
        state(['up', 'up', 'up', 'down']),
      ),
    ).toEqual([1, 2])
  })

  it('says nothing the first time a building is seen', () => {
    expect(recoveredFloors(null, state(['up', 'up']))).toEqual([])
  })

  it('does not count a service with no status yet, or one that went down', () => {
    expect(
      recoveredFloors(state(['up', 'unknown']), state(['up', 'up'])),
    ).toEqual([])
    expect(recoveredFloors(state(['up', 'up']), state(['up', 'down']))).toEqual(
      [],
    )
  })

  it('does not count the host itself: its building is rebuilt instead', () => {
    expect(recoveredFloors(state(['down', 'up']), state(['up', 'up']))).toEqual(
      [],
    )
  })

  it('says nothing when the building fell or stands again, whatever its floors say', () => {
    expect(
      recoveredFloors(state(['down', 'down'], true), state(['up', 'up'])),
    ).toEqual([])
    expect(
      recoveredFloors(state(['up', 'down']), state(['down', 'down'], true)),
    ).toEqual([])
  })
})

describe('the shock wave', () => {
  it('shows from the moment the service is back until it has spent itself', () => {
    expect(recoveryActive(0)).toBe(true)
    expect(recoveryActive(RECOVERY_S - 0.01)).toBe(true)
    expect(recoveryActive(RECOVERY_S)).toBe(false)
    expect(recoveryActive(-0.1)).toBe(false)
  })

  it('spreads from inside the building to past its walls', () => {
    const width = 4
    expect(waveRadius(0, width)).toBeLessThan(width / 2)
    expect(waveRadius(RECOVERY_S, width)).toBeGreaterThan(width / 2)
    let last = -1
    for (let age = 0; age <= RECOVERY_S; age += 0.1) {
      const radius = waveRadius(age, width)
      expect(radius).toBeGreaterThanOrEqual(last)
      last = radius
    }
  })

  it('reaches further around a wider building', () => {
    expect(waveRadius(RECOVERY_S, 6)).toBeGreaterThan(waveRadius(RECOVERY_S, 3))
  })

  it('thins out as it spends itself', () => {
    expect(waveFade(0)).toBe(1)
    expect(waveFade(RECOVERY_S / 2)).toBeLessThan(1)
    expect(waveFade(RECOVERY_S / 2)).toBeGreaterThan(0)
    expect(waveFade(RECOVERY_S)).toBe(0)
    expect(waveFade(-1)).toBe(0)
  })
})

describe('floorFlash', () => {
  it('lights the floor of the service when it is back, then dims', () => {
    expect(floorFlash(0)).toBe(1)
    expect(floorFlash(RECOVERY_S / 2)).toBeLessThan(1)
    expect(floorFlash(RECOVERY_S / 2)).toBeGreaterThan(0)
    expect(floorFlash(RECOVERY_S)).toBe(0)
    expect(floorFlash(-1)).toBe(0)
  })
})
