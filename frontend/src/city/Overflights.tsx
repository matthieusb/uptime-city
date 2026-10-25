import { useFrame } from '@react-three/fiber'
import {
  SKY_PLANES,
  overflightCount,
  overflightState,
  type SkyBounds,
} from './overflights'
import { usePlanePool } from './Planes'

// The planes that cross the sky from one edge of the map to another, just above the clouds, at
// random and unrelated to the airport. They are in the frame of the map, not of a plate, so they
// are hidden in focus view, like the clouds.
export default function Overflights({
  bounds,
  cruise,
  visible,
  density,
}: {
  bounds: SkyBounds
  // How high they fly, just above the clouds (`cruiseHeight`).
  cruise: number
  visible: boolean
  // How many planes, as a multiple of the normal count.
  density: number
}) {
  const { place, bodies } = usePlanePool(SKY_PLANES)
  const count = overflightCount(density)

  useFrame(({ clock }) => {
    if (!visible) return
    for (let i = 0; i < SKY_PLANES; i++) {
      const state =
        i < count ? overflightState(bounds, cruise, i, clock.elapsedTime) : null
      place(i, state, state ? [state.x, state.y, state.z] : [0, 0, 0], 1)
    }
  })

  return <group visible={visible}>{bodies}</group>
}
