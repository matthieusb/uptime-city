import { describe, expect, it } from 'vitest'
import {
  angleBetween,
  cross,
  dot,
  fibonacciPoints,
  length,
  slerp,
  tangentFrame,
  type Vec3,
} from '../../../src/city/planet/sphere'

describe('fibonacciPoints', () => {
  it('gives the wanted number of unit vectors', () => {
    const points = fibonacciPoints(40)
    expect(points).toHaveLength(40)
    for (const point of points) expect(length(point)).toBeCloseTo(1, 9)
  })

  it('spreads them: no two are closer than the even spacing allows', () => {
    const points = fibonacciPoints(50)
    // 50 points share 4π: each owns about 0.25 sr, a spacing near 0.5 rad.
    let closest = Infinity
    points.forEach((a, i) =>
      points.slice(i + 1).forEach((b) => {
        closest = Math.min(closest, angleBetween(a, b))
      }),
    )
    expect(closest).toBeGreaterThan(0.3)
  })

  it('puts a single point on the equator', () => {
    expect(fibonacciPoints(1)[0][1]).toBeCloseTo(0, 9)
  })
})

describe('tangentFrame', () => {
  const normals: Vec3[] = [
    [0, 1, 0],
    [0, -1, 0],
    [1, 0, 0],
    [0.6, 0.8, 0],
    [-0.3, 0.2, 0.93],
  ]

  it.each(normals)('is orthonormal and tangent for %s', (...normal) => {
    const unit = normal.map((c) => c / length(normal as Vec3)) as Vec3
    const { xAxis, zAxis } = tangentFrame(unit, 1.2)
    expect(length(xAxis)).toBeCloseTo(1, 9)
    expect(length(zAxis)).toBeCloseTo(1, 9)
    expect(dot(xAxis, unit)).toBeCloseTo(0, 9)
    expect(dot(zAxis, unit)).toBeCloseTo(0, 9)
    expect(dot(xAxis, zAxis)).toBeCloseTo(0, 9)
    // Right-handed like the map: x × y = z with y up along the normal.
    const turned = cross(xAxis, unit)
    turned.forEach((c, i) => expect(c).toBeCloseTo(zAxis[i], 9))
  })

  it('turns the plate around its normal with the spin', () => {
    const a = tangentFrame([0, 1, 0], 0).xAxis
    const b = tangentFrame([0, 1, 0], Math.PI / 2).xAxis
    expect(dot(a, b)).toBeCloseTo(0, 9)
  })
})

describe('slerp', () => {
  it('stays on the sphere between two points', () => {
    const a: Vec3 = [1, 0, 0]
    const b: Vec3 = [0, 1, 0]
    const middle = slerp(a, b, 0.5)
    expect(length(middle)).toBeCloseTo(1, 9)
    expect(angleBetween(a, middle)).toBeCloseTo(Math.PI / 4, 9)
    expect(slerp(a, b, 0)).toEqual(a)
  })
})
