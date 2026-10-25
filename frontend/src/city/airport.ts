// The airport of the map, independent of three.js. It stands on the biggest neighbourhood, and the
// bigger that tile, the longer its runway and the more stands it has. It is laid out in its own
// frame (runway along X, terminal at the back, -Z), turned by quarter turns on the plate. It is
// placed where no road, no monitored building and no water is, at least `EDGE` tiles from the edges
// of the map; whatever else stands there (trees, houses, a tennis club...) makes way for it.
// The planes are in flights.ts.
import {
  GRASS_TOP,
  PLAZA_MARGIN,
  PLAZA_TOP,
  hash,
  hides,
  type Structure,
  type Tile,
  type TileKind,
} from './layout'
import type { Neighbourhood, World } from './world'

// How far from every edge of the map the airport stays, in tiles.
export const EDGE = 8
// Across the runway, in tiles (odd, so that tiles line up with the paved parts).
export const DEPTH = 15
export const MIN_LENGTH = 14
export const MAX_LENGTH = 40
// Where things are across the airport, in its own frame (Z grows towards the front).
export const RUNWAY_Z = 5
export const RUNWAY_WIDTH = 3
export const TAXI_Z = 2
export const STAND_Z = -2.3
// How far from the runway ends the links to the taxiway are, and the stands are apart.
const LINK_FROM_END = 2.5
const STAND_SPACING = 5
// A tower is this tall.
export const TOWER_HEIGHT = 3.5

export interface AirportLayout {
  // The runway, along X, from -length / 2 to length / 2.
  length: number
  // Size of the footprint, in its own frame.
  width: number
  depth: number
  // X of the stands, and of the links between the runway and the taxiway (at -link and link).
  standX: number[]
  link: number
  hangar: boolean
}

// The runway of the airport of a plate: about 0.8 of its side, from MIN_LENGTH to MAX_LENGTH.
export function runwayLength(halfWidth: number, halfDepth: number): number {
  const side = 2 * Math.sqrt(halfWidth * halfDepth)
  const length = 2 * Math.round((0.8 * side) / 2)
  return Math.min(MAX_LENGTH, Math.max(MIN_LENGTH, length))
}

export function standCount(length: number): number {
  return length >= 30 ? 4 : length >= 22 ? 3 : 2
}

export function airportLayout(length: number): AirportLayout {
  const stands = standCount(length)
  return {
    length,
    width: length + 2,
    depth: DEPTH,
    standX: Array.from(
      { length: stands },
      (_, k) => (k - (stands - 1) / 2) * STAND_SPACING,
    ),
    link: length / 2 - LINK_FROM_END,
    hangar: length >= 24,
  }
}

// Turns a point of the airport frame by `turn` quarter turns around the middle of the airport.
export function turned(turn: number, x: number, z: number): [number, number] {
  let [a, b] = [x, z]
  for (let q = 0; q < ((turn % 4) + 4) % 4; q++) [a, b] = [-b, a]
  return [a, b]
}

// Paved parts of the airport, as [x0, x1, z0, z1] in its frame.
function paved(l: AirportLayout): [number, number, number, number][] {
  const half = (l.standX.length * STAND_SPACING) / 2
  const run = RUNWAY_WIDTH / 2
  return [
    [-l.length / 2, l.length / 2, RUNWAY_Z - run, RUNWAY_Z + run],
    [-l.link - 0.5, l.link + 0.5, TAXI_Z - 0.5, TAXI_Z + 0.5],
    [-l.link - 0.5, -l.link + 0.5, TAXI_Z, RUNWAY_Z - run],
    [l.link - 0.5, l.link + 0.5, TAXI_Z, RUNWAY_Z - run],
    [-half, half, -4.5, TAXI_Z + 0.5],
    [-half - 0.5, half + 0.5, -7.5, -4.5],
  ]
}

// The parts that rise from the ground and could hide a building behind them: the terminal and the
// hangar in slices, and the tower. In the airport frame.
export function solids(
  l: AirportLayout,
): { x: number; z: number; height: number; radius: number }[] {
  const half = (l.standX.length * STAND_SPACING) / 2
  const out = [{ x: half + 1.5, z: -6, height: TOWER_HEIGHT, radius: 0.8 }]
  for (let x = -half + 1; x < half + 0.5; x += 2) {
    out.push({ x, z: -6, height: 1.3, radius: 1.5 })
  }
  if (l.hangar) {
    for (const x of [-half - 4, -half - 2]) {
      out.push({ x, z: -5.4, height: 1.8, radius: 1.5 })
    }
  }
  return out
}

export interface BoxOut {
  x: number
  y: number
  z: number
  sx: number
  sy: number
  sz: number
}

