// The deck of a bridge as straight pieces, one between each two of its points.
import { length, scale, sub, add, type Vec3 } from './sphere'

export interface DeckSegment {
  center: Vec3
  // Unit vector from one point to the next.
  direction: Vec3
  length: number
}

export function deckSegments(points: Vec3[]): DeckSegment[] {
  return points.slice(1).map((point, i) => {
    const before = points[i]
    const span = sub(point, before)
    const size = length(span)
    return {
      center: scale(add(before, point), 0.5),
      direction: size === 0 ? [1, 0, 0] : scale(span, 1 / size),
      length: size,
    }
  })
}
