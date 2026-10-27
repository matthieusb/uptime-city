// The size of every neighbourhood, from its host's score, and the rows they are laid in.
import { type HostSpec } from '../layout'

// How much a physical host weighs in the size of its neighbourhood: the host
// itself, its own services, its vm-hosts and the services on these.
const HOST_SCORE = 20

const SERVICE_SCORE = 5

const VM_SCORE = 15

const VM_SERVICE_SCORE = 6

export function sizeScore(buildings: HostSpec[]): number {
  const [host, ...vms] = buildings
  return (
    HOST_SCORE +
    SERVICE_SCORE * (host?.services ?? 0) +
    vms.reduce(
      (sum, hostSpec) => sum + VM_SCORE + VM_SERVICE_SCORE * hostSpec.services,
      0,
    )
  )
}

// Neighbourhoods are about this much wider than deep.
const ASPECT = 1.3

const odd = (n: number) =>
  Math.ceil(n) % 2 === 0 ? Math.ceil(n) + 1 : Math.ceil(n)

export interface Size {
  width: number
  depth: number
}

// How much bigger than the one before it, at least, a neighbourhood is when
// its score is higher.
const GROWTH = 1.08

// The size of every neighbourhood, in tiles: the bigger its score, the bigger
// its area, and never too small for its buildings. Going up the scores, each
// area is at least that of the previous score, a little more.
export function sizesOf(natural: Size[], scores: number[]): Size[] {
  const sizes: Size[] = []
  const ascending = scores
    .map((_, i) => i)
    .sort((a, b) => scores[a] - scores[b])
  let previous = 0
  let before = -Infinity
  for (const i of ascending) {
    const own = natural[i].width * natural[i].depth
    // The same score, the same area, or the nearest the buildings allow.
    const same = scores[i] === before
    sizes[i] = fit(
      natural[i],
      Math.max(own, same ? previous : previous * GROWTH),
    )
    const area = sizes[i].width * sizes[i].depth
    previous = same ? Math.max(previous, area) : area
    before = scores[i]
  }
  return sizes
}

// The size of at least this area, odd on both sides and not smaller than
// `min`, wide first or deep first, whichever overshoots the area the least.
function fit(min: Size, area: number): Size {
  const wide = odd(Math.max(min.width, Math.sqrt(area * ASPECT)))
  const deep = odd(Math.max(min.depth, Math.sqrt(area / ASPECT)))
  const options: Size[] = [
    { width: wide, depth: odd(Math.max(min.depth, area / wide)) },
    { width: odd(Math.max(min.width, area / deep)), depth: deep },
  ]
  return options.sort(
    (size, q) => size.width * size.depth - q.width * q.depth,
  )[0]
}

// Cuts the neighbourhoods, deepest first, into rows no wider than `limit`.
function shelves(order: number[], sizes: Size[], limit: number): number[][] {
  const rows: number[][] = []
  let width = 0
  for (const i of order) {
    if (rows.length === 0 || width + sizes[i].width > limit) {
      rows.push([])
      width = 0
    }
    rows[rows.length - 1].push(i)
    width += sizes[i].width
  }
  return rows
}

export const rowWidth = (row: number[], sizes: Size[]) =>
  row.reduce((sum, i) => sum + sizes[i].width, 0)

export const rowDepth = (row: number[], sizes: Size[]) =>
  Math.max(...row.map((i) => sizes[i].depth))

// The rows that make the map as square as possible, without wasting much
// ground on joining tiles.
export function chooseRows(sizes: Size[]): number[][] {
  const order = sizes
    .map((_, i) => i)
    .sort((a, b) => sizes[b].depth - sizes[a].depth || a - b)
  const area = sizes.reduce((sum, size) => sum + size.width * size.depth, 0)
  const widest = Math.max(...sizes.map((size) => size.width))
  const total = sizes.reduce((sum, size) => sum + size.width, 0)
  let best: number[][] = []
  let bestScore = Infinity
  for (let limit = widest; limit <= total; limit++) {
    const rows = shelves(order, sizes, limit)
    const width = Math.max(...rows.map((r) => rowWidth(r, sizes)))
    const depth = rows.reduce((sum, r) => sum + rowDepth(r, sizes), 0)
    const score =
      Math.abs(Math.log(width / depth)) + (2 * (width * depth - area)) / area
    if (score < bestScore) [best, bestScore] = [rows, score]
  }
  return best
}
