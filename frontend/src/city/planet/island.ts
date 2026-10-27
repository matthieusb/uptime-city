// An island of the planet: a neighbourhood standing flat on the sphere.
import type { CityLayout } from '../layout'
import type { Vec3 } from './sphere'

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
  // Where its plate stands in the atlas it is drawn in, before it is bent onto the sphere.
  x: number
  z: number
}

// Half the diagonal of the plate: every point of it is within this of its middle.
export const islandReach = (island: Pick<Island, 'layout'>) =>
  Math.hypot(island.layout.halfWidth, island.layout.halfDepth)
