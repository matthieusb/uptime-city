// Pure city layout, independent of three.js. Units are world tiles: the
// ground is made of 1x1 tiles centered on integer coordinates.
//
// Each building is a host: a ground floor for the host itself, and one floor
// per service stacked on top of it.
//
// The city is a coastal town: the sea and a beach in front (+Z, towards the
// camera), forested hills at the back (-Z), and a winding road along X lined
// with buildings in between. Bigger cities get more roads further inland.
//
// No building may hide another. The isometric camera looks along the
// (-1, -1) diagonal, so a building can only hide what is behind it in its
// own screen column. The buildings of a road each take their own column, and
// each road is far enough behind the previous one that the tallest building
// of the previous road cannot hide it. Trees and parasols that would stand in front of a building are left
// out.

const SQRT3 = Math.sqrt(3)

// Width and depth of a building.
export const BUILDING_WIDTH = 3.2
// Half the width of a building on screen, in the isometric view.
export const HALF_SCREEN_WIDTH = BUILDING_WIDTH / Math.SQRT2
// A normal storey, next to a 3.2 tiles wide building.
export const FLOOR_HEIGHT = 1.8
// Taller, so that a host without services still reads as a building.
export const GROUND_HEIGHT = 2.2

// Screen distance between two buildings of a road: the width of a building
// on screen (BUILDING_WIDTH * sqrt(2)), and a margin.
const SLOT = BUILDING_WIDTH * Math.SQRT2 + 1.05
// Distance from the road center line to a building center.
const SIDE = BUILDING_WIDTH / 2 + 2.2
// Half the side of the paved square around a building.
const PLAZA = BUILDING_WIDTH / 2 + 0.6
// Buildings per road, before the city adds a road further inland.
const ROW_MAX = 6
// Least distance between two roads, along Z.
const ROW_GAP = 26
// Shape of the winding roads.
const WAVELENGTH = 7
const AMPLITUDE = 1.2
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

// Height of the top of each kind of tile. Hills add HILL_STEP per level.
const TOPS: Record<TileKind, number> = {
  water: -0.15,
  shallow: -0.1,
  pond: -0.08,
  sand: 0.02,
  grass: 0.05,
  hill: 0.05,
  road: 0.06,
  plaza: 0.09,
  crater: -0.12,
}
// Height of the top of a road.
export const ROAD_TOP = TOPS.road
// Height of the bottom of a crater.
export const CRATER_TOP = TOPS.crater
const HILL_STEP = 0.5
const MAX_HILL_LEVEL = 4

export type TreeKind = 'oak' | 'pine' | 'fruit' | 'palm'

// Height of each kind of tree at scale 1. Keep in sync with Scenery.tsx.
export const TREE_HEIGHTS: Record<TreeKind, number> = {
  oak: 1.5,
  pine: 1.6,
  fruit: 1.4,
  palm: 2,
}

export type PatchKind = 'forest' | 'orchard' | 'garden' | 'pond'
const PATCH_KINDS: PatchKind[] = ['forest', 'orchard', 'garden', 'pond']

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

// The look of a town: a coastal town has a sea and a beach in front, the
// others have land all the way.
export type Theme = 'coastal' | 'meadow' | 'desert' | 'snow'

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
  decor?: DecorKind
}

export interface Tile {
  x: number
  z: number
  kind: TileKind
  top: number
}

// A winding road along X: its center line is at roadZ(road, x).
export interface Road {
  z: number
  amplitude: number
  phase: number
  // Where cars turn around.
  xMin: number
  xMax: number
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
  // Planks of the pier, one per tile.
  pier: Point[]
  // Sailing routes, followed like roads.
  boats: Road[]
  // Half sizes of the ground, along X and Z.
  halfWidth: number
  halfDepth: number
  theme: Theme
}