// Every box of the airport (color, then the middle and size of the box, y from the ground), in
// its own frame.
export function airportShape(l: AirportLayout): {
  color: string
  at: [number, number, number]
  size: [number, number, number]
}[] {
  const out: ReturnType<typeof airportShape> = []
  const box = (
    color: string,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
  ) => out.push({ color, at: [x, y, z], size: [sx, sy, sz] })
  const half = (l.standX.length * STAND_SPACING) / 2
  const run = l.length / 2

  // The runway, with its edge lines, centre dashes and the bars at both ends.
  box('#34343c', 0, 0.02, RUNWAY_Z, l.length, 0.04, RUNWAY_WIDTH)
  for (const dz of [-1.35, 1.35]) {
    box('#f4f1ea', 0, 0.045, RUNWAY_Z + dz, l.length - 1, 0.02, 0.06)
  }
  for (let x = -run + 4; x <= run - 4 + 1e-6; x += 2) {
    box('#f4f1ea', x, 0.045, RUNWAY_Z, 1, 0.02, 0.1)
  }
  for (const sign of [-1, 1]) {
    for (let j = -2; j <= 2; j++) {
      box(
        '#f4f1ea',
        sign * (run - 0.7),
        0.045,
        RUNWAY_Z + j * 0.5,
        0.8,
        0.02,
        0.2,
      )
    }
  }
  // The taxiway and its links, with a yellow line, and the apron.
  box('#45454d', 0, 0.02, TAXI_Z, 2 * l.link + 1, 0.04, 1)
  box('#ffd23f', 0, 0.045, TAXI_Z, 2 * l.link + 1, 0.02, 0.05)
  for (const sign of [-1, 1]) {
    box(
      '#45454d',
      sign * l.link,
      0.02,
      (TAXI_Z + RUNWAY_Z - 1.5) / 2 + 0.25,
      1,
      0.04,
      RUNWAY_Z - 1.5 - TAXI_Z - 0.5,
    )
    box(
      '#ffd23f',
      sign * l.link,
      0.045,
      (TAXI_Z + RUNWAY_Z - 1.5) / 2 + 0.25,
      0.05,
      0.02,
      RUNWAY_Z - 1.5 - TAXI_Z - 0.5,
    )
  }
  box('#8e8e96', 0, 0.02, -1.5, 2 * half, 0.04, 6)
  for (const x of l.standX) {
    box('#ffd23f', x, 0.045, -1.6, 0.06, 0.02, 3.2)
    box('#f4f1ea', x + STAND_SPACING / 2, 0.045, -2.2, 0.05, 0.02, 4)
  }

  // The terminal, with a jet bridge to each stand, and the control tower.
  const tw = 2 * half + 1
  box('#e8e4da', 0, 0.65, -6, tw, 1.3, 3)
  box('#8a8f98', 0, 1.34, -6, tw + 0.3, 0.12, 3)
  box('#2b3a55', 0, 0.75, -4.47, tw - 0.8, 0.5, 0.05)
  for (const x of l.standX) box('#c9ccd2', x, 0.7, -4.35, 0.4, 0.3, 0.3)
  const tx = half + 1.5
  box('#d9d6cc', tx, 1.0, -6, 0.7, 2, 0.7)
  box('#9fd3ff', tx, 2.25, -6, 1.1, 0.5, 1.1)
  box('#8a8f98', tx, 2.6, -6, 1.3, 0.12, 1.3)
  box('#c0392b', tx, 3.15, -6, 0.06, 0.9, 0.06)
  if (l.hangar) {
    const hx = -half - 3
    box('#b9bec7', hx, 0.8, -5.4, 4, 1.6, 3)
    box('#8a8f98', hx, 1.7, -5.4, 4.3, 0.2, 3.3)
    box('#2b3a55', hx, 0.65, -3.88, 3, 1.2, 0.04)
  }
  // A windsock at the end of the runway.
  box('#8a8f98', run - 1, 0.5, RUNWAY_Z - 2.6, 0.05, 1, 0.05)
  box('#ff8c42', run - 1, 0.95, RUNWAY_Z - 2.6, 0.5, 0.15, 0.15)
  return out
}

// The boxes of an airport structure on its plate, turned and moved, for the scenery to draw.
export function airportBoxes(
  s: Pick<Structure, 'x' | 'y' | 'z' | 'width' | 'depth' | 'turn'>,
  emit: (color: string, box: BoxOut) => void,
) {
  const turn = s.turn ?? 0
  const layout = airportLayout((turn % 2 === 0 ? s.width : s.depth) - 2)
  for (const { color, at, size } of airportShape(layout)) {
    const [dx, dz] = turned(turn, at[0], at[2])
    const [sx, sz] = turn % 2 === 0 ? [size[0], size[2]] : [size[2], size[0]]
    emit(color, {
      x: s.x + dx,
      y: s.y + at[1],
      z: s.z + dz,
      sx,
      sy: size[1],
      sz,
    })
  }
}

