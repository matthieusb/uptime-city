// Pure city layout, independent of three.js. Units are world tiles: the
// ground is made of 1x1 tiles centered on integer coordinates.
//
// Each building is a host: a ground floor for the host itself, and one floor
// per service stacked on top of it.
//
// The town has hills at the back (-Z), and a straight road along X lined
// with buildings in front of them; a coastal town also has a beach and the sea in
// front (+Z, towards the camera). Bigger cities get more roads further
// inland. What grows around the roads follows the biomes of each tile (see
// biomes.ts). Narrow paths wind from the roads into the town, with houses
// along them. The roads of the whole map are laid out in world.ts.
//
// No building may hide another. The isometric camera looks along the
// (-1, -1) diagonal, so a building can only hide what is behind it in its
// own screen column. The buildings of a road each take their own column, and
// each road is far enough behind the previous one that the tallest building
// of the previous road cannot hide it. Trees and parasols that would stand in front of a building are left
// out.

import { seeded } from './seed'
import { biomeAt, treeFor, weightOf, type Biome, type Biomes } from './biomes'
import type { TrackPiece } from './tracks'

const SQRT3 = Math.sqrt(3)

// Width and depth of a building without services, and of decoration.
export const BUILDING_WIDTH = 3.2
// Each service widens a building by this much, and each full group of
// SERVICES_PER_BONUS services by BONUS_WIDTH more, up to the widest.
const WIDTH_PER_SERVICE = 0.3
const SERVICES_PER_BONUS = 5
const BONUS_WIDTH = 0.8
export const MAX_BUILDING_WIDTH = 9
// Half the width of the widest building on screen, in the isometric view.
export const HALF_SCREEN_WIDTH = MAX_BUILDING_WIDTH / Math.SQRT2
// A normal storey, next to a 3.2 tiles wide building.
export const FLOOR_HEIGHT = 1.8
// Taller, so that a host without services still reads as a building.
export const GROUND_HEIGHT = 2.2

// Margin on screen between two buildings of a road.
const SLOT_MARGIN = 1.05
// Screen distance between the centers of the widest buildings of a road.
const SLOT = MAX_BUILDING_WIDTH * Math.SQRT2 + SLOT_MARGIN
// Distance from the road center line to the side of a building.
const SIDE_GAP = 2.2
// Half the side of the paved square around a building, past its walls.
export const PLAZA_MARGIN = 0.6
// Buildings per road, before the city adds a road further inland.
const ROW_MAX = 6
// Least distance between two roads, along Z.
const ROW_GAP = 26
// Shape of the winding roads.
const WAVELENGTH = 7
// Distance from the road center line to the middle of a lane.
const LANE = 0.3
// Grass on each side of the outermost buildings.
const X_MARGIN = 1.5
const MIN_HALF_WIDTH = 5
// Tiles from the road at the back to the edge of the ground, and from the
// front road to the other edge.
const BACK = 9
const FRONT = 12

export type TileKind =
  | 'water'
  | 'shallow'
  | 'sand'
  | 'grass'
  | 'hill'
  | 'road'
  | 'plaza'
  | 'pond'
  | 'crater'
  // A patch of snow, a frozen lake and a tennis court.
  | 'snow'
  | 'ice'
  | 'court'
  // A narrow path, and the island in the middle of a roundabout.
  | 'path'
  | 'island'
  // The ground under the railway.
  | 'track'

// Height of the top of each kind of tile. Hills add HILL_STEP per level.
const TOPS: Record<TileKind, number> = {
  water: -0.15,
  shallow: -0.1,
  pond: -0.08,
  ice: -0.03,
  sand: 0.02,
  grass: 0.05,
  hill: 0.05,
  road: 0.06,
  path: 0.06,
  snow: 0.07,
  court: 0.08,
  plaza: 0.09,
  island: 0.16,
  track: 0.06,
  crater: -0.12,
}
// Height of the top of a road.
export const ROAD_TOP = TOPS.road
// Height of the bottom of a crater.
export const CRATER_TOP = TOPS.crater
// Height of the top of plain ground, and of the island of a roundabout.
export const GRASS_TOP = TOPS.grass
export const ISLAND_TOP = TOPS.island
// Height of the top of paved ground (plazas, the airport).
export const PLAZA_TOP = TOPS.plaza
export const HILL_STEP = 0.5
// Hills rise this high, and mountains higher.
const MAX_HILL_LEVEL = 4
const MAX_MOUNTAIN_LEVEL = 6

export type TreeKind =
  'oak' | 'pine' | 'fruit' | 'palm' | 'fir' | 'cactus' | 'shrub'

// Height of each kind of tree at scale 1. Keep in sync with Scenery.tsx.
export const TREE_HEIGHTS: Record<TreeKind, number> = {
  oak: 1.5,
  pine: 1.6,
  fruit: 1.4,
  palm: 2,
  fir: 1.9,
  cactus: 1.3,
  shrub: 0.55,
}

export type PatchKind =
  | 'forest'
  | 'orchard'
  | 'garden'
  | 'pond'
  | 'firs'
  | 'snowfield'
  | 'lake'
  | 'cacti'
  | 'shrubs'

// The parks of a town, by the biome at their middle; the first kind is the
// one to fall back on.
const PATCHES: Record<Biome, PatchKind[]> = {
  forest: ['forest', 'forest', 'orchard', 'garden', 'pond'],
  city: ['garden', 'orchard', 'forest', 'pond'],
  coastal: ['garden', 'orchard', 'forest', 'pond'],
  mountain: ['firs', 'firs', 'snowfield', 'lake'],
  tundra: ['shrubs', 'snowfield', 'lake'],
  desert: ['cacti'],
}
// The water of each biome, frozen in the cold, and how many a town may have.
const WATER: Record<Biome, PatchKind | null> = {
  forest: 'pond',
  city: 'pond',
  coastal: 'pond',
  mountain: 'lake',
  tundra: 'lake',
  desert: null,
}
const WATER_COUNT: Record<Biome, number> = {
  forest: 2,
  city: 1,
  coastal: 1,
  mountain: 1,
  tundra: 1,
  desert: 0,
}
// How many lone trees and rocks, per tile, stand in each biome.
const TREE_RATE: Record<Biome, number> = {
  forest: 0.04,
  city: 0.008,
  coastal: 0.008,
  mountain: 0.03,
  tundra: 0.03,
  desert: 0.035,
}
const ROCK_RATE: Record<Biome, number> = {
  forest: 0.004,
  city: 0,
  coastal: 0,
  mountain: 0.02,
  tundra: 0.012,
  desert: 0.012,
}
// Where the town is built up with houses, shops, car parks and courts.
const builtUp = (biome: Biome) => biome === 'city' || biome === 'coastal'

