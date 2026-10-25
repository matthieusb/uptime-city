import { describe, expect, it } from 'vitest'
import { RESTORE_S } from '../../../src/city/effects/restoreShape'
import { MISSILE_S, STRIKE_S } from '../../../src/city/effects/strikeShape'
import {
  holdUntil,
  strikePhase,
  trackStrike,
  type StrikeState,
} from '../../../src/city/strike'

describe('trackStrike', () => {
  it('starts a strike when a host seen up goes down', () => {
    const state = trackStrike({ status: 'up', startedAt: null }, 'down', 500)
    expect(state).toEqual({ status: 'down', startedAt: 500 })
  })

  it('shows a host down from the start in ruins at once', () => {
    expect(trackStrike(undefined, 'down', 500).startedAt).toBeNull()
    expect(
      trackStrike({ status: 'unknown', startedAt: null }, 'down', 500)
        .startedAt,
    ).toBeNull()
  })

  it('plays no strike when animations are disabled', () => {
    const state = trackStrike(
      { status: 'up', startedAt: null },
      'down',
      500,
      false,
    )
    expect(state).toEqual({ status: 'down', startedAt: null })
  })

  it('keeps the strike going while the host stays down', () => {
    const state: StrikeState = { status: 'down', startedAt: 500 }
    expect(trackStrike(state, 'down', 9000)).toBe(state)
  })

  it('ends it when the host is back', () => {
    expect(trackStrike({ status: 'down', startedAt: 500 }, 'up', 900)).toEqual({
      status: 'up',
      startedAt: null,
    })
  })
})

describe('strikePhase', () => {
  const state: StrikeState = { status: 'down', startedAt: 1000 }
  const at = (s: number) => strikePhase(state, 1000 + s * 1000)

  it('goes from the missile to the mushroom to the ruins', () => {
    expect(at(0)).toBe('incoming')
    expect(at(MISSILE_S - 0.1)).toBe('incoming')
    expect(at(MISSILE_S)).toBe('struck')
    expect(at(STRIKE_S - 0.1)).toBe('struck')
    expect(at(STRIKE_S)).toBe('ruins')
  })

  it('shows the ruins at once when animations are disabled', () => {
    expect(strikePhase(state, 1000, false)).toBe('ruins')
  })

  it('has nothing for a host that is not down, ruins when down from the start', () => {
    expect(strikePhase(undefined, 0)).toBe('none')
    expect(strikePhase({ status: 'up', startedAt: null }, 0)).toBe('none')
    expect(strikePhase({ status: 'down', startedAt: null }, 0)).toBe('ruins')
  })
})

describe('restoration', () => {
  const nuked: StrikeState = { status: 'down', startedAt: null }

  it('starts when a nuked host comes back up', () => {
    expect(trackStrike(nuked, 'up', 700)).toEqual({
      status: 'up',
      startedAt: null,
      restoredAt: 700,
    })
  })

  it('starts for a host that is back while its strike is playing out', () => {
    const state: StrikeState = { status: 'down', startedAt: 1000 }
    const back = trackStrike(state, 'up', 1000 + (MISSILE_S + 1) * 1000)
    expect(back.restoredAt).toBe(1000 + (MISSILE_S + 1) * 1000)
  })

  it('has none when the missile had not landed yet, nor with animations disabled', () => {
    expect(
      trackStrike({ status: 'down', startedAt: 1000 }, 'up', 1500).restoredAt,
    ).toBeUndefined()
    expect(trackStrike(nuked, 'up', 700, false).restoredAt).toBeUndefined()
  })

  it('is kept while the host stays up', () => {
    const state = trackStrike(nuked, 'up', 700)
    expect(trackStrike(state, 'up', 900)).toBe(state)
  })

  it('is the restoring phase until it is over, then nothing', () => {
    const state: StrikeState = { status: 'up', startedAt: null, restoredAt: 0 }
    expect(strikePhase(state, 100)).toBe('restoring')
    expect(strikePhase(state, RESTORE_S * 1000 - 1)).toBe('restoring')
    expect(strikePhase(state, RESTORE_S * 1000)).toBe('none')
    expect(strikePhase(state, 100, false)).toBe('none')
  })

  it('gives way to a new strike when the host goes down again', () => {
    const state: StrikeState = { status: 'up', startedAt: null, restoredAt: 0 }
    expect(trackStrike(state, 'down', 900)).toEqual({
      status: 'down',
      startedAt: 900,
    })
  })
})

describe('holdUntil', () => {
  it('waits one second after the last impact', () => {
    expect(holdUntil([])).toBe(0)
    expect(holdUntil([1000, 3000])).toBe(3000 + (MISSILE_S + 1) * 1000)
  })
})