const LAND = new Set<TileKind>([
  'grass',
  'hill',
  'sand',
  'snow',
  'plaza',
  'path',
  'court',
])

// The airport of a world: where it is, in the frame of its plate, and how far the edges of the
// map are along its runway. Null if there is none.
export interface Airport {
  plate: Neighbourhood
  structure: Structure
  layout: AirportLayout
  turn: number
  // Distances from its middle to the edges of the map, along the +X and -X of its runway.
  reach: { pos: number; neg: number }
}

export function findAirport(world: World): Airport | null {
  for (const plate of world.neighbourhoods) {
    const structure = plate.layout.structures.find((s) => s.kind === 'airport')
    if (!structure) continue
    const turn = structure.turn ?? 0
    const layout = airportLayout(
      (turn % 2 === 0 ? structure.width : structure.depth) - 2,
    )
    const [ux, uz] = turned(turn, 1, 0)
    const gx = plate.x + structure.x
    const gz = plate.z + structure.z
    const toward = (sign: number) =>
      ux !== 0
        ? world.halfWidth - sign * ux * gx
        : world.halfDepth - sign * uz * gz
    return {
      plate,
      structure,
      layout,
      turn,
      reach: { pos: toward(1), neg: toward(-1) },
    }
  }
  return null
}

// The neighbourhood with the biggest ground; the first one if several are as big.
function biggest(world: World): Neighbourhood | null {
  let best: Neighbourhood | null = null
  for (const n of world.neighbourhoods) {
    if (
      !best ||
      n.layout.halfWidth * n.layout.halfDepth >
        best.layout.halfWidth * best.layout.halfDepth
    ) {
      best = n
    }
  }
  return best
}

interface Spot {
  length: number
  turn: number
  // The first tile (smallest x and z) of the footprint, as indexes in the grid of the plate.
  ix: number
  iz: number
  cost: number
}

// Puts the airport on the biggest neighbourhood of the world, as big as fits.
export function placeAirport(world: World): World {
  const plate = biggest(world)
  if (!plate) return world
  const found = search(world, plate)
  if (!found) return world
  return {
    ...world,
    neighbourhoods: world.neighbourhoods.map((n) =>
      n === plate ? build(n, found) : n,
    ),
  }
}

interface Grid {
  minX: number
  minZ: number
  nx: number
  nz: number
}

