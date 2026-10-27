// An island of the planet: a neighbourhood standing flat on the sphere.
import type { CityLayout } from '../layout'
import { add, scale, type Vec3 } from './sphere'

export interface Island {
  id: string
  layout: CityLayout
  // The direction from the middle of the planet to the middle of the island, which is its up.
  normal: Vec3
  // Where the middle of the island stands.
  center: Vec3
  // The directions of the X and Z axes of its plate, tangent to the sphere.
  xAxis: Vec3
  zAxis: Vec3
}

// The point of the plate at (x, z) of the island, `height` above its plane.
export function islandPoint(
  island: Island,
  x: number,
  z: number,
  height = 0,
): Vec3 {
  return add(
    add(island.center, scale(island.xAxis, x)),
    add(scale(island.zAxis, z), scale(island.normal, height)),
  )
}

// Half the diagonal of the plate: every point of it is within this of its middle.
export const islandReach = (island: Pick<Island, 'layout'>) =>
  Math.hypot(island.layout.halfWidth, island.layout.halfDepth)
