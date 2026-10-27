// Where something big (the airport, a monument) can stand on a plate, independent of three.js. A
// footprint is a rectangle of tiles: it needs land, keeps a tile away from roads, roundabouts and
// the railway, never covers a monitored building (nor the square around one) and stays `edge` tiles
// from the edges of the map. What else stands there (trees, houses, a tennis club...) makes way.
import {
  GRASS_TOP,
  PLAZA_MARGIN,
  type CityLayout,
  type Structure,
  type Tile,
  type TileKind,
} from './layout'
import type { Neighbourhood, World } from './world'

export const LAND = new Set<TileKind>([
  'grass',
  'hill',
  'sand',
  'snow',
  'plaza',
  'path',
  'court',
])

// The tiles of a plate, as a grid: the first tile (smallest x and z) and the count along each axis.
export interface Grid {
  minX: number
  minZ: number
  nx: number
  nz: number
}

// A rectangle of the plate, by its middle and size, in the frame of the plate.
export interface Centre {
  x: number
  z: number
  w: number
  d: number
}

// Sums over rectangles of an nx by nz grid, in constant time: of the rectangle of w by d cells
// whose first cell is (ix, iz).
export function rectSums(nx: number, nz: number, values: ArrayLike<number>) {
  const out = new Float64Array((nx + 1) * (nz + 1))
  for (let iz = 0; iz < nz; iz++) {
    for (let ix = 0; ix < nx; ix++) {
      out[(iz + 1) * (nx + 1) + ix + 1] =
        values[iz * nx + ix] +
        out[iz * (nx + 1) + ix + 1] +
        out[(iz + 1) * (nx + 1) + ix] -
        out[iz * (nx + 1) + ix]
    }
  }
  return (ix: number, iz: number, w: number, d: number) =>
    out[(iz + d) * (nx + 1) + ix + w] -
    out[iz * (nx + 1) + ix + w] -
    out[(iz + d) * (nx + 1) + ix] +
    out[iz * (nx + 1) + ix]
}

export interface Ground {
  grid: Grid
  // How many tiles of a rectangle (first tile as indexes in the grid, then its size) cannot be
  // stood on, and what it costs to clear the others.
  badIn: (ix: number, iz: number, w: number, d: number) => number
  costIn: (ix: number, iz: number, w: number, d: number) => number
  // Every monitored building and decoration lot of the map, in the frame of the map.
  lots: { x: number; z: number; width: number }[]
}

// The tile grid of a plate, with what can be stood on and what it costs. `blocked` structures
// cannot be cleared at all, as the airport.
export function groundOf(
  world: World,
  plate: Neighbourhood,
  edge: number,
  blocked: (structure: Structure) => boolean = () => false,
): Ground {
  const { layout } = plate
  const minX = Math.min(...layout.tiles.map((t) => t.x))
  const minZ = Math.min(...layout.tiles.map((t) => t.z))
  const nx = Math.round(Math.max(...layout.tiles.map((t) => t.x)) - minX) + 1
  const nz = Math.round(Math.max(...layout.tiles.map((t) => t.z)) - minZ) + 1
  const index = (x: number, z: number) =>
    Math.round(z - minZ) * nx + Math.round(x - minX)
  const inside = (ix: number, iz: number) =>
    ix >= 0 && iz >= 0 && ix < nx && iz < nz

  // Tiles that cannot be stood on, and what it costs to clear the others.
  const bad = new Uint8Array(nx * nz).fill(1)
  const cost = new Float64Array(nx * nz)
  for (const t of layout.tiles) {
    const gx = plate.x + t.x
    const gz = plate.z + t.z
    const awayFromEdges =
      Math.abs(gx) + 0.5 <= world.halfWidth - edge &&
      Math.abs(gz) + 0.5 <= world.halfDepth - edge
    if (LAND.has(t.kind) && awayFromEdges) bad[index(t.x, t.z)] = 0
    if (t.kind === 'path') cost[index(t.x, t.z)] += 1
    if (t.kind === 'hill') cost[index(t.x, t.z)] += 0.2
  }
  // Roads and their roundabouts, and the railway: a tile of margin around them.
  for (const t of layout.tiles) {
    if (LAND.has(t.kind)) continue
    if (t.kind === 'water' || t.kind === 'shallow') continue
    const [cx, cz] = [Math.round(t.x - minX), Math.round(t.z - minZ)]
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        if (inside(cx + dx, cz + dz)) bad[(cz + dz) * nx + cx + dx] = 1
      }
    }
  }
  // Monitored buildings and decoration lots, with their square and some room around.
  for (const neighbourhood of world.neighbourhoods) {
    for (const lot of neighbourhood.layout.lots) {
      const half = lot.width / 2 + PLAZA_MARGIN + 1.5
      const [cx, cz] = [
        neighbourhood.x + lot.x - plate.x,
        neighbourhood.z + lot.z - plate.z,
      ]
      for (
        let ix = Math.floor(cx - half - minX);
        ix <= Math.ceil(cx + half - minX);
        ix++
      ) {
        for (
          let iz = Math.floor(cz - half - minZ);
          iz <= Math.ceil(cz + half - minZ);
          iz++
        ) {
          const [x, z] = [ix + minX, iz + minZ]
          if (
            inside(ix, iz) &&
            Math.abs(x - cx) < half + 0.5 &&
            Math.abs(z - cz) < half + 0.5
          ) {
            bad[iz * nx + ix] = 1
          }
        }
      }
    }
  }
  for (const tree of layout.trees) {
    const [ix, iz] = [Math.round(tree.x - minX), Math.round(tree.z - minZ)]
    if (inside(ix, iz)) cost[iz * nx + ix] += 0.3
  }
  for (const structure of layout.structures) {
    const stays = blocked(structure)
    for (let di = 0; di < structure.width; di++) {
      for (let dj = 0; dj < structure.depth; dj++) {
        const ix = Math.round(
          structure.x - (structure.width - 1) / 2 + di - minX,
        )
        const iz = Math.round(
          structure.z - (structure.depth - 1) / 2 + dj - minZ,
        )
        if (!inside(ix, iz)) continue
        if (stays) bad[iz * nx + ix] = 1
        else cost[iz * nx + ix] += 4
      }
    }
  }

  return {
    grid: { minX, minZ, nx, nz },
    badIn: rectSums(nx, nz, bad),
    costIn: rectSums(nx, nz, cost),
    lots: world.neighbourhoods.flatMap((neighbourhood) =>
      neighbourhood.layout.lots.map((lot) => ({
        x: neighbourhood.x + lot.x,
        z: neighbourhood.z + lot.z,
        width: lot.width,
      })),
    ),
  }
}

