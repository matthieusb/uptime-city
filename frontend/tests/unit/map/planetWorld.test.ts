import { describe, expect, it } from 'vitest'
import { planetLayout } from '../../../src/city/planet/planet'
import { planetWorld } from '../../../src/city/planet/planetWorld'
import { hosts } from './helpers'

describe('planetWorld', () => {
  it('shows each island as a neighbourhood of the world, with no wild tile, road or rail', () => {
    const planet = planetLayout(hosts, 'seed')
    const world = planetWorld(planet)
    expect(
      world.neighbourhoods.map((neighbourhood) => neighbourhood.id),
    ).toEqual(planet.islands.map((island) => island.id))
    expect(
      world.neighbourhoods.map((neighbourhood) => neighbourhood.layout),
    ).toEqual(planet.islands.map((island) => island.layout))
    expect(world.wilds).toEqual([])
    expect(world.ways).toEqual([])
    expect(world.roundabouts).toEqual([])
    expect(world.track).toBeNull()
  })

  it('is as big as the planet', () => {
    const planet = planetLayout(hosts, 'seed')
    const world = planetWorld(planet)
    expect(world.halfWidth).toBe(planet.radius)
    expect(world.halfDepth).toBe(planet.radius)
  })

  it('is empty for an empty planet', () => {
    expect(planetWorld(planetLayout([], 'seed')).neighbourhoods).toEqual([])
  })
})
