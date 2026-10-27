import { describe, expect, it } from 'vitest'
import { setWorldSeed, worldSeed } from '../../../src/city/seed'
import {
  islandPoint,
  planetLayout,
  type Island,
  type Planet,
} from '../../../src/city/planet/planet'
import { angleBetween, dot, length, sub } from '../../../src/city/planet/sphere'
import { big, hosts } from './helpers'

const reach = (island: Island) =>
  Math.hypot(island.layout.halfWidth, island.layout.halfDepth)

const gap = (planet: Planet, a: Island, b: Island) =>
  angleBetween(a.normal, b.normal) * planet.radius - reach(a) - reach(b)

describe('planetLayout', () => {
  it('is empty without a host', () => {
    const planet = planetLayout([], 'seed')
    expect(planet.islands).toEqual([])
    expect(planet.bridges).toEqual([])
  })

  it('makes one island per physical host, with no joining tile', () => {
    const planet = planetLayout(hosts, 'seed')
    expect(planet.islands.map((island) => island.id)).toEqual(
      hosts.map((host) => host.id),
    )
  })

  it('is the same for the same seed, and another for another one', () => {
    const first = planetLayout(hosts, 'one')
    expect(planetLayout(hosts, 'one')).toEqual(first)
    const other = planetLayout(hosts, 'two')
    expect(other.islands.map((island) => island.normal)).not.toEqual(
      first.islands.map((island) => island.normal),
    )
  })

  it('leaves the seed of the flat city as it was', () => {
    setWorldSeed('city')
    planetLayout(hosts, 'planet')
    expect(worldSeed()).toBe('city')
    setWorldSeed('')
  })

  it('stands every island tangent to the sphere, on its surface', () => {
    const planet = planetLayout(big, 'seed')
    for (const island of planet.islands) {
      expect(length(island.center)).toBeCloseTo(planet.radius, 6)
      expect(dot(island.normal, island.xAxis)).toBeCloseTo(0, 9)
      expect(dot(island.normal, island.zAxis)).toBeCloseTo(0, 9)
    }
  })

  it('keeps the islands apart, with room for a bridge', () => {
    for (const specs of [hosts, big]) {
      const planet = planetLayout(specs, 'seed')
      planet.islands.forEach((a, i) =>
        planet.islands.slice(i + 1).forEach((b) => {
          expect(gap(planet, a, b)).toBeGreaterThan(4)
        }),
      )
    }
  })

  it('is big enough for a flat island not to float far above the sea', () => {
    const planet = planetLayout(big, 'seed')
    for (const island of planet.islands) {
      expect(planet.radius).toBeGreaterThanOrEqual(3 * reach(island))
    }
  })

  it('grows with the number of islands', () => {
    expect(planetLayout(big, 'seed').radius).toBeGreaterThan(
      planetLayout(hosts, 'seed').radius,
    )
  })

  it('gives bigger islands to bigger scores', () => {
    const planet = planetLayout(big, 'seed')
    const area = (island: Island) =>
      island.layout.halfWidth * island.layout.halfDepth
    const small = planet.islands.find((island) => island.id === 'host-0')!
    const large = planet.islands.find((island) => island.id === 'host-27')!
    expect(area(large)).toBeGreaterThan(area(small))
  })

  it('gives every island a biome, the cold ones near the poles', () => {
    const planet = planetLayout(big, 'seed')
    for (const island of planet.islands) {
      expect(island.layout.biomes.main).not.toBe('coastal')
      expect(island.layout.biomes.second).not.toBe('coastal')
    }
  })
})

describe('islandPoint', () => {
  it('puts the middle of an island on its center, and a corner on its plane', () => {
    const planet = planetLayout(hosts, 'seed')
    const island = planet.islands[0]
    expect(islandPoint(island, 0, 0, 0)).toEqual(island.center)
    const corner = islandPoint(island, island.layout.halfWidth, 0, 0)
    expect(length(sub(corner, island.center))).toBeCloseTo(
      island.layout.halfWidth,
      9,
    )
    const up = islandPoint(island, 0, 0, 5)
    expect(length(up)).toBeCloseTo(planet.radius + 5, 9)
  })
})
