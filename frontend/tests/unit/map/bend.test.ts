import { describe, expect, it } from 'vitest'
import {
  bendGlsl,
  bendNormal,
  bendPoint,
  islandAt,
} from '../../../src/city/planet/bend'
import { planetLayout } from '../../../src/city/planet/planet'
import {
  angleBetween,
  cross,
  dot,
  length,
  type Vec3,
} from '../../../src/city/planet/sphere'
import { big, hosts } from './helpers'

describe('islandAt', () => {
  it('finds the island whose cell holds a point of the atlas', () => {
    const planet = planetLayout(big, 'seed')
    planet.islands.forEach((island, i) => {
      expect(islandAt(planet, island.x, island.z)).toBe(i)
      // Near the edge of its cell, still its own.
      expect(
        islandAt(
          planet,
          island.x + planet.cell * 0.49,
          island.z - planet.cell * 0.49,
        ),
      ).toBe(i)
    })
  })

  it('takes the nearest island outside the grid', () => {
    const planet = planetLayout(hosts, 'seed')
    expect(islandAt(planet, -1e6, -1e6)).toBe(0)
    expect(islandAt(planet, 1e6, 1e6)).toBe(planet.islands.length - 1)
  })
})

describe('bendPoint', () => {
  const planet = planetLayout(big, 'seed')

  it('puts the middle of an island on the sphere, at its place, at its height', () => {
    planet.islands.forEach((island) => {
      const at = bendPoint(planet, [island.x, 0, island.z])
      expect(length(at)).toBeCloseTo(planet.radius, 6)
      expect(angleBetween(at, island.normal)).toBeCloseTo(0, 6)
      const high = bendPoint(planet, [island.x, 7, island.z])
      expect(length(high)).toBeCloseTo(planet.radius + 7, 6)
    })
  })

  it('keeps the distances along the ground: a tile 10 away is 10 away on the sphere', () => {
    const island = planet.islands[3]
    for (const [dx, dz] of [
      [10, 0],
      [0, -10],
      [6, 8],
    ]) {
      const at = bendPoint(planet, [island.x + dx, 0, island.z + dz])
      const arc = angleBetween(at, island.normal) * planet.radius
      expect(arc).toBeCloseTo(Math.hypot(dx, dz), 6)
    }
  })

  it('goes the way the axes of the island go', () => {
    const island = planet.islands[2]
    const east = bendPoint(planet, [island.x + 5, 0, island.z])
    expect(dot(east, island.xAxis)).toBeGreaterThan(0)
    expect(dot(east, island.zAxis)).toBeCloseTo(0, 6)
    const south = bendPoint(planet, [island.x, 0, island.z + 5])
    expect(dot(south, island.zAxis)).toBeGreaterThan(0)
  })

  it('is continuous with the point beside it', () => {
    const island = planet.islands[1]
    const [a, b] = [
      bendPoint(planet, [island.x + 3, 1, island.z + 4]),
      bendPoint(planet, [island.x + 3.001, 1, island.z + 4]),
    ]
    expect(length([a[0] - b[0], a[1] - b[1], a[2] - b[2]])).toBeLessThan(0.01)
  })
})

describe('bendNormal', () => {
  const planet = planetLayout(big, 'seed')

  it('keeps the up of the ground up, away from the middle of the planet', () => {
    for (const island of planet.islands) {
      for (const [dx, dz] of [
        [0, 0],
        [9, 3],
        [-7, 12],
      ]) {
        const at: Vec3 = [island.x + dx, 0, island.z + dz]
        const up = bendNormal(planet, at, [0, 1, 0])
        const there = bendPoint(planet, at)
        expect(length(up)).toBeCloseTo(1, 9)
        expect(angleBetween(up, there)).toBeCloseTo(0, 6)
      }
    }
  })

  it('turns the sides of a box with the ground, so that they stay vertical', () => {
    const island = planet.islands[0]
    const at: Vec3 = [island.x + 8, 0, island.z + 5]
    const here = bendPoint(planet, at)
    for (const side of [
      [1, 0, 0],
      [0, 0, 1],
      [-1, 0, 0],
    ] as Vec3[]) {
      expect(
        dot(bendNormal(planet, at, side), here) / length(here),
      ).toBeCloseTo(0, 6)
    }
  })

  it('keeps a right turn a right turn', () => {
    const island = planet.islands[0]
    const at: Vec3 = [island.x + 8, 0, island.z + 5]
    const [x, y] = [
      bendNormal(planet, at, [1, 0, 0]),
      bendNormal(planet, at, [0, 1, 0]),
    ]
    const z = bendNormal(planet, at, [0, 0, 1])
    const turned = cross(x, y)
    turned.forEach((c, i) => expect(c).toBeCloseTo(z[i], 6))
  })
})

describe('bendGlsl', () => {
  it('holds a frame per island and the sizes of the atlas', () => {
    const planet = planetLayout(hosts, 'seed')
    const glsl = bendGlsl(planet)
    expect(glsl).toContain(`const int PLANET_COUNT = ${planet.islands.length};`)
    expect(glsl).toContain(`const int PLANET_COLUMNS = ${planet.columns};`)
    expect(glsl).toContain('vec3 planetBendPosition(vec3 p)')
    expect(glsl).toContain('vec3 planetBendNormal(vec3 p, vec3 normal)')
    const up = glsl.match(/PLANET_UP\[PLANET_COUNT\] = [^;]*;/)![0]
    expect(up.match(/vec3\(/g)!.length).toBe(planet.islands.length)
  })
})
