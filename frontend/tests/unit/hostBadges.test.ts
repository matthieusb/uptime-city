import { describe, expect, it } from 'vitest'
import { buildingBadges, hostBadges } from '../../src/city/labels'

describe('hostBadges', () => {
  it('shows the host badge alone without any service count', () => {
    expect(hostBadges(undefined).map((b) => b.text)).toEqual(['host'])
    expect(
      hostBadges({ id: 'a', services_up: 0, services_down: 0 }).map(
        (b) => b.text,
      ),
    ).toEqual(['host'])
  })

  it('adds a green badge with the services running correctly', () => {
    const [, up, ...others] = hostBadges({
      id: 'a',
      services_up: 12,
      services_down: 0,
    })
    expect(up.text).toBe('12')
    expect(up.color).toMatch(/^#2ecc71$/i)
    expect(others).toEqual([])
  })

  it('adds a red badge with the services that are down, after the green one', () => {
    const badges = hostBadges({ id: 'a', services_up: 3, services_down: 2 })
    expect(badges.map((b) => b.text)).toEqual(['host', '3', '2'])
    expect(badges[2].color).toMatch(/^#e74c3c$/i)
  })

  it('leaves out the green badge when no service is running', () => {
    expect(
      hostBadges({ id: 'a', services_up: 0, services_down: 4 }).map(
        (b) => b.text,
      ),
    ).toEqual(['host', '4'])
  })
})

describe('buildingBadges', () => {
  const base = { text: 'VM', color: '#4fa6e0' }

  it('keeps the badge of the building alone without any service count', () => {
    expect(buildingBadges(base, undefined)).toEqual([base])
    expect(
      buildingBadges(base, { id: 'v', services_up: 0, services_down: 0 }),
    ).toEqual([base])
  })

  it('adds the green and the red counts of the services of the building', () => {
    const badges = buildingBadges(base, {
      id: 'v',
      services_up: 5,
      services_down: 1,
    })
    expect(badges.map((b) => b.text)).toEqual(['VM', '5', '1'])
    expect(badges[1].color).toMatch(/^#2ecc71$/i)
    expect(badges[2].color).toMatch(/^#e74c3c$/i)
  })
})

describe('counting badges', () => {
  it('breathe, unlike the badge of the host', () => {
    const [host, up, down] = hostBadges({
      id: 'a',
      services_up: 1,
      services_down: 1,
    })
    expect(host.pulse).toBeFalsy()
    expect(up.pulse).toBe(true)
    expect(down.pulse).toBe(true)
  })
})
