// The wild joining tiles: what keeps them from hiding a monitored building.
import { GRASS_TOP, hides, type Tile } from '../layout'
import type { World } from '../world'

// Wild ground never hides a building: its hills are levelled there, and its
// trees, rocks and structures left out.
export function clearWilds(world: World): World {
  const lots = world.neighbourhoods.flatMap((neighbourhood) =>
    neighbourhood.layout.lots.map((lot) => ({
      ...lot,
      x: lot.x + neighbourhood.x,
      z: lot.z + neighbourhood.z,
    })),
  )
  const wilds = world.wilds.map((neighbourhood) => {
    const clear = (o: {
      x: number
      z: number
      height: number
      radius: number
    }) =>
      lots.every(
        (lot) =>
          !hides(
            { ...o, x: o.x + neighbourhood.x, z: o.z + neighbourhood.z },
            lot,
          ),
      )
    const flattened = new Set<string>()
    const at = (x: number, z: number) =>
      `${Math.round(2 * x)},${Math.round(2 * z)}`
    const tiles = neighbourhood.layout.tiles.map((t) => {
      if (t.kind !== 'hill' || clear({ ...t, height: t.top, radius: 0.7 })) {
        return t
      }
      flattened.add(at(t.x, t.z))
      return { ...t, kind: 'grass' as const, top: GRASS_TOP }
    })
    // Whether a point stands on a levelled hill.
    const [first] = tiles
    const ox = first.x - Math.floor(first.x)
    const oz = first.z - Math.floor(first.z)
    const levelled = (p: { x: number; z: number }) =>
      flattened.has(at(Math.round(p.x - ox) + ox, Math.round(p.z - oz) + oz))
    const structures = neighbourhood.layout.structures.filter((structure) =>
      clear({
        ...structure,
        radius: Math.hypot(structure.width, structure.depth) / 2,
      }),
    )
    // The ground of a structure left out goes back to grass.
    const gone = neighbourhood.layout.structures.filter(
      (structure) => !structures.includes(structure),
    )
    const under = (t: Tile) =>
      gone.some(
        (structure) =>
          Math.abs(t.x - structure.x) < structure.width / 2 &&
          Math.abs(t.z - structure.z) < structure.depth / 2,
      )
    return {
      ...neighbourhood,
      layout: {
        ...neighbourhood.layout,
        tiles: tiles.map((t) =>
          under(t) ? { ...t, kind: 'grass' as const, top: GRASS_TOP } : t,
        ),
        trees: neighbourhood.layout.trees.filter(
          (t) => !levelled(t) && clear({ ...t, radius: 0.45 * t.scale }),
        ),
        rocks: neighbourhood.layout.rocks.filter((point) => !levelled(point)),
        structures,
      },
    }
  })
  return { ...world, wilds }
}
