import { describe, expect, it } from 'vitest'
import { planetLayout, type Planet } from '../../../src/city/planet/planet'
import { length, sub } from '../../../src/city/planet/sphere'
import { big, hosts, spec } from './helpers'

// Whether every island can be reached from the first one over the bridges.
const connected = (planet: Planet) => {
  if (planet.islands.length === 0) return true
  const seen = new Set([planet.islands[0].id])
  for (let again = true; again;) {
    again = false
    for (const bridge of planet.bridges) {
      const [a, b] = [seen.has(bridge.from), seen.has(bridge.to)]
      if (a !== b) {
        seen.add(a ? bridge.to : bridge.from)
        again = true
      }
    }
  }
  return seen.size === planet.islands.length
}

describe('bridges', () => {
  it('has none for a single island', () => {
    expect(planetLayout([spec('a')], 'seed').bridges).toEqual([])
  })

  it('links every island to the others', () => {
    for (const specs of [[spec('a'), spec('b')], hosts, big]) {
      expect(connected(planetLayout(specs, 'seed'))).toBe(true)
    }
  })

  it('has at least one bridge less than islands, and never a doubled one', () => {
    const planet = planetLayout(big, 'seed')
    expect(planet.bridges.length).toBeGreaterThanOrEqual(
      planet.islands.length - 1,
    )
    const keys = planet.bridges.map((bridge) =>
      [bridge.from, bridge.to].sort().join('|'),
    )
    expect(new Set(keys).size).toBe(keys.length)
    for (const bridge of planet.bridges) expect(bridge.from).not.toBe(bridge.to)
  })

  it('does not hang an island on too many bridges', () => {
    const planet = planetLayout(big, 'seed')
    const degree = new Map<string, number>()
    for (const bridge of planet.bridges)
      for (const id of [bridge.from, bridge.to])
        degree.set(id, (degree.get(id) ?? 0) + 1)
    expect(Math.max(...degree.values())).toBeLessThanOrEqual(5)
  })

  it('starts and ends on the edge of the two islands it links', () => {
    const planet = planetLayout(hosts, 'seed')
    for (const bridge of planet.bridges) {
      const [from, to] = [bridge.from, bridge.to].map((id) =>
        planet.islands.find((island) => island.id === id)!,
      )
      const [first, last] = [bridge.points[0], bridge.points.at(-1)!]
      // On the plane of the island, within its half sizes.
      for (const [island, point] of [
        [from, first],
        [to, last],
      ] as const) {
        const local = sub(point, island.center)
        const x =
          local[0] * island.xAxis[0] +
          local[1] * island.xAxis[1] +
          local[2] * island.xAxis[2]
        const z =
          local[0] * island.zAxis[0] +
          local[1] * island.zAxis[1] +
          local[2] * island.zAxis[2]
        expect(Math.abs(x)).toBeLessThanOrEqual(island.layout.halfWidth + 1e-6)
        expect(Math.abs(z)).toBeLessThanOrEqual(island.layout.halfDepth + 1e-6)
        const onEdge =
          Math.abs(Math.abs(x) - island.layout.halfWidth) < 1e-6 ||
          Math.abs(Math.abs(z) - island.layout.halfDepth) < 1e-6
        expect(onEdge).toBe(true)
      }
    }
  })

  it('runs over the sea, a little above its surface', () => {
    const planet = planetLayout(hosts, 'seed')
    for (const bridge of planet.bridges) {
      expect(bridge.points.length).toBeGreaterThan(2)
      for (const point of bridge.points.slice(1, -1)) {
        expect(length(point)).toBeGreaterThan(planet.radius)
        expect(length(point)).toBeLessThan(planet.radius + 8)
      }
    }
  })
})
