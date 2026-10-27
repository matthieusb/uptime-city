// The planet seen as a world, for the parts of the city view that read one (the strikes, the
// buildings, the labels...): each island is a neighbourhood, and there is no road, rail or wild
// tile. Their x and z only tell the order of the intro, where the islands pop up.
import type { World } from '../world'
import type { Planet } from './planet'

export function planetWorld(planet: Planet): World {
  return {
    neighbourhoods: planet.islands.map((island) => ({
      id: island.id,
      x: island.center[0],
      z: island.center[2],
      layout: island.layout,
    })),
    wilds: [],
    halfWidth: planet.radius,
    halfDepth: planet.radius,
    ways: [],
    roundabouts: [],
    track: null,
  }
}
