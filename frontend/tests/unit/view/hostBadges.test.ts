import { describe, expect, it } from 'vitest'
import { buildingBadges, hostBadges } from '../../../src/city/labels'

describe('hostBadges', () => {
  it('shows the host badge alone without any service count', () => {
    expect(hostBadges(undefined).map((badge) => badge.text)).toEqual(['host'])
    expect(
      hostBadges({ up: 0, down: 0, unknown: 0 }).map((badge) => badge.text),
    ).toEqual(['host'])
  })

  it('adds a green badge with the services running correctly', () => {
    const [, up, ...others] = hostBadges({ up: 12, down: 0, unknown: 0 })
    expect(up.text).toBe('12')
    expect(up.color).toMatch(/^#2ecc71$/i)
    expect(others).toEqual([])
  })

  it('adds a red badge with the services that are down, after the green one', () => {
    const badges = hostBadges({ up: 3, down: 2, unknown: 0 })
    expect(badges.map((badge) => badge.text)).toEqual(['host', '3', '2'])
    expect(badges[2].color).toMatch(/^#e74c3c$/i)
  })

  it('leaves out the green badge when no service is running', () => {
    expect(
      hostBadges({ up: 0, down: 4, unknown: 0 }).map((badge) => badge.text),
    ).toEqual(['host', '4'])
  })
})

describe('unknown badge', () => {
  it('adds an orange badge starting with ? after the red one', () => {
    const badges = hostBadges({ up: 3, down: 2, unknown: 4 })
    expect(badges.map((badge) => badge.text)).toEqual(['host', '3', '2', '? 4'])
    expect(badges[3].color).toMatch(/^#e67e22$/i)
  })

  it('has no badge without any unknown service', () => {
    expect(
      hostBadges({ up: 1, down: 0, unknown: 0 }).map((badge) => badge.text),
    ).toEqual(['host', '1'])
  })

  it('is on the badges of a building too', () => {
    const base = { text: 'VM', color: '#4fa6e0' }
    expect(
      buildingBadges(base, { up: 0, down: 0, unknown: 2 }).map(
        (badge) => badge.text,
      ),
    ).toEqual(['VM', '? 2'])
  })
})

describe('buildingBadges', () => {
  const base = { text: 'VM', color: '#4fa6e0' }

  it('keeps the badge of the building alone without any service count', () => {
    expect(buildingBadges(base, undefined)).toEqual([base])
    expect(buildingBadges(base, { up: 0, down: 0, unknown: 0 })).toEqual([base])
  })

  it('adds the green and the red counts of the services of the building', () => {
    const badges = buildingBadges(base, { up: 5, down: 1, unknown: 0 })
    expect(badges.map((badge) => badge.text)).toEqual(['VM', '5', '1'])
    expect(badges[1].color).toMatch(/^#2ecc71$/i)
    expect(badges[2].color).toMatch(/^#e74c3c$/i)
  })
})

describe('counting badges', () => {
  it('breathe, unlike the badge of the host', () => {
    const [host, up, down] = hostBadges({ up: 1, down: 1, unknown: 0 })
    expect(host.pulse).toBeFalsy()
    expect(up.pulse).toBe(true)
    expect(down.pulse).toBe(true)
  })
})

describe('count badges', () => {
  it('tell which status they count, unlike the host badge', () => {
    const badges = hostBadges({ up: 1, down: 1, unknown: 1 })
    expect(badges.map((badge) => badge.status)).toEqual([
      undefined,
      'up',
      'down',
      'unknown',
    ])
  })
})