// The middle of the rectangle of w by d tiles whose first tile is (ix, iz).
export function centreOf(
  grid: Grid,
  ix: number,
  iz: number,
  w: number,
  d: number,
): Centre {
  return {
    x: grid.minX + ix + (w - 1) / 2,
    z: grid.minZ + iz + (d - 1) / 2,
    w,
    d,
  }
}

// A hill, a path or a court goes back to plain grass.
export function level(t: Tile): Tile {
  return t.kind === 'hill' || t.kind === 'path' || t.kind === 'court'
    ? { ...t, kind: 'grass', top: GRASS_TOP }
    : t
}

// The layout with `built` on the rectangle `c`: what stood there makes way (a tennis club goes
// whole, as a road through it would take it), the ground of the rectangle is done by `paint`
// and the ground of whatever went elsewhere goes back to grass.
export function clearFootprint(
  layout: CityLayout,
  centre: Centre,
  paint: (t: Tile) => Tile,
  built: Structure,
): CityLayout {
  const within = (x: number, z: number, margin = 0) =>
    Math.abs(x - centre.x) < centre.w / 2 + margin &&
    Math.abs(z - centre.z) < centre.d / 2 + margin
  const hit = (structure: Structure) =>
    Math.abs(structure.x - centre.x) < (structure.width + centre.w) / 2 &&
    Math.abs(structure.z - centre.z) < (structure.depth + centre.d) / 2
  const club = (structure: Structure) =>
    structure.kind === 'tennis' || structure.kind === 'clubhouse'
  const clubHit = layout.structures.some(
    (structure) => club(structure) && hit(structure),
  )
  const goes = (structure: Structure) =>
    hit(structure) || (clubHit && club(structure))
  const removed = layout.structures.filter(goes)
  const under = (t: Tile) =>
    removed.some(
      (structure) =>
        Math.abs(t.x - structure.x) < structure.width / 2 &&
        Math.abs(t.z - structure.z) < structure.depth / 2,
    )
  const tiles = layout.tiles.map((t): Tile => {
    if (within(t.x, t.z)) return paint(t)
    return under(t) ? { ...t, kind: 'grass', top: GRASS_TOP } : t
  })
  const free = (p: { x: number; z: number }) => !within(p.x, p.z, 0.5)
  return {
    ...layout,
    tiles,
    trees: layout.trees.filter(free),
    flowers: layout.flowers.filter(free),
    reeds: layout.reeds.filter(free),
    rocks: layout.rocks.filter(free),
    umbrellas: layout.umbrellas.filter(free),
    structures: [
      ...layout.structures.filter((structure) => !goes(structure)),
      built,
    ],
  }
}
