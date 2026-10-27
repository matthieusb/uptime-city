import { describe, expect, it } from 'vitest'
import type { Tile } from '../../../src/city/layout'
import { trackBoxes } from '../../../src/city/trackBoxes'
import { CORRIDOR, trackPoint } from '../../../src/city/tracks'
import {
  nukedLayout,
  worldLayout,
  type Neighbourhood,
  type NeighbourhoodSpec,
} from '../../../src/city/world'

const spec = (id: string, ...vms: number[]): NeighbourhoodSpec => ({
  id,
  buildings: [
    { id, services: 2 },
    ...vms.map((services, i) => ({ id: `${id}-vm${i}`, services })),
  ],
})

const homelab = (count: number, prefix = 'host') =>
  Array.from({ length: count }, (_, i) =>
    spec(
      `${prefix}-${i}`,
      ...Array.from({ length: i % 4 }, (_, n) => (i + n) % 6),
    ),
  )

const worlds = {
  'a big homelab': homelab(30),
  'a medium homelab': homelab(8, 'srv'),
  'another medium homelab': homelab(12, 'box'),
  'a small homelab': homelab(3, 'lab'),
  'one host': [spec('alone')],
}

describe.each(Object.entries(worlds))('the railway of %s', (_, specs) => {
  const world = worldLayout(specs)
  const track = world.track!
  const plates: Neighbourhood[] = [...world.neighbourhoods, ...world.wilds]
  const key = (x: number, z: number) =>
    `${Math.round(2 * x)},${Math.round(2 * z)}`
  const ground = new Map<string, Tile>()
  for (const neighbourhood of plates) {
    for (const t of neighbourhood.layout.tiles) {
      ground.set(key(neighbourhood.x + t.x, neighbourhood.z + t.z), {
        ...t,
        x: neighbourhood.x + t.x,
        z: neighbourhood.z + t.z,
      })
    }
  }
  const tiles = [...ground.values()]
  // The tiles under the railway.
  const under = tiles.filter(
    (t) => Math.abs((track.vertical ? t.x : t.z) - track.at) < CORRIDOR / 2,
  )
  const along = (t: { x: number; z: number }) => (track.vertical ? t.z : t.x)
  const across = (t: { x: number; z: number }) => (track.vertical ? t.x : t.z)

  it('exists', () => {
    expect(track).toBeTruthy()
  })

  it('runs in a straight line from one edge of the map to the opposite one', () => {
    const [lo, hi] = [
      Math.min(...tiles.map(along)) - 0.5,
      Math.max(...tiles.map(along)) + 0.5,
    ]
    expect(track.from).toBeCloseTo(lo)
    expect(track.to).toBeCloseTo(hi)
    // One track tile or road tile for every position along it, in every row.
    const rows = new Set(under.map(across))
    expect(rows.size).toBe(CORRIDOR)
    for (const t of under) expect(['track', 'road']).toContain(t.kind)
    for (const row of rows) {
      const steps = under.filter((t) => across(t) === row).map(along)
      expect(steps.length).toBe(Math.round(hi - lo))
    }
  })

  it('lies near the back or the left edge of the map', () => {
    const edge = track.vertical
      ? Math.min(...tiles.map((t) => t.x))
      : Math.min(...tiles.map((t) => t.z))
    // The inner side of the railway is within a few tiles of the edge, unless the strip is full.
    expect(track.at - CORRIDOR / 2 - (edge - 0.5)).toBeLessThan(40)
  })

  it('never runs into the sea or over a roundabout', () => {
    for (const t of under) {
      expect(['water', 'shallow', 'island']).not.toContain(t.kind)
    }
    for (const r of world.roundabouts) {
      expect(Math.abs(across(r) - track.at)).toBeGreaterThan(CORRIDOR / 2 + 3)
    }
  })

  it('never goes over a monitored building, nor next to its square', () => {
    for (const neighbourhood of world.neighbourhoods) {
      for (const lot of neighbourhood.layout.lots) {
        const half = lot.width / 2 + 0.6
        const centre = across({
          x: neighbourhood.x + lot.x,
          z: neighbourhood.z + lot.z,
        })
        expect(Math.abs(centre - track.at)).toBeGreaterThanOrEqual(
          half + CORRIDOR / 2,
        )
      }
    }
  })

  it('keeps the roads it crosses usable, with a level crossing', () => {
    const perpendicular = world.ways.filter(
      (w) => w.vertical !== track.vertical,
    )
    const crossing = perpendicular.filter(
      (w) => w.from < track.at && w.to > track.at,
    )
    expect(track.crossings.slice().sort()).toEqual(
      crossing.map((w) => w.at).sort(),
    )
    for (const w of crossing) {
      for (const t of under) {
        if (Math.abs(along(t) - w.at) < 1) expect(t.kind).toBe('road')
      }
    }
    // No road runs along it.
    for (const w of world.ways.filter((w) => w.vertical === track.vertical)) {
      expect(Math.abs(w.at - track.at)).toBeGreaterThan(CORRIDOR / 2 + 1)
    }
  })

  it('removes the trees, structures and hills on it', () => {
    // The tile a point stands on: tiles are on one lattice.
    const [fx, fz] = [tiles[0].x, tiles[0].z].map((v) => v - Math.floor(v))
    const onTrack = (
      neighbourhood: Neighbourhood,
      p: { x: number; z: number },
    ) => {
      const [x, z] = [neighbourhood.x + p.x, neighbourhood.z + p.z]
      const tile = track.vertical
        ? fx + Math.round(x - fx)
        : fz + Math.round(z - fz)
      return Math.abs(tile - track.at) < CORRIDOR / 2
    }
    for (const neighbourhood of plates) {
      for (const tree of neighbourhood.layout.trees)
        expect(onTrack(neighbourhood, tree)).toBe(false)
      for (const structure of neighbourhood.layout.structures) {
        const reach = (track.vertical ? structure.width : structure.depth) / 2
        expect(
          Math.abs(
            across({
              x: neighbourhood.x + structure.x,
              z: neighbourhood.z + structure.z,
            }) - track.at,
          ),
        ).toBeGreaterThanOrEqual(CORRIDOR / 2 + reach - 1e-6)
      }
    }
    for (const t of tiles) {
      if (Math.abs(across(t) - track.at) < CORRIDOR / 2 + 1) {
        expect(t.kind).not.toBe('hill')
      }
    }
  })

  it('gives each plate it crosses its part, relative to the plate', () => {
    for (const neighbourhood of plates) {
      const [centre, half] = track.vertical
        ? [neighbourhood.x, neighbourhood.layout.halfWidth]
        : [neighbourhood.z, neighbourhood.layout.halfDepth]
      const [alongHalf] = track.vertical
        ? [neighbourhood.layout.halfDepth]
        : [neighbourhood.layout.halfWidth]
      const crossed = Math.abs(track.at - centre) < half + CORRIDOR / 2
      expect(neighbourhood.layout.tracks.length).toBe(crossed ? 1 : 0)
      for (const piece of neighbourhood.layout.tracks) {
        expect(piece.vertical).toBe(track.vertical)
        expect(piece.at).toBeCloseTo(track.at - centre)
        expect(piece.from).toBeCloseTo(-alongHalf)
        expect(piece.to).toBeCloseTo(alongHalf)
      }
    }
    // Together, the pieces make the whole length.
    const covered = plates
      .filter((neighbourhood) => neighbourhood.layout.tracks.length)
      .reduce(
        (sum, neighbourhood) =>
          sum +
          neighbourhood.layout.tracks[0].to -
          neighbourhood.layout.tracks[0].from,
        0,
      )
    expect(covered).toBeGreaterThanOrEqual(track.to - track.from - 1e-6)
  })

  it('is drawn with its plate and is gone on a nuked plate', () => {
    const [crossed] = plates.filter(
      (neighbourhood) => neighbourhood.layout.tracks.length,
    )
    const boxes = trackBoxes(
      crossed.layout.tracks,
      crossed.layout.halfWidth,
      crossed.layout.halfDepth,
    )
    expect([...boxes.values()].flat().length).toBeGreaterThan(0)
    expect(nukedLayout(crossed.layout).tracks).toEqual([])
  })

  it('is the same every time', () => {
    expect(worldLayout(specs).track).toEqual(track)
  })

  it('puts the two ways of a train on two tracks of the railway', () => {
    const [a, b] = [trackPoint(track, 1, 10), trackPoint(track, -1, 10)]
    expect(Math.abs(across(a) - across(b))).toBeGreaterThan(1)
    expect(Math.abs(across(a) - track.at)).toBeLessThan(CORRIDOR / 2)
  })
})

describe('the railway of an empty map', () => {
  it('is none', () => {
    expect(worldLayout([]).track).toBeNull()
  })
})