// What stands around the monitored buildings, not monitored, and smaller
// than a lot: houses, shops, car parks and tennis courts in the cities, and
// kiosks on the beach. Width along X and depth along Z, in tiles.
export type StructureKind =
  | 'house'
  | 'shop'
  | 'parking'
  | 'tennis'
  | 'clubhouse'
  | 'stadium'
  | 'kiosk'
  // The airport, placed on the biggest plate by `placeAirport` (airport.ts).
  | 'airport'

export interface Structure {
  kind: StructureKind
  x: number
  y: number
  z: number
  width: number
  depth: number
  height: number
  // Quarter turns of the airport, 0 to 3 (its runway runs along X for 0 and 2).
  turn?: number
}

const STRUCTURES: Record<
  StructureKind,
  { width: number; depth: number; height: number; ground?: TileKind }
> = {
  house: { width: 2, depth: 2, height: 1.4 },
  shop: { width: 3, depth: 2, height: 1.5, ground: 'plaza' },
  parking: { width: 3, depth: 3, height: 0.55, ground: 'plaza' },
  tennis: { width: 3, depth: 5, height: 0.4, ground: 'court' },
  clubhouse: { width: 3, depth: 2, height: 1.3, ground: 'plaza' },
  stadium: { width: 9, depth: 7, height: 2.1, ground: 'plaza' },
  // Its size is chosen by `placeAirport`.
  airport: { width: 0, depth: 0, height: 3.5 },
  kiosk: { width: 2, depth: 1, height: 1.15 },
}
// The share of the houses that come up away from the paths that get built.
const HOUSE_DENSITY = 0.1
// How often each structure of a city comes up.
const CITY_STRUCTURES: [StructureKind, number][] = [
  ['house', 5],
  ['shop', 2],
  ['parking', 2],
]
// A tile has one tennis club at most: 2 to 4 courts side by side, touching,
// with a little club house against the front of the first one.
const MAX_COURTS = 4
// The chance that a city tile has its football stadium, one at most.
const STADIUM_CHANCE = 0.6

const FLOWER_COLORS = ['#ff5d8f', '#ffd23f', '#c77dff', '#ff8c42', '#4cc9f0']
const UMBRELLA_COLORS = ['#e63946', '#ffb703', '#219ebc', '#f1f1f1', '#06d6a0']

// What decorates a neighbourhood without being monitored.
export type DecorKind = 'supermarket' | 'parking' | 'houses'

// How tall each kind of decoration is.
const DECOR_HEIGHTS: Record<DecorKind, number> = {
  supermarket: 2.2,
  parking: 0.6,
  houses: 1.6,
}

// A building to lay out: a host with the number of services it runs, or
// some decoration.
export interface HostSpec {
  id: string
  services: number
  decor?: DecorKind
}

export interface Lot {
  id: string
  x: number
  z: number
  // The ground floor and one floor per service, none for decoration.
  floors: number
  height: number
  // Width and depth.
  width: number
  decor?: DecorKind
}

export interface Tile {
  x: number
  z: number
  kind: TileKind
  top: number
  biome: Biome
}

// A road along X: its center line is at roadZ(road, x), straight when its
// amplitude is 0. A vertical road runs along Z the same way, with X and Z
// swapped: its center line is at x = roadZ(road, z), from z = xMin to xMax.
export interface Road {
  z: number
  amplitude: number
  phase: number
  // Where cars turn around.
  xMin: number
  xMax: number
  vertical?: boolean
}

export interface Patch {
  x: number
  z: number
  kind: PatchKind
  // Number of tiles it covers.
  tiles: number
}

export interface Tree {
  x: number
  // Height of the ground it stands on.
  y: number
  z: number
  scale: number
  kind: TreeKind
  // Height of its top.
  height: number
}

export interface Flower {
  x: number
  y: number
  z: number
  color: string
}

export interface Point {
  x: number
  y: number
  z: number
}

export interface Umbrella extends Point {
  color: string
}

export interface CityLayout {
  lots: Lot[]
  tiles: Tile[]
  roads: Road[]
  patches: Patch[]
  trees: Tree[]
  flowers: Flower[]
  reeds: Point[]
  rocks: Point[]
  umbrellas: Umbrella[]
  structures: Structure[]
  // The middles of the roundabouts.
  roundabouts: Point[]
  // The part of the railway on this plate, if any.
  tracks: TrackPiece[]
  // Planks of the pier, one per tile.
  pier: Point[]
  // Sailing routes, followed like roads.
  boats: Road[]
  // Half sizes of the ground, along X and Z.
  halfWidth: number
  halfDepth: number
  biomes: Biomes
}

