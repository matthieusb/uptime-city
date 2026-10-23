import { describe, expect, it } from 'vitest'
import { hostBadges } from '../../src/city/labels'

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