export function hash(text: string): number {
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

function specHeight({ services, decor }: HostSpec): number {
  return decor ? DECOR_HEIGHTS[decor] : buildingHeight(1 + services)
}

// Distance from a road to the next one behind it, so that its buildings, up
// to this height, cannot hide the next road's. Two buildings whose screen
// columns overlap are at most 2 building widths and a margin apart sideways,
// and they may stand on the facing sides of two road bends.
function rowGap(height: number): number {
  const reach = (height * SQRT3 + 4 * HALF_SCREEN_WIDTH + 1) / Math.SQRT2
  return Math.max(ROW_GAP, Math.ceil(reach + 2 * (SIDE + AMPLITUDE)))
}

export function roadZ(road: Road, x: number): number {
  return road.z + road.amplitude * Math.sin(x / WAVELENGTH + road.phase)
}

// Position and heading at fraction t of a round trip on a road: down the
// front lane towards +X, then back up the other lane. The heading is the
// rotation around Y that points +X along the direction of travel.
export function carPoint(
  road: Road,
  t: number,
): { x: number; z: number; heading: number } {
  const u = (((t % 1) + 1) % 1) * 2
  const forward = u < 1
  const span = road.xMax - road.xMin
  const x = forward ? road.xMin + u * span : road.xMax - (u - 1) * span
  const slope =
    (road.amplitude / WAVELENGTH) * Math.cos(x / WAVELENGTH + road.phase)
  return {
    x,
    z: roadZ(road, x) + (forward ? LANE : -LANE),
    heading: forward ? Math.atan2(-slope, 1) : Math.atan2(slope, -1),
  }
}

// Whether an object at (x, z) could cover part of a building on screen.
function hides(
  object: { x: number; z: number; height: number; radius: number },
  lot: { x: number; z: number },
): boolean {
  const sideways = Math.abs(object.x - object.z - (lot.x - lot.z)) / Math.SQRT2
  const inFront = (object.x + object.z - (lot.x + lot.z)) / Math.SQRT2
  return (
    sideways < HALF_SCREEN_WIDTH + object.radius &&
    inFront > -object.radius &&
    inFront < object.height * SQRT3 + HALF_SCREEN_WIDTH + object.radius
  )
}

// Lays the buildings along their roads, each in its own screen column.
function placeBuildings(hosts: HostSpec[], roads: Road[]): Lot[] {
  const perRow = Math.ceil(hosts.length / roads.length)
  return hosts.map((spec, index) => {
    const { id } = spec
    const row = Math.floor(index / perRow)
    const inRow = Math.min(perRow, hosts.length - row * perRow)
    const road = roads[row]
    // Screen column, relative to the road. Buildings sit on either side.
    const column = ((index % perRow) - (inRow - 1) / 2) * SLOT
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
        decor: spec.decor,
      }
    }
    const floors = 1 + spec.services
    return { id, x, z, floors, height: buildingHeight(floors) }
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
          Math.abs(across) <= HALF_SCREEN_WIDTH ||
          Math.abs(across) > LABEL_REACH
        ) {
          continue
        }
        // The vertical span of the other building on screen.
        // A square seen along its diagonal is as deep as it is wide.
        const reach = HALF_SCREEN_WIDTH
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

export function cityLayout(
  hosts: HostSpec[],
  theme: Theme = 'coastal',
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
    roads.push({ z, amplitude: AMPLITUDE, phase: r * 1.7, xMin: 0, xMax: 0 })
    const tallest = Math.max(
      0,
      ...hosts.slice(r * perRow, (r + 1) * perRow).map(specHeight),
    )
    z -= rowGap(tallest)
  }
  const lots = placeBuildings(hosts, roads)

  const xMax = Math.max(
    minHalfWidth,
    Math.ceil(Math.max(0, ...lots.map((l) => Math.abs(l.x))) + 1 + X_MARGIN),
  )
  const xMin = -xMax
  for (const road of roads) {
    road.xMin = xMin + 1
    road.xMax = xMax - 1
  }
  const backZ = roads[roads.length - 1].z
  const coastal = theme === 'coastal'
  const shore = (x: number) =>
    coastal
      ? 5.5 + 0.8 * Math.sin(x / 5.3 + 0.7) + 0.5 * Math.sin(x / 2.1)
      : Infinity
  const sea = (x: number) => shore(x) + 2.6 + 0.6 * Math.sin(x / 3.7 + 2)
  const hills = (x: number) =>
    backZ - 5.5 + 1.2 * Math.sin(x / 6.1 + 1.3) + 0.6 * Math.sin(x / 2.9)
  const zMax = FRONT
  // An even number of tiles each side of the center.
  let zMin = Math.floor(backZ - BACK)
  if (mod(zMax - zMin, 2) === 1) zMin--
  while ((zMax - zMin) / 2 + 0.5 < minHalfDepth) zMin -= 2

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
        const level = Math.min(
          MAX_HILL_LEVEL,
          Math.floor((hills(i) - j) / 2 + 0.5 * tileNoise('hill', i, j)),
        )
        if (level > 0) {
          kind = 'hill'
          top = TOPS.hill + HILL_STEP * level
        }
      }
      grid.push({ x: i, z: j, kind, top })
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

  const trees: Tree[] = []
  const flowers: Flower[] = []
  const reeds: Point[] = []
  const rocks: Point[] = []
  const umbrellas: Umbrella[] = []
  const patches: Patch[] = []
  const random = seededRandom(hash(`town:${ids.join('|')}`))
  const jitter = (spread: number) => (random() - 0.5) * spread
  const plant = (tile: Tile, wanted: TreeKind, spread = 0.5) => {
    // Pines only in the snow, and palms here and there in the desert.
    if (theme === 'desert' && random() < 0.7) return
    const kind: TreeKind =
      theme === 'snow' ? 'pine' : theme === 'desert' ? 'palm' : wanted
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

  // The town: parks of random kinds, sizes and shapes between the roads.
  const zone = grid.filter(
    (t) =>
      t.kind === 'grass' &&
      t.z > hills(t.x) &&
      t.z < shore(t.x) - 1 &&
      !blocked.has(`${t.x},${t.z}`),
  )
  const inZone = new Set(zone.map((t) => `${t.x},${t.z}`))
  const used = new Set<string>()
  const attempts = Math.round(zone.length / 24)
  let pondMade = false
  for (let a = 0; a < attempts; a++) {
    const center = zone[Math.floor(random() * zone.length)]
    const picked = PATCH_KINDS[Math.floor(random() * PATCH_KINDS.length)]
    // A single pond is enough in a small town, and it comes first.
    const kind =
      a === 0 && !pondMade
        ? 'pond'
        : picked === 'pond' && pondMade
          ? 'garden'
          : picked
    // Ponds need room for water inside their banks.
    const radius = kind === 'pond' ? 2 + random() * 1.2 : 1.2 + random() * 2.3
    const reach = Math.ceil(radius * 1.3)
    const blob: { tile: Tile; distance: number }[] = []
    for (let di = -reach; di <= reach; di++) {
      for (let dj = -reach; dj <= reach; dj++) {
        const i = center.x + di
        const j = center.z + dj
        const distance = Math.hypot(di, dj)
        // A wobbly edge, so that no two patches look alike.
        const wobble = 0.7 + 0.6 * tileNoise(`blob${a}`, i, j)
        const key = `${i},${j}`
        if (distance > radius * wobble || !inZone.has(key) || used.has(key)) {
          continue
        }
        blob.push({ tile: at(i, j)!, distance })
      }
    }
    if (blob.length < 4) continue
    if (kind === 'pond') pondMade = true
    for (const { tile } of blob) used.add(`${tile.x},${tile.z}`)
    patches.push({ x: center.x, z: center.z, kind, tiles: blob.length })

    switch (kind) {
      case 'forest':
        for (const { tile } of blob) {
          if (random() > 0.3) continue
          const pick = random()
          plant(tile, pick < 0.5 ? 'oak' : pick < 0.85 ? 'pine' : 'fruit')
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
        for (const { tile, distance } of blob) {
          if (distance <= radius * 0.75) {
            set(tile.x, tile.z, 'pond')
          } else if (random() < 0.35) {
            reeds.push({
              x: tile.x + jitter(0.4),
              y: tile.top,
              z: tile.z + jitter(0.4),
            })
          }
        }
        break
    }
  }
  for (const tile of zone) {
    if (!used.has(`${tile.x},${tile.z}`) && random() < 0.008) {
      plant(tile, random() < 0.7 ? 'oak' : 'fruit')
    }
  }

  // The hills: a pine forest with a few rocks.
  for (const tile of grid) {
    const wild =
      tile.kind === 'hill' || (tile.kind === 'grass' && tile.z <= hills(tile.x))
    if (!wild || blocked.has(`${tile.x},${tile.z}`)) continue
    const pick = random()
    if (pick < 0.12) plant(tile, 'pine')
    else if (pick < 0.14) plant(tile, 'oak')
    else if (pick < 0.17) {
      rocks.push({
        x: tile.x + jitter(0.4),
        y: tile.top,
        z: tile.z + jitter(0.4),
      })
    }
  }

  // The beach: a pier, palm trees and parasols.
  const pierX = Math.round(xMax * 0.4)
  const pier: Point[] = []
  for (
    let j = Math.ceil(shore(pierX) + 1);
    coastal && j <= Math.floor(sea(pierX)) + 2;
    j++
  ) {
    pier.push({ x: pierX, y: 0.15, z: j })
  }
  const beach = grid.filter(
    (t) => t.kind === 'sand' && Math.abs(t.x - pierX) > 1,
  )
  for (const tile of beach) {
    const pick = random()
    if (pick < 0.03) plant(tile, 'palm', 0.3)
    else if (pick < 0.08) {
      umbrellas.push({
        x: tile.x + jitter(0.3),
        y: tile.top,
        z: tile.z + jitter(0.3),
        color: UMBRELLA_COLORS[Math.floor(random() * UMBRELLA_COLORS.length)],
      })
    }
  }

  const boats: Road[] = (coastal ? [9, 10.5] : []).map((z, n) => ({
    z,
    amplitude: 0.5,
    phase: n * 2.1,
    xMin: xMin + 3,
    xMax: xMax - 3,
  }))

  // Leave out whatever could hide a building.
  const clear = (object: {
    x: number
    z: number
    height: number
    radius: number
  }) => lots.every((lot) => !hides(object, lot))

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
    pier: moved(pier),
    boats: moved(boats),
    halfWidth: xMax + 0.5,
    halfDepth: (zMax - zMin) / 2 + 0.5,
    theme,
  }
}

