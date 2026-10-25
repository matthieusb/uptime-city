// The boxes that draw the railway on a plate, independent of three.js: a ballast bed, sleepers and two
// rails for each of the two tracks, and the marks of the level crossings. Everything is relative to the
// middle of the plate, and a plate only draws what stands on it.
import { hash } from './layout'
import { CORRIDOR, GAUGE_OFFSET, type TrackPiece } from './tracks'

export interface TrackBox {
  x: number
  y: number
  z: number
  sx: number
  sy: number
  sz: number
}

// Heights: the ground, the ballast bed, the sleepers and the rails.
const GROUND = 0.06
const BED = 0.07
const SLEEPER = 0.04
const RAIL = 0.07
export const RAIL_TOP = GROUND + BED + SLEEPER + RAIL
// Half the distance between the two rails of a track.
const GAUGE = 0.2
const BALLAST = ['#8c857a', '#7d776d', '#948c80']
// A road is two tiles wide, which a level crossing spans.
const ROAD = 2

export function trackBoxes(
  pieces: readonly TrackPiece[],
  halfWidth: number,
  halfDepth: number,
): Map<string, TrackBox[]> {
  const groups = new Map<string, TrackBox[]>()
  for (const piece of pieces) {
    const halfAcross = piece.vertical ? halfWidth : halfDepth
    // A box at (`a` along, `b` across) of the size given in the same order.
    const put = (
      color: string,
      a: number,
      b: number,
      sa: number,
      sb: number,
      y: number,
      sy: number,
    ) => {
      if (Math.abs(b) >= halfAcross) return
      const box: TrackBox = piece.vertical
        ? { x: b, y, z: a, sx: sb, sy, sz: sa }
        : { x: a, y, z: b, sx: sa, sy, sz: sb }
      const list = groups.get(color)
      if (list) list.push(box)
      else groups.set(color, [box])
    }
    const { at, from, to, crossings } = piece
    const gaps = crossings.map((c) => c - ROAD / 2)
    const inCrossing = (a: number) =>
      crossings.some((c) => Math.abs(a - c) < ROAD / 2)

    // The ballast bed, in blocks of two tiles, one row per tile, left out where a road crosses.
    const stretches: [number, number][] = []
    let start = from
    for (const gap of gaps.sort((p, q) => p - q)) {
      if (gap > start) stretches.push([start, gap])
      start = gap + ROAD
    }
    if (to > start) stretches.push([start, to])
    for (const [lo, hi] of stretches) {
      for (let a = lo; a < hi - 1e-6; a += 2) {
        const end = Math.min(a + 2, hi)
        for (let row = -1; row <= 1; row++) {
          const shade = hash(`${a}:${at + row}`) % BALLAST.length
          put(
            BALLAST[shade],
            (a + end) / 2,
            at + row,
            end - a,
            1,
            GROUND + BED / 2,
            BED,
          )
        }
      }
    }

    for (const side of [-1, 1]) {
      const track = at + side * GAUGE_OFFSET
      // Sleepers.
      for (let a = Math.ceil(from) + 0.25; a < to; a += 0.5) {
        if (inCrossing(a)) continue
        put('#5b4636', a, track, 0.16, 0.9, GROUND + BED + SLEEPER / 2, SLEEPER)
      }
      // Rails, all along.
      for (const rail of [-1, 1]) {
        put(
          '#c9ced6',
          (from + to) / 2,
          track + rail * GAUGE,
          to - from,
          0.07,
          RAIL_TOP - RAIL / 2,
          RAIL,
        )
      }
      // The planks of the level crossings, level with the rails, between and beside them.
      for (const c of crossings) {
        put(
          '#4a443d',
          c,
          track,
          ROAD,
          0.9,
          GROUND + (BED + SLEEPER) / 2 + 0.005,
          BED + SLEEPER,
        )
      }
    }

    // The marks of a level crossing: white lines on the road before the tracks on both sides, and a
    // barrier post with a red light on each corner.
    for (const c of crossings) {
      for (const side of [-1, 1]) {
        put('#f1f1e6', c, at + side * 1.7, ROAD - 0.4, 0.12, 0.07, 0.03)
        for (const end of [-1, 1]) {
          const a = c + end * (ROAD / 2 + 0.25)
          const b = at + side * (CORRIDOR / 2 + 0.35)
          put('#f1f1e6', a, b, 0.1, 0.1, GROUND + 0.4, 0.8)
          put('#e63946', a, b, 0.14, 0.14, GROUND + 0.75, 0.16)
        }
      }
    }
  }
  return groups
}
