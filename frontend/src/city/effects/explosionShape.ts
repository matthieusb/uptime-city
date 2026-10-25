// Pure logic of the explosion: when a service goes down, its floor blows up. A flash lights the
// floor, fireballs burst out of its windows and chunks and embers fly off and fall, then the
// flames take over. Independent of three.js.
import { Color } from 'three'
import type { BuildingState } from '../../domain/status'
import { floorBase, floorHeight, hash, seededRandom } from '../layout'

// Seconds the whole blast lasts, and the flash of the floor.
export const EXPLOSION_S = 1.6
export const BLAST_S = 0.4
const GRAVITY = 9
// What flies off the walls of a floor.
const FIREBALLS_PER_WALL = 4
const CHUNKS = 8
const EMBERS = 6
export const PARTS = 4 * FIREBALLS_PER_WALL + CHUNKS + EMBERS

// The services that went down: up before, down now. Not the host (floor 0), whose building falls,
// not a service with no status yet, and not a building that falls or stands again.
export function explodedFloors(
  previous: BuildingState | null,
  next: BuildingState,
): number[] {
  if (!previous || previous.collapsed || next.collapsed) return []
  return next.floors.flatMap((status, i) =>
    i > 0 && previous.floors[i] === 'up' && status === 'down' ? [i] : [],
  )
}

// Whether the blast still shows `age` seconds after the service went down.
export const explosionActive = (age: number): boolean =>
  age >= 0 && age < EXPLOSION_S

// How lit the floor is by the blast, 1 down to 0 in a fraction of a second.
export const floorBlast = (age: number): number =>
  age < 0 || age >= BLAST_S ? 0 : 1 - age / BLAST_S

export type PartKind = 'fire' | 'chunk' | 'ember'

export interface Part {
  kind: PartKind
  // Where it starts, on a wall of the floor: relative to the middle of the building, y from the
  // ground.
  x: number
  y: number
  z: number
  // Where it goes, in tiles per second.
  vx: number
  vy: number
  vz: number
  // Seconds it lives, and how big it is at most.
  life: number
  size: number
}

// The parts of the blast of one floor, the same every time. `floor` is the index of the floor.
export function explosionParts(
  id: string,
  width: number,
  floor: number,
): Part[] {
  const random = seededRandom(hash(`blast:${id}`))
  const between = (min: number, max: number) => min + random() * (max - min)
  const base = floorBase(floor)
  const height = floorHeight(floor)
  const half = width / 2
  const walls = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const
  const onWall = (wall: number) => {
    const [nx, nz] = walls[wall % 4]
    const along = between(-(half - 0.3), half - 0.3)
    return {
      nx,
      nz,
      x: nx * half + (nx === 0 ? along : 0),
      z: nz * half + (nz === 0 ? along : 0),
      y: base + between(0.3, Math.max(0.4, height - 0.3)),
    }
  }
  const parts: Part[] = []
  for (let wall = 0; wall < 4; wall++) {
    for (let k = 0; k < FIREBALLS_PER_WALL; k++) {
      const at = onWall(wall)
      const speed = between(3, 4.5)
      parts.push({
        kind: 'fire',
        x: at.x,
        y: at.y,
        z: at.z,
        vx: at.nx * speed,
        vy: between(0.5, 1.2),
        vz: at.nz * speed,
        life: between(0.7, 1),
        size: between(0.45, 0.7),
      })
    }
  }
  for (let k = 0; k < CHUNKS + EMBERS; k++) {
    const kind = k < CHUNKS ? 'chunk' : 'ember'
    const at = onWall(Math.floor(random() * 4))
    const speed = between(1.5, 3.5)
    parts.push({
      kind,
      x: at.x,
      y: at.y,
      z: at.z,
      vx: at.nx * speed + between(-1, 1),
      vy: between(2.5, 5),
      vz: at.nz * speed + between(-1, 1),
      life: kind === 'chunk' ? between(1.2, EXPLOSION_S) : between(1, 1.4),
      size: kind === 'chunk' ? between(0.14, 0.24) : between(0.08, 0.14),
    })
  }
  return parts
}

// Where a part is `age` seconds into the blast, and how big. Fireballs slow down as they spread,
// grow and shrink away; chunks and embers fly in an arc and shrink.
export function partPose(
  part: Part,
  age: number,
): { x: number; y: number; z: number; scale: number; life: number } {
  const life = Math.min(1, Math.max(0, age / part.life))
  if (age < 0 || age >= part.life) {
    return { x: part.x, y: Math.max(0, part.y), z: part.z, scale: 0, life: 1 }
  }
  if (part.kind === 'fire') {
    const travelled = age - age ** 2 / (2 * part.life)
    return {
      x: part.x + part.vx * travelled,
      y: Math.max(0, part.y + part.vy * travelled),
      z: part.z + part.vz * travelled,
      scale: part.size * Math.sin(Math.PI * life),
      life,
    }
  }
  return {
    x: part.x + part.vx * age,
    y: Math.max(0, part.y + part.vy * age - 0.5 * GRAVITY * age ** 2),
    z: part.z + part.vz * age,
    scale: part.size * Math.sqrt(1 - life),
    life,
  }
}

// The colors of the parts, made once rather than parsed every frame.
const FIREBALL = ['#fff3b0', '#ffb703', '#e85d04', '#5a3a2a'].map(
  (c) => new Color(c),
)
const EMBER = ['#ffd23f', '#ff7b00', '#8a2a00'].map((c) => new Color(c))
const CHUNK = new Color('#55555e')

// Fireballs and embers go from bright to dark as they burn out, chunks stay the color of rubble.
export function partColor(kind: PartKind, life: number): Color {
  if (kind === 'chunk') return CHUNK
  if (kind === 'ember') return EMBER[life < 0.5 ? 0 : life < 0.8 ? 1 : 2]
  return FIREBALL[life < 0.2 ? 0 : life < 0.5 ? 1 : life < 0.8 ? 2 : 3]
}