export function hash(plain: string): number {
  const text = seeded(plain)
  // FNV-1a
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

// mulberry32: small seeded generator, so the city looks the same on reload.
export function seededRandom(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Stable random value in [0, 1) for a tile.
function tileNoise(salt: string, i: number, j: number): number {
  return seededRandom(hash(`${salt}:${i},${j}`))()
}

// Floor 0 is the ground floor, the host itself.
export function floorHeight(floor: number): number {
  return floor === 0 ? GROUND_HEIGHT : FLOOR_HEIGHT
}

export function floorBase(floor: number): number {
  return floor === 0 ? 0 : GROUND_HEIGHT + (floor - 1) * FLOOR_HEIGHT
}

export function buildingHeight(floors: number): number {
  return floorBase(floors)
}

// The more services, the wider.
export function buildingWidth(services: number): number {
  return Math.min(
    MAX_BUILDING_WIDTH,
    BUILDING_WIDTH +
      WIDTH_PER_SERVICE * services +
      BONUS_WIDTH * Math.floor(services / SERVICES_PER_BONUS),
  )
}

function specWidth({ services, decor }: HostSpec): number {
  return decor ? BUILDING_WIDTH : buildingWidth(services)
}

function specHeight({ services, decor }: HostSpec): number {
  return decor ? DECOR_HEIGHTS[decor] : buildingHeight(1 + services)
}

// Distance from a road to the next one behind it, so that its buildings, up
// to this height, cannot hide the next road's. Two buildings whose screen
// columns overlap are at most 2 building widths and a margin apart sideways,
// and they may stand on the facing sides of two roads.
function rowGap(height: number): number {
  const reach = (height * SQRT3 + 4 * HALF_SCREEN_WIDTH + 1) / Math.SQRT2
  return Math.max(
    ROW_GAP,
    Math.ceil(reach + 2 * (MAX_BUILDING_WIDTH / 2 + SIDE_GAP)),
  )
}

export function roadZ(road: Road, x: number): number {
  return road.z + road.amplitude * Math.sin(x / WAVELENGTH + road.phase)
}

// Position and heading at fraction t of a round trip on a road: down the
// front lane towards +X (or +Z), then back up the other lane. The heading is
// the rotation around Y that points +X along the direction of travel.
export function carPoint(
  road: Road,
  t: number,
): { x: number; z: number; heading: number } {
  const u = (((t % 1) + 1) % 1) * 2
  const forward = u < 1
  const span = road.xMax - road.xMin
  const along = forward ? road.xMin + u * span : road.xMax - (u - 1) * span
  const across = roadZ(road, along) + (forward ? LANE : -LANE)
  const slope =
    (road.amplitude / WAVELENGTH) * Math.cos(along / WAVELENGTH + road.phase)
  // Where it heads, along X then Z.
  const [dx, dz] = forward ? [1, slope] : [-1, -slope]
  if (road.vertical) {
    return { x: across, z: along, heading: Math.atan2(-dx, dz) }
  }
  return { x: along, z: across, heading: Math.atan2(-dz, dx) }
}

// Whether an object at (x, z) could cover part of a building on screen.
export function hides(
  object: { x: number; z: number; height: number; radius: number },
  lot: { x: number; z: number; width: number },
): boolean {
  const half = lot.width / Math.SQRT2
  const sideways = Math.abs(object.x - object.z - (lot.x - lot.z)) / Math.SQRT2
  const inFront = (object.x + object.z - (lot.x + lot.z)) / Math.SQRT2
  return (
    sideways < half + object.radius &&
    inFront > -object.radius &&
    inFront < object.height * SQRT3 + half + object.radius
  )
}

// Lays the buildings along their roads, each in its own screen column.
function placeBuildings(hosts: HostSpec[], roads: Road[]): Lot[] {
  const perRow = Math.ceil(hosts.length / roads.length)
  // Screen column of the center of each building, relative to its road: side
  // by side, each as wide as it is, the row centered.
  const columns: number[] = []
  for (let first = 0; first < hosts.length; first += perRow) {
    const row = hosts.slice(first, first + perRow)
    const slots = row.map((h) => specWidth(h) * Math.SQRT2 + SLOT_MARGIN)
    let edge = -slots.reduce((a, b) => a + b, 0) / 2
    slots.forEach((slot) => {
      columns.push(edge + slot / 2)
      edge += slot
    })
  }
  return hosts.map((spec, index) => {
    const { id } = spec
    const row = Math.floor(index / perRow)
    const road = roads[row]
    const width = specWidth(spec)
    const SIDE = width / 2 + SIDE_GAP
    const column = columns[index]
    const side = seededRandom(hash(`side:${id}`))() < 0.5 ? -1 : 1
    // x - z must match the column while z follows the winding road: the
    // road is gentle enough for this to converge quickly.
    let x = column * Math.SQRT2 + side * SIDE
    let z = road.z
    for (let n = 0; n < 30; n++) {
      z = roadZ(road, x) + side * SIDE
      x = column * Math.SQRT2 + z - road.z
    }
    if (spec.decor) {
      return {
        id,
        x,
        z,
        floors: 0,
        height: specHeight(spec),
        width,
        decor: spec.decor,
      }
    }
    const floors = 1 + spec.services
    return { id, x, z, floors, height: buildingHeight(floors), width }
  })
}

// A floor label is about this tall on screen, in tiles.
const LABEL_HALF_HEIGHT = 0.8
// Labels can reach this far from their building on screen, in tiles.
const LABEL_REACH = 2 * SLOT
// Where the camera's pitch of 30° puts a height and a depth on screen.
const PITCH_COS = Math.cos(Math.PI / 6)
const PITCH_SIN = Math.sin(Math.PI / 6)

// Which side of its building, on screen, the labels of the services of each
// building go to: the one where fewer other buildings are in the way. Ties
// go right.
export function serviceLabelSides(lots: Lot[]): Map<string, 'left' | 'right'> {
  const column = (l: Lot) => (l.x - l.z) / Math.SQRT2
  const depth = (l: Lot) => (l.x + l.z) / Math.SQRT2
  const sides = new Map<string, 'left' | 'right'>()
  for (const lot of lots) {
    const hits = { left: 0, right: 0 }
    for (let floor = 1; floor < lot.floors; floor++) {
      const middle = floorBase(floor) + floorHeight(floor) / 2
      const y = middle * PITCH_COS - depth(lot) * PITCH_SIN
      for (const other of lots) {
        if (other === lot) continue
        const across = column(other) - column(lot)
        if (
          Math.abs(across) <= lot.width / Math.SQRT2 ||
          Math.abs(across) > LABEL_REACH
        ) {
          continue
        }
        // The vertical span of the other building on screen.
        // A square seen along its diagonal is as deep as it is wide.
        const reach = other.width / Math.SQRT2
        const low = -(depth(other) + reach) * PITCH_SIN
        const high =
          other.height * PITCH_COS - (depth(other) - reach) * PITCH_SIN
        if (y + LABEL_HALF_HEIGHT > low && y - LABEL_HALF_HEIGHT < high) {
          // Hiding a monitored building is worse than hiding decoration, and the
          // nearer it is, the shorter the labels it takes to reach it.
          hits[across > 0 ? 'right' : 'left'] +=
            LABEL_REACH + 1 - Math.abs(across)
        }
      }
    }
    sides.set(lot.id, hits.left < hits.right ? 'left' : 'right')
  }
  return sides
}

const mod = (a: number, b: number) => ((a % b) + b) % b

const key = (t: { x: number; z: number }) => `${t.x},${t.z}`

// Where the beach and the sea begin at x, in tiles from the front edge of
// the ground, the more coastal the front edge, the wider: none when it is
// not coastal at all.
function coastline(x: number, coast: number): { sand: number; sea: number } {
  if (coast < 0.05) return { sand: -Infinity, sea: -Infinity }
  const shore =
    5.5 +
    0.8 * Math.sin(x / 5.3 + 0.7) +
    0.5 * Math.sin(x / 2.1) +
    (1 - coast) * 9
  const sea = shore + 2.6 + 0.6 * Math.sin(x / 3.7 + 2)
  return { sand: FRONT - shore, sea: FRONT - sea }
}

// The longest run of whole x from `from` to `to` where `wet` holds.
function longestRun(
  from: number,
  to: number,
  wet: (x: number) => boolean,
): [number, number] | null {
  let best: [number, number] | null = null
  let start: number | null = null
  for (let x = from; x <= to + 1; x++) {
    if (x <= to && wet(x)) {
      start ??= x
    } else if (start !== null) {
      if (!best || x - 1 - start > best[1] - best[0]) best = [start, x - 1]
      start = null
    }
  }
  return best
}

// The chance that a monitored building has a path running along it.
const PATH_BY_BUILDING = 0.15
// Paths go straight for a few tiles before they may turn.
const PATH_RUN = 3
const PATH_TURN = 0.3

// Lays a path one tile wide, from `start` towards `dir`, turning left or
// right now and then, on the tiles `walkable` takes. It stops where it meets
// a road or another path, before it would run along one, and where it can
// go no further. Too short, it is not laid at all.
function layPath({
  start,
  dir,
  tileAt,
  walkable,
  random,
  length,
}: {
  start: Tile
  dir: [number, number]
  tileAt: (x: number, z: number) => Tile | undefined
  walkable: (tile: Tile) => boolean
  random: () => number
  length: number
}): Tile[] {
  if (!walkable(start)) return []
  const taken = new Set([key(start)])
  const way = [start]
  const paved = (t?: Tile) =>
    !!t && (t.kind === 'road' || t.kind === 'path' || taken.has(key(t)))
  let [dx, dz] = dir
  let tile = start
  for (let run = 1; way.length < length; run++) {
    if (run > PATH_RUN && random() < PATH_TURN) {
      ;[dx, dz] = random() < 0.5 ? [-dz, dx] : [dz, -dx]
      run = 1
    }
    const next = tileAt(tile.x + dx, tile.z + dz)
    if (!next || paved(next) || !walkable(next)) break
    // Never along another path or a road, nor back along itself.
    const sides = [
      tileAt(next.x - dz, next.z + dx),
      tileAt(next.x + dz, next.z - dx),
      tileAt(next.x + dx, next.z + dz),
    ]
    if (sides.some((t) => t?.kind === 'path' || (t && taken.has(key(t))))) {
      break
    }
    way.push(next)
    taken.add(key(next))
    tile = next
    // A road ahead or to a side: it joins it.
    if (sides.some((t) => t?.kind === 'road')) break
  }
  if (way.length < 4) return []
  for (const t of way) Object.assign(t, { kind: 'path', top: TOPS.path })
  return way
}

// Where a house of 2 by 2 tiles may stand against each side of each tile of
// the paths: the corner with the smallest x and z.
function besidePaths(paths: Tile[]): [number, number][] {
  return paths.flatMap(({ x, z }): [number, number][] => [
    [x + 1, z],
    [x + 1, z - 1],
    [x - 2, z],
    [x - 2, z - 1],
    [x, z + 1],
    [x - 1, z + 1],
    [x, z - 2],
    [x - 1, z - 2],
  ])
}

// Puts structures down, each on free tiles that `fits` takes, with `margin`
// tiles of room around it, where they hide no building.
function placeStructures({
  corners,
  tileAt,
  used,
  fits,
  kinds,
  attempts,
  random,
  clear,
  margin = 1,
  club = false,
  stadium = false,
  dense = false,
}: {
  corners: Tile[]
  tileAt: (x: number, z: number) => Tile | undefined
  used: Set<string>
  fits: (tile: Tile) => boolean
  kinds: [StructureKind, number][]
  attempts: number
  random: () => number
  clear: (object: {
    x: number
    z: number
    height: number
    radius: number
  }) => boolean
  margin?: number
  // Whether to build the tennis club, one at most.
  club?: boolean
  // Whether to build the football stadium, one at most.
  stadium?: boolean
  // Whether to build every house that comes up.
  dense?: boolean
}): Structure[] {
  const structures: Structure[] = []
  const total = kinds.reduce((sum, [, w]) => sum + w, 0)
  // The free tiles of a structure at `corner`, or null if any is not.
  const footprintOf = (
    kind: StructureKind,
    cx: number,
    cz: number,
    height = STRUCTURES[kind].height,
    ok = fits,
  ) => {
    const { width, depth } = STRUCTURES[kind]
    const tiles: Tile[] = []
    for (let di = 0; di < width; di++) {
      for (let dj = 0; dj < depth; dj++) {
        const tile = tileAt(cx + di, cz + dj)
        if (!tile || !ok(tile) || used.has(key(tile))) return null
        tiles.push(tile)
      }
    }
    const x = cx + (width - 1) / 2
    const z = cz + (depth - 1) / 2
    return clear({ x, z, height, radius: Math.hypot(width, depth) / 2 })
      ? tiles
      : null
  }
  const build = (
    kind: StructureKind,
    cx: number,
    cz: number,
    tiles: Tile[],
    height = STRUCTURES[kind].height,
  ) => {
    const { width, depth, ground } = STRUCTURES[kind]
    if (ground) {
      for (const tile of tiles) {
        Object.assign(tile, { kind: ground, top: TOPS[ground] })
      }
    }
    structures.push({
      kind,
      x: cx + (width - 1) / 2,
      y: Math.max(...tiles.map((t) => t.top)),
      z: cz + (depth - 1) / 2,
      width,
      depth,
      height,
    })
  }
  // The tennis club, first, while there is room: as many courts as fit.
  const court = STRUCTURES.tennis
  const house = STRUCTURES.clubhouse
  if (club) {
    for (let a = 0; a < 60 && structures.length === 0; a++) {
      const corner = corners[Math.floor(random() * corners.length)]
      if (!corner) break
      for (let n = MAX_COURTS - Math.floor(random() * 2); n >= 2; n--) {
        const parts: [StructureKind, number, number, Tile[]][] = []
        for (let c = 0; c < n; c++) {
          const cx = corner.x + c * court.width
          const tiles = footprintOf('tennis', cx, corner.z)
          if (tiles) parts.push(['tennis', cx, corner.z, tiles])
        }
        const front = corner.z + court.depth
        const tiles = footprintOf('clubhouse', corner.x, front)
        if (parts.length < n || !tiles) continue
        parts.push(['clubhouse', corner.x, front, tiles])
        for (const [kind, cx, cz, own] of parts) build(kind, cx, cz, own)
        for (let di = -margin; di < n * court.width + margin; di++) {
          for (
            let dj = -margin;
            dj < court.depth + house.depth + margin;
            dj++
          ) {
            used.add(`${corner.x + di},${corner.z + dj}`)
          }
        }
        break
      }
    }
  }
  // The football stadium, if there is room left for it.
  if (stadium && corners.length > 0 && random() < STADIUM_CHANCE) {
    for (let a = 0; a < 80; a++) {
      const corner = corners[Math.floor(random() * corners.length)]
      const tiles = footprintOf('stadium', corner.x, corner.z)
      if (!tiles) continue
      build('stadium', corner.x, corner.z, tiles)
      const { width, depth } = STRUCTURES.stadium
      for (let di = -margin; di < width + margin; di++) {
        for (let dj = -margin; dj < depth + margin; dj++) {
          used.add(`${corner.x + di},${corner.z + dj}`)
        }
      }
      break
    }
  }
  for (let a = 0; a < attempts && corners.length > 0; a++) {
    const corner = corners[Math.floor(random() * corners.length)]
    let roll = random() * total
    const kind = kinds.find(([, w]) => (roll -= w) < 0)?.[0] ?? kinds[0][0]
    // Half of the houses that come up are left out.
    if (kind === 'house' && !dense && random() < 1 - HOUSE_DENSITY) continue
    const { width, depth } = STRUCTURES[kind]
    const tiles = footprintOf(kind, corner.x, corner.z)
    if (!tiles) continue
    build(kind, corner.x, corner.z, tiles)
    for (let di = -margin; di < width + margin; di++) {
      for (let dj = -margin; dj < depth + margin; dj++) {
        used.add(`${corner.x + di},${corner.z + dj}`)
      }
    }
  }
  return structures
}

export function cityLayout(
  hosts: HostSpec[],
  biomes: Biomes = { main: 'city' },
  // At least this wide, for the ground to fit next to others.
  minHalfWidth = MIN_HALF_WIDTH,
  // At least this deep, extending the hills at the back. The front is always
  // at the same distance from the front road, so that plates line up.
  minHalfDepth = 0,
): CityLayout {
  const ids = hosts.map((h) => h.id)
  // Raw coordinates: the front road runs along z = 0. Everything is moved
  // along Z at the end, to center the ground.
  const rowCount = Math.max(1, Math.ceil(ids.length / ROW_MAX))
  const perRow = Math.ceil(ids.length / rowCount)
  const roads: Road[] = []
  for (let r = 0, z = 0; r < rowCount; r++) {
    // Straight, between two rows of tiles.
    roads.push({ z: z - 0.5, amplitude: 0, phase: 0, xMin: 0, xMax: 0 })
    const tallest = Math.max(
      0,
      ...hosts.slice(r * perRow, (r + 1) * perRow).map(specHeight),
    )
    z -= rowGap(tallest)
  }
  const lots = placeBuildings(hosts, roads)

  const xMax = Math.max(
    minHalfWidth,
    Math.ceil(
      Math.max(0, ...lots.map((l) => Math.abs(l.x) + l.width / 2 - 0.6)) +
        1 +
        X_MARGIN,
    ),
  )
  const xMin = -xMax
  for (const road of roads) {
    road.xMin = xMin + 1
    road.xMax = xMax - 1
  }
  const backZ = roads[roads.length - 1].z
  // Wide buildings stand further from their road.
  const extra = Math.max(0, ...lots.map((l) => l.width - BUILDING_WIDTH))
  const zMax = FRONT
  // An even number of tiles each side of the center.
  let zMin = Math.floor(backZ - BACK - extra)
  if (mod(zMax - zMin, 2) === 1) zMin--
  while ((zMax - zMin) / 2 + 0.5 < minHalfDepth) zMin -= 2

  // How much of a biome there is at a tile, and the biome of the tile.
  const u = (i: number) => (i - xMin) / (xMax - xMin)
  const v = (j: number) => (j - zMin) / (zMax - zMin)
  const weight = (biome: Biome, i: number, j: number) =>
    weightOf(biomes, biome, u(i), v(j))
  const biomeOf = (i: number, j: number) =>
    biomeAt(biomes, u(i), v(j), tileNoise('biome', i, j))

  // The sea, where the front edge is coastal, narrowing away elsewhere.
  const coastAt = (x: number) => coastline(x, weight('coastal', x, zMax))
  const shore = (x: number) => FRONT - coastAt(x).sand
  const sea = (x: number) => FRONT - coastAt(x).sea
  const hills = (x: number) =>
    backZ -
    5.5 -
    extra +
    1.2 * Math.sin(x / 6.1 + 1.3) +
    0.6 * Math.sin(x / 2.9)

  // Terrain
  const rows = zMax - zMin + 1
  const grid: Tile[] = []
  const at = (i: number, j: number): Tile | undefined =>
    i >= xMin && i <= xMax && j >= zMin && j <= zMax
      ? grid[(i - xMin) * rows + (j - zMin)]
      : undefined
  const set = (i: number, j: number, kind: TileKind) => {
    const tile = at(i, j)
    if (tile) Object.assign(tile, { kind, top: TOPS[kind] })
  }
  for (let i = xMin; i <= xMax; i++) {
    for (let j = zMin; j <= zMax; j++) {
      let kind: TileKind = 'grass'
      let top = TOPS.grass
      if (j >= sea(i)) {
        kind = j < sea(i) + 1.5 ? 'shallow' : 'water'
        top = TOPS[kind]
      } else if (j >= shore(i)) {
        kind = 'sand'
        top = TOPS.sand
      } else if (j < hills(i)) {
        // Mountains are steeper and higher, desert dunes and the tundra low.
        const mountain = weight('mountain', i, j)
        const cap = Math.round(
          MAX_HILL_LEVEL +
            (MAX_MOUNTAIN_LEVEL - MAX_HILL_LEVEL) * mountain -
            2 * weight('desert', i, j) -
            weight('tundra', i, j),
        )
        const level = Math.min(
          cap,
          Math.floor(
            (hills(i) - j) / (2 - 1.2 * mountain) +
              0.5 * tileNoise('hill', i, j),
          ),
        )
        if (level > 0) {
          kind = 'hill'
          top = TOPS.hill + HILL_STEP * level
        }
      }
      grid.push({ x: i, z: j, kind, top, biome: biomeOf(i, j) })
    }
  }

  // Roads are 2 tiles wide, lots are paved and joined to their road.
  const roadTile = (road: Road, i: number) => Math.ceil(roadZ(road, i) - 1)
  for (const road of roads) {
    for (let i = xMin; i <= xMax; i++) {
      set(i, roadTile(road, i), 'road')
      set(i, roadTile(road, i) + 1, 'road')
    }
  }
  lots.forEach((lot, index) => {
    const road = roads[Math.floor(index / perRow)]
    const PLAZA = lot.width / 2 + PLAZA_MARGIN
    for (
      let i = Math.round(lot.x - PLAZA);
      i <= Math.round(lot.x + PLAZA);
      i++
    ) {
      for (
        let j = Math.round(lot.z - PLAZA);
        j <= Math.round(lot.z + PLAZA);
        j++
      ) {
        set(i, j, 'plaza')
      }
    }
    for (const i of [Math.round(lot.x - 0.5), Math.round(lot.x + 0.5)]) {
      const behind = lot.z < roadZ(road, lot.x)
      const from = behind
        ? Math.round(lot.z + PLAZA) + 1
        : roadTile(road, i) + 2
      const to = behind ? roadTile(road, i) - 1 : Math.round(lot.z - PLAZA) - 1
      for (let j = from; j <= to; j++) set(i, j, 'plaza')
    }
  })

  // Nothing grows on or right next to roads and lots.
  const blocked = new Set<string>()
  for (const tile of grid) {
    if (tile.kind !== 'road' && tile.kind !== 'plaza') continue
    for (let di = -1; di <= 1; di++) {
      for (let dj = -1; dj <= 1; dj++) {
        blocked.add(`${tile.x + di},${tile.z + dj}`)
      }
    }
  }

  // Leave out whatever could hide a building.
  const clear = (object: {
    x: number
    z: number
    height: number
    radius: number
  }) => lots.every((lot) => !hides(object, lot))

  const trees: Tree[] = []
  const flowers: Flower[] = []
  const reeds: Point[] = []
  const rocks: Point[] = []
  const umbrellas: Umbrella[] = []
  const patches: Patch[] = []
  const random = seededRandom(hash(`town:${ids.join('|')}`))
  const jitter = (spread: number) => (random() - 0.5) * spread
  // Each tree as its biome grows it.
  const plant = (tile: Tile, wanted: TreeKind, spread = 0.5) => {
    const kind = treeFor(tile.biome, wanted, random())
    const scale = 0.8 + random() * 0.45
    trees.push({
      x: tile.x + jitter(spread),
      y: tile.top,
      z: tile.z + jitter(spread),
      scale,
      kind,
      height: tile.top + TREE_HEIGHTS[kind] * scale,
    })
  }
  const rock = (tile: Tile) =>
    rocks.push({
      x: tile.x + jitter(0.4),
      y: tile.top,
      z: tile.z + jitter(0.4),
    })

  // Paths, from the roads into the town, mostly where it is built up. They
  // keep away from the monitored buildings, but for a few.
  const byPath = new Set(
    lots.filter((l) => !l.decor && random() < PATH_BY_BUILDING),
  )
  const nearLot = new Set<string>()
  for (const lot of lots) {
    if (lot.decor || byPath.has(lot)) continue
    const reach = lot.width / 2 + PLAZA_MARGIN + 1
    for (
      let i = Math.round(lot.x - reach);
      i <= Math.round(lot.x + reach);
      i++
    ) {
      for (
        let j = Math.round(lot.z - reach);
        j <= Math.round(lot.z + reach);
        j++
      ) {
        nearLot.add(`${i},${j}`)
      }
    }
  }
  const walkable = (t: Tile) =>
    (t.kind === 'grass' || t.kind === 'snow') &&
    !nearLot.has(key(t)) &&
    t.z > hills(t.x) &&
    t.z < shore(t.x) - 1
  // A path starts on the tile next to a road, on one side, and leaves it.
  const fromRoad = (road: Road, x: number, side: 1 | -1) => {
    const row = roadTile(road, x) + (side < 0 ? -1 : 2)
    const start = at(x, row)
    return start
      ? layPath({
          start,
          dir: [0, side],
          tileAt: at,
          walkable,
          random,
          length: 10 + Math.floor(random() * 16),
        })
      : []
  }
  const paths: Tile[] = []
  for (const lot of byPath) {
    const road = roads[Math.floor(lots.indexOf(lot) / perRow)]
    const reach = lot.width / 2 + PLAZA_MARGIN + 1
    const x = Math.round(lot.x + (random() < 0.5 ? -reach : reach))
    paths.push(...fromRoad(road, x, lot.z < road.z ? -1 : 1))
  }
  const builtUpLand = grid.filter((t) => t.kind === 'grass' && builtUp(t.biome))
  const wanted = Math.round(builtUpLand.length / 140) + (random() < 0.5 ? 1 : 0)
  for (let a = 0, laid = 0; a < 10 * wanted && laid < wanted; a++) {
    const road = roads[Math.floor(random() * roads.length)]
    const x = xMin + 2 + Math.floor(random() * (xMax - xMin - 3))
    const way = fromRoad(road, x, random() < 0.5 ? -1 : 1)
    if (way.length > 0) laid++
    paths.push(...way)
  }

  // The town, between the roads.
  const zone = grid.filter(
    (t) =>
      t.kind === 'grass' &&
      t.z > hills(t.x) &&
      t.z < shore(t.x) - 1 &&
      !blocked.has(`${t.x},${t.z}`),
  )
  const inZone = new Set(zone.map(key))
  const used = new Set<string>()

  // Its city parts: houses along the paths first, then shops, car parks, a
  // tennis club, a stadium, and a few more houses.
  const city = zone.filter((t) => builtUp(t.biome))
  const fits = (t: Tile) => inZone.has(key(t)) && builtUp(t.biome)
  const houses = placeStructures({
    corners: besidePaths(paths).flatMap(([x, z]) => at(x, z) ?? []),
    tileAt: at,
    used,
    fits,
    kinds: [['house', 1]],
    attempts: Math.round(paths.length * 0.6),
    random,
    clear,
    dense: true,
  })
  const structures = placeStructures({
    corners: city,
    tileAt: at,
    used,
    fits,
    kinds: CITY_STRUCTURES,
    club: true,
    stadium: true,
    attempts: Math.round(city.length / 4),
    random,
    clear,
  })

  // Parks of random kinds, sizes and shapes, after the biome at their middle.
  const free = zone.filter((t) => !used.has(key(t)))
  const attempts = Math.round(zone.length / 24)
  let waters = 0
  for (let a = 0; a < attempts && free.length > 0; a++) {
    const center = free[Math.floor(random() * free.length)]
    const kinds = PATCHES[center.biome]
    const picked = kinds[Math.floor(random() * kinds.length)]
    const water = WATER[center.biome]
    // Water comes first, and only so much of it.
    const kind =
      water && waters === 0
        ? water
        : picked === water && waters >= WATER_COUNT[center.biome]
          ? kinds[0]
          : picked
    const wet = kind === 'pond' || kind === 'lake'
    // Water needs room inside its banks, and a second one is a lake.
    const radius = wet
      ? (waters > 0 ? 2.6 : 2) + random() * 1.2
      : 1.2 + random() * 2.3
    const reach = Math.ceil(radius * 1.3)
    const blob: { tile: Tile; distance: number }[] = []
    for (let di = -reach; di <= reach; di++) {
      for (let dj = -reach; dj <= reach; dj++) {
        const i = center.x + di
        const j = center.z + dj
        const distance = Math.hypot(di, dj)
        // A wobbly edge, so that no two patches look alike.
        const wobble = 0.7 + 0.6 * tileNoise(`blob${a}`, i, j)
        const k = `${i},${j}`
        if (distance > radius * wobble || !inZone.has(k) || used.has(k)) {
          continue
        }
        blob.push({ tile: at(i, j)!, distance })
      }
    }
    if (blob.length < 4) continue
    if (wet) waters++
    for (const { tile } of blob) used.add(key(tile))
    patches.push({ x: center.x, z: center.z, kind, tiles: blob.length })

    switch (kind) {
      case 'forest':
        for (const { tile } of blob) {
          if (random() > 0.3) continue
          const pick = random()
          plant(tile, pick < 0.5 ? 'oak' : pick < 0.85 ? 'pine' : 'fruit')
        }
        break
      case 'firs':
        for (const { tile } of blob) {
          if (random() < 0.35) plant(tile, 'fir')
          else if (random() < 0.05) rock(tile)
        }
        break
      case 'shrubs':
        for (const { tile } of blob) if (random() < 0.25) plant(tile, 'shrub')
        break
      case 'cacti':
        for (const { tile } of blob) {
          if (random() < 0.15) plant(tile, 'cactus')
          else if (random() < 0.05) rock(tile)
        }
        break
      case 'snowfield':
        for (const { tile } of blob) {
          set(tile.x, tile.z, 'snow')
          if (random() < 0.12) plant(tile, 'fir')
        }
        break
      case 'orchard':
        for (const { tile } of blob) {
          if (mod(tile.x, 2) === 0 && mod(tile.z, 2) === 0) {
            plant(tile, 'fruit', 0)
          }
        }
        break
      case 'garden': {
        const colors = [0, 1].map(
          () => FLOWER_COLORS[Math.floor(random() * FLOWER_COLORS.length)],
        )
        const rings = random() < 0.5
        for (const { tile, distance } of blob) {
          const stripe = rings ? Math.floor(distance) : tile.x
          for (const d of [-0.25, 0.25]) {
            flowers.push({
              x: tile.x + d + jitter(0.15),
              y: tile.top,
              z: tile.z + d + jitter(0.15),
              color: random() < 0.15 ? '#ffffff' : colors[mod(stripe, 2)],
            })
          }
        }
        break
      }
      case 'pond':
      case 'lake':
        for (const { tile, distance } of blob) {
          if (distance <= radius * 0.75) {
            set(tile.x, tile.z, kind === 'pond' ? 'pond' : 'ice')
          } else if (kind === 'pond' && random() < 0.35) {
            reeds.push({
              x: tile.x + jitter(0.4),
              y: tile.top,
              z: tile.z + jitter(0.4),
            })
          } else if (kind === 'lake' && random() < 0.15) {
            rock(tile)
          }
        }
        break
    }
  }
  // Lone trees and rocks, and a bit of snow in the mountains.
  for (const tile of zone) {
    if (used.has(key(tile))) continue
    if (tile.biome === 'mountain' && random() < 0.06) {
      set(tile.x, tile.z, 'snow')
    }
    const pick = random()
    if (pick < TREE_RATE[tile.biome]) {
      plant(tile, random() < 0.7 ? 'oak' : 'fruit')
    } else if (pick < TREE_RATE[tile.biome] + ROCK_RATE[tile.biome]) {
      rock(tile)
    }
  }

  // The hills: a forest with a few rocks, that grows as its biome says.
  for (const tile of grid) {
    const wild =
      tile.kind === 'hill' || (tile.kind === 'grass' && tile.z <= hills(tile.x))
    if (!wild || blocked.has(key(tile))) continue
    const pick = random()
    const dense = tile.biome === 'desert' ? 0.06 : 0.12
    if (pick < dense) plant(tile, 'pine')
    else if (pick < dense + 0.02) plant(tile, 'oak')
    else if (pick < dense + 0.05) rock(tile)
  }

  // The beach: a pier, kiosks, palm trees and parasols. The pier and the
  // boats stay where the sea is wide enough.
  const open = longestRun(xMin + 3, xMax - 3, (x) => sea(x) <= 8.5)
  const pierX = open
    ? Math.min(open[1], Math.max(open[0], Math.round(xMax * 0.4)))
    : null
  const pier: Point[] = []
  if (pierX !== null) {
    for (
      let j = Math.ceil(shore(pierX) + 1);
      j <= Math.floor(sea(pierX)) + 2;
      j++
    ) {
      pier.push({ x: pierX, y: 0.15, z: j })
    }
  }
  const beach = grid.filter(
    (t) => t.kind === 'sand' && (pierX === null || Math.abs(t.x - pierX) > 1),
  )
  const kiosks = placeStructures({
    corners: beach.filter((t) => builtUp(t.biome)),
    tileAt: at,
    used,
    fits: (t) =>
      t.kind === 'sand' && (pierX === null || Math.abs(t.x - pierX) > 1),
    kinds: [['kiosk', 1]],
    margin: 0,
    attempts: Math.max(3, Math.round(beach.length / 25)),
    random,
    clear,
  })
  for (const tile of beach) {
    if (used.has(key(tile))) continue
    const pick = random()
    if (pick < 0.06) plant(tile, 'palm', 0.3)
    else if (pick < 0.12) {
      umbrellas.push({
        x: tile.x + jitter(0.3),
        y: tile.top,
        z: tile.z + jitter(0.3),
        color: UMBRELLA_COLORS[Math.floor(random() * UMBRELLA_COLORS.length)],
      })
    }
  }

  const boats: Road[] =
    open && open[1] - open[0] >= 8
      ? [9, 10.5].map((z, n) => ({
          z,
          amplitude: 0.5,
          phase: n * 2.1,
          xMin: open[0] + 1,
          xMax: open[1] - 1,
        }))
      : []

  // Center the ground on the origin.
  const shift = -(zMin + zMax) / 2
  const moved = <T extends { z: number }>(items: T[]): T[] =>
    items.map((item) => ({ ...item, z: item.z + shift }))

  return {
    lots: moved(lots),
    tiles: moved(grid),
    roads: moved(roads),
    patches: moved(patches),
    trees: moved(trees.filter((t) => clear({ ...t, radius: 0.45 * t.scale }))),
    flowers: moved(
      flowers.filter((f) => clear({ ...f, height: f.y + 0.3, radius: 0.15 })),
    ),
    reeds: moved(
      reeds.filter((r) => clear({ ...r, height: r.y + 0.5, radius: 0.15 })),
    ),
    rocks: moved(rocks),
    umbrellas: moved(
      umbrellas.filter((u) => clear({ ...u, height: 1.3, radius: 0.55 })),
    ),
    structures: moved([...houses, ...structures, ...kiosks]),
    roundabouts: [],
    tracks: [],
    pier: moved(pier),
    boats: moved(boats),
    halfWidth: xMax + 0.5,
    halfDepth: (zMax - zMin) / 2 + 0.5,
    biomes,
  }
}

// How many trees and rocks, per tile, grow on wild ground in each biome.
const WILD_TREES: Record<Biome, number> = {
  forest: 0.1,
  city: 0.025,
  coastal: 0.025,
  mountain: 0.12,
  tundra: 0.05,
  desert: 0.035,
}
const WILD_ROCKS: Record<Biome, number> = {
  forest: 0.01,
  city: 0.01,
  coastal: 0.01,
  mountain: 0.04,
  tundra: 0.02,
  desert: 0.02,
}

// A joining tile of wild ground, without buildings, to make up the part of a
// map that no neighbourhood fills. Any size: an even size has its tiles on
// half-integer coordinates, so that it fits against the others. Its biomes
// shape it: mountains rise in the middle, dunes roll in the desert, a lake
// may lie in the cold or in a forest, houses and courts stand in a city, and
// a coastal one, at the front of the map, has a beach and the sea.
export function fillerLayout(
  width: number,
  depth: number,
  biomes: Biomes,
  seed: string,
): CityLayout {
  const random = seededRandom(hash(`filler:${seed}`))
  const phase = random() * 6
  const u = (i: number) => (width > 1 ? i / (width - 1) : 0.5)
  const v = (j: number) => (depth > 1 ? j / (depth - 1) : 0.5)
  const weight = (biome: Biome, i: number, j: number) =>
    weightOf(biomes, biome, u(i), v(j))
  const tiles: Tile[] = []
  const grid = new Map<string, Tile>()
  for (let i = 0; i < width; i++) {
    for (let j = 0; j < depth; j++) {
      const x = i - (width - 1) / 2
      const z = j - (depth - 1) / 2
      const biome = biomeAt(
        biomes,
        u(i),
        v(j),
        tileNoise(`biome:${seed}`, i, j),
      )
      const coast = coastline(x, weight('coastal', i, depth - 1))
      const fromFront = depth - 1 - j
      let kind: TileKind = 'grass'
      let level = 0
      if (fromFront <= coast.sea - 1.5) {
        kind = 'water'
      } else if (fromFront <= coast.sea) {
        kind = 'shallow'
      } else if (fromFront <= coast.sand) {
        kind = 'sand'
      } else {
        // Mountains rise in the middle and fall towards the edges, so that
        // they meet the plates around at ground level.
        const edge = Math.min(i, j, width - 1 - i, depth - 1 - j)
        const relief =
          weight('mountain', i, j) *
            (2.2 +
              1.3 * Math.sin(x / 3.1 + phase) +
              Math.sin(z / 2.7 + x / 5)) +
          weight('desert', i, j) * (0.6 + 0.6 * Math.sin(x / 2.3 + z / 3.1))
        level = Math.max(
          0,
          Math.min(
            MAX_MOUNTAIN_LEVEL - 1,
            Math.floor(edge / 1.3),
            Math.floor(relief + 0.5 * tileNoise(`hill:${seed}`, i, j)),
          ),
        )
        if (level > 0) kind = 'hill'
      }
      const tile: Tile = {
        x,
        z,
        kind,
        top: TOPS[kind] + HILL_STEP * level,
        biome,
      }
      tiles.push(tile)
      grid.set(key(tile), tile)
    }
  }
  const tileAt = (x: number, z: number) => grid.get(`${x},${z}`)
  const flat = (t: Tile) => t.kind === 'grass'
  const used = new Set<string>()

  // A lake, frozen in the cold, on flat ground.
  const plain = tiles.filter(flat)
  if (plain.length >= 36 && random() < 0.6) {
    const center = plain[Math.floor(random() * plain.length)]
    const water = WATER[center.biome]
    const radius = 1.5 + random() * 1.5
    for (const t of water ? plain : []) {
      const distance = Math.hypot(t.x - center.x, t.z - center.z)
      if (
        distance >
        radius * (0.75 + 0.5 * tileNoise(`lake:${seed}`, t.x, t.z))
      ) {
        continue
      }
      const kind = water === 'pond' ? 'pond' : 'ice'
      Object.assign(t, { kind, top: TOPS[kind] })
      used.add(key(t))
    }
  }

  // A path or two, wandering, with houses along them where it is a city.
  const paths: Tile[] = []
  const wanted = 1 + (width * depth > 300 ? 1 : 0)
  for (let a = 0, laid = 0; a < 6 * wanted && laid < wanted; a++) {
    const start = plain[Math.floor(random() * plain.length)]
    if (!start) break
    const dir = (
      [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as [number, number][]
    )[Math.floor(random() * 4)]
    const way = layPath({
      start,
      dir,
      tileAt,
      walkable: (t) => (flat(t) || t.kind === 'snow') && !used.has(key(t)),
      random,
      length: 10 + Math.floor(random() * 16),
    })
    if (way.length > 0) laid++
    paths.push(...way)
  }
  const fits = (t: Tile) => flat(t) && builtUp(t.biome)
  const houses = placeStructures({
    corners: besidePaths(paths).flatMap(([x, z]) => tileAt(x, z) ?? []),
    tileAt,
    used,
    fits,
    kinds: [['house', 1]],
    attempts: Math.round(paths.length * 0.6),
    random,
    clear: () => true,
    dense: true,
  })

  // Shops, car parks, a tennis club and a stadium where it is a city.
  const city = tiles.filter(fits)
  const others = placeStructures({
    corners: city,
    tileAt,
    used,
    fits,
    kinds: CITY_STRUCTURES,
    club: true,
    stadium: true,
    attempts: Math.round(city.length / 8),
    random,
    clear: () => true,
  })
  const structures = [...houses, ...others]

  const trees: Tree[] = []
  const rocks: Point[] = []
  for (const tile of tiles) {
    const { kind, top, x, z } = tile
    if (used.has(key(tile)) || !['grass', 'hill', 'sand'].includes(kind)) {
      continue
    }
    if (tile.biome === 'mountain' && kind === 'grass' && random() < 0.08) {
      Object.assign(tile, { kind: 'snow', top: TOPS.snow })
    }
    const pick = random()
    const rate = kind === 'sand' ? 0.03 : WILD_TREES[tile.biome]
    if (pick < rate) {
      const wanted: TreeKind =
        kind === 'sand' ? 'palm' : random() < 0.6 ? 'oak' : 'pine'
      const tree = treeFor(tile.biome, wanted, random())
      const scale = 0.8 + random() * 0.45
      trees.push({
        x: x + (random() - 0.5) * 0.5,
        y: tile.top,
        z: z + (random() - 0.5) * 0.5,
        scale,
        kind: tree,
        height: tile.top + TREE_HEIGHTS[tree] * scale,
      })
    } else if (pick < rate + WILD_ROCKS[tile.biome]) {
      rocks.push({ x: x + (random() - 0.5) * 0.4, y: top, z })
    }
  }
  return {
    lots: [],
    tiles,
    roads: [],
    patches: [],
    trees,
    flowers: [],
    reeds: [],
    rocks,
    umbrellas: [],
    structures,
    roundabouts: [],
    tracks: [],
    pier: [],
    boats: [],
    halfWidth: width / 2,
    halfDepth: depth / 2,
    biomes,
  }
}