// A joining tile of wild ground, without buildings, to make up the part of a
// map that no neighbourhood fills. Any size: an even size has its tiles on
// half-integer coordinates, so that it fits against the others.
export function fillerLayout(
  width: number,
  depth: number,
  theme: Theme,
  seed: string,
  // Whether the road along the left edge of the map runs through it.
  roadColumn = false,
): CityLayout {
  const random = seededRandom(hash(`filler:${seed}`))
  const tiles: Tile[] = []
  const trees: Tree[] = []
  const rocks: Point[] = []
  for (let i = 0; i < width; i++) {
    for (let j = 0; j < depth; j++) {
      const x = i - (width - 1) / 2
      const z = j - (depth - 1) / 2
      const road = roadColumn && (i === 2 || i === 3)
      const kind: TileKind = road ? 'road' : 'grass'
      const top = TOPS[kind]
      tiles.push({ x, z, kind, top })
      if (road) continue
      const pick = random()
      // Sparse: this ground is only there to join the neighbourhoods.
      if (pick < 0.04 && !(theme === 'desert' && random() < 0.7)) {
        const kind: TreeKind =
          theme === 'snow' ? 'pine' : theme === 'desert' ? 'palm' : 'oak'
        const scale = 0.8 + random() * 0.45
        trees.push({
          x: x + (random() - 0.5) * 0.5,
          y: top,
          z: z + (random() - 0.5) * 0.5,
          scale,
          kind,
          height: top + TREE_HEIGHTS[kind] * scale,
        })
      } else if (pick < 0.055) {
        rocks.push({ x: x + (random() - 0.5) * 0.4, y: top, z })
      }
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
    pier: [],
    boats: [],
    halfWidth: width / 2,
    halfDepth: depth / 2,
    theme,
  }
}