function search(world: World, plate: Neighbourhood): Spot | null {
  const { layout } = plate
  const minX = Math.min(...layout.tiles.map((t) => t.x))
  const minZ = Math.min(...layout.tiles.map((t) => t.z))
  const nx = Math.round(Math.max(...layout.tiles.map((t) => t.x)) - minX) + 1
  const nz = Math.round(Math.max(...layout.tiles.map((t) => t.z)) - minZ) + 1
  const grid: Grid = { minX, minZ, nx, nz }
  const index = (x: number, z: number) =>
    Math.round(z - minZ) * nx + Math.round(x - minX)
  const inside = (ix: number, iz: number) =>
    ix >= 0 && iz >= 0 && ix < nx && iz < nz

  // Tiles the airport cannot stand on, and what it costs to clear the others.
  const bad = new Uint8Array(nx * nz).fill(1)
  const cost = new Float64Array(nx * nz)
  for (const t of layout.tiles) {
    const gx = plate.x + t.x
    const gz = plate.z + t.z
    const awayFromEdges =
      Math.abs(gx) + 0.5 <= world.halfWidth - EDGE &&
      Math.abs(gz) + 0.5 <= world.halfDepth - EDGE
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
  for (const n of world.neighbourhoods) {
    for (const l of n.layout.lots) {
      const half = l.width / 2 + PLAZA_MARGIN + 1.5
      const [cx, cz] = [n.x + l.x - plate.x, n.z + l.z - plate.z]
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
  for (const s of layout.structures) {
    for (let di = 0; di < s.width; di++) {
      for (let dj = 0; dj < s.depth; dj++) {
        const ix = Math.round(s.x - (s.width - 1) / 2 + di - minX)
        const iz = Math.round(s.z - (s.depth - 1) / 2 + dj - minZ)
        if (inside(ix, iz)) cost[iz * nx + ix] += 4
      }
    }
  }

  // Sums over rectangles, in constant time.
  const sums = (values: ArrayLike<number>) => {
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
  const badIn = sums(bad)
  const costIn = sums(cost)

  const lots = world.neighbourhoods.flatMap((n) =>
    n.layout.lots.map((l) => ({ x: n.x + l.x, z: n.z + l.z, width: l.width })),
  )
  const target = runwayLength(layout.halfWidth, layout.halfDepth)
  for (let length = target; length >= MIN_LENGTH; length -= 2) {
    const l = airportLayout(length)
    const spots: Spot[] = []
    for (let turn = 0; turn < 4; turn++) {
      const [w, d] = turn % 2 === 0 ? [l.width, l.depth] : [l.depth, l.width]
      for (let iz = 0; iz + d <= nz; iz++) {
        for (let ix = 0; ix + w <= nx; ix++) {
          if (badIn(ix, iz, w, d) > 0) continue
          spots.push({ length, turn, ix, iz, cost: costIn(ix, iz, w, d) })
        }
      }
    }
    spots.sort(
      (a, b) =>
        a.cost - b.cost ||
        hash(`airport:${a.turn}:${a.ix}:${a.iz}`) -
          hash(`airport:${b.turn}:${b.ix}:${b.iz}`),
    )
    const spot = spots.find((s) => hidesNothing(plate, grid, s, lots))
    if (spot) return spot
  }
  return null
}

// The centre of the footprint of a spot, in the frame of the plate.
function centre(
  grid: Grid,
  spot: Spot,
): { x: number; z: number; w: number; d: number } {
  const l = airportLayout(spot.length)
  const [w, d] = spot.turn % 2 === 0 ? [l.width, l.depth] : [l.depth, l.width]
  return {
    x: grid.minX + spot.ix + (w - 1) / 2,
    z: grid.minZ + spot.iz + (d - 1) / 2,
    w,
    d,
  }
}

// Whether no monitored building (nor any lot) could be hidden, on screen, by what rises on a spot.
function hidesNothing(
  plate: Neighbourhood,
  grid: Grid,
  spot: Spot,
  lots: { x: number; z: number; width: number }[],
): boolean {
  const c = centre(grid, spot)
  return solids(airportLayout(spot.length)).every((o) => {
    const [dx, dz] = turned(spot.turn, o.x, o.z)
    const object = { ...o, x: plate.x + c.x + dx, z: plate.z + c.z + dz }
    return lots.every((lot) => !hides(object, lot))
  })
}

// The plate with the airport on it: what stood there makes way, and the ground is paved or levelled.
function build(plate: Neighbourhood, spot: Spot): Neighbourhood {
  const { layout } = plate
  const grid: Grid = {
    minX: Math.min(...layout.tiles.map((t) => t.x)),
    minZ: Math.min(...layout.tiles.map((t) => t.z)),
    nx: 0,
    nz: 0,
  }
  const c = centre(grid, spot)
  const l = airportLayout(spot.length)
  const within = (x: number, z: number, margin = 0) =>
    Math.abs(x - c.x) < c.w / 2 + margin && Math.abs(z - c.z) < c.d / 2 + margin
  const parts = paved(l)
  const isPaved = (t: Tile) => {
    const [lx, lz] = turned(4 - spot.turn, t.x - c.x, t.z - c.z)
    return parts.some(
      ([x0, x1, z0, z1]) => lx > x0 && lx < x1 && lz > z0 && lz < z1,
    )
  }
  // A tennis club goes whole, as a road through it would take it.
  const hit = (s: Structure) =>
    Math.abs(s.x - c.x) < (s.width + c.w) / 2 &&
    Math.abs(s.z - c.z) < (s.depth + c.d) / 2
  const club = (s: Structure) => s.kind === 'tennis' || s.kind === 'clubhouse'
  const clubHit = layout.structures.some((s) => club(s) && hit(s))
  const goes = (s: Structure) => hit(s) || (clubHit && club(s))
  const removed = layout.structures.filter(goes)
  const under = (t: Tile) =>
    removed.some(
      (s) =>
        Math.abs(t.x - s.x) < s.width / 2 && Math.abs(t.z - s.z) < s.depth / 2,
    )
  const tiles = layout.tiles.map((t): Tile => {
    if (within(t.x, t.z)) {
      if (isPaved(t)) return { ...t, kind: 'plaza', top: PLAZA_TOP }
      if (t.kind === 'hill' || t.kind === 'path' || t.kind === 'court') {
        return { ...t, kind: 'grass', top: GRASS_TOP }
      }
      return t
    }
    return under(t) ? { ...t, kind: 'grass', top: GRASS_TOP } : t
  })
  const free = (p: { x: number; z: number }) => !within(p.x, p.z, 0.5)
  const airport: Structure = {
    kind: 'airport',
    x: c.x,
    y: PLAZA_TOP,
    z: c.z,
    width: c.w,
    depth: c.d,
    height: TOWER_HEIGHT,
    turn: spot.turn,
  }
  return {
    ...plate,
    layout: {
      ...layout,
      tiles,
      trees: layout.trees.filter(free),
      flowers: layout.flowers.filter(free),
      reeds: layout.reeds.filter(free),
      rocks: layout.rocks.filter(free),
      umbrellas: layout.umbrellas.filter(free),
      structures: [...layout.structures.filter((s) => !goes(s)), airport],
    },
  }
}
