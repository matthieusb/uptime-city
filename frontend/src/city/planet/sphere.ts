// Vector maths of the planet, independent of three.js.
export type Vec3 = [number, number, number]

export const add = (a: Vec3, b: Vec3): Vec3 => [
  a[0] + b[0],
  a[1] + b[1],
  a[2] + b[2],
]

export const scale = (a: Vec3, k: number): Vec3 => [
  a[0] * k,
  a[1] * k,
  a[2] * k,
]

export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]

export const length = (a: Vec3) => Math.hypot(a[0], a[1], a[2])

export const unit = (a: Vec3): Vec3 => scale(a, 1 / length(a))

export const sub = (a: Vec3, b: Vec3): Vec3 => add(a, scale(b, -1))

// The angle between two directions, in radians.
export const angleBetween = (a: Vec3, b: Vec3) =>
  Math.acos(Math.min(1, Math.max(-1, dot(unit(a), unit(b)))))

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))

// `count` directions spread evenly over the sphere, the first ones near the north pole.
export function fibonacciPoints(count: number): Vec3[] {
  return Array.from({ length: count }, (_, i) => {
    const y = 1 - (2 * (i + 0.5)) / count
    const ring = Math.sqrt(1 - y * y)
    const turn = i * GOLDEN_ANGLE
    return [Math.cos(turn) * ring, y, Math.sin(turn) * ring]
  })
}

// The axes of a flat plate lying on the sphere at `normal`: its X and Z axes, tangent to the
// sphere, with the normal as its Y (up). `spin` turns it around the normal.
export function tangentFrame(
  normal: Vec3,
  spin: number,
): { xAxis: Vec3; zAxis: Vec3 } {
  const reference: Vec3 = Math.abs(normal[1]) > 0.99 ? [1, 0, 0] : [0, 1, 0]
  const east = unit(cross(reference, normal))
  const south = cross(east, normal)
  const [cos, sin] = [Math.cos(spin), Math.sin(spin)]
  return {
    xAxis: add(scale(east, cos), scale(south, sin)),
    zAxis: add(scale(south, cos), scale(east, -sin)),
  }
}

// The point at `t` (0 to 1) on the great circle from the direction `a` to the direction `b`.
export function slerp(a: Vec3, b: Vec3, t: number): Vec3 {
  const angle = angleBetween(a, b)
  if (angle < 1e-9) return a
  const [wa, wb] = [
    Math.sin((1 - t) * angle) / Math.sin(angle),
    Math.sin(t * angle) / Math.sin(angle),
  ]
  return add(scale(a, wa), scale(b, wb))
}
