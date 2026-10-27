import { useFrame } from '@react-three/fiber'
import { useMemo } from 'react'
import { Matrix4, Quaternion, Vector3 } from 'three'
import { usePlanePool } from '../Planes'
import { SKY_PLANES, overflightCount } from '../overflights'
import { skyFlight } from './skyFlights'
import { cross } from './sphere'

// The planes that circle the planet above the clouds, as the ones of the flat map cross the sky.
export default function PlanetFlights({
  radius,
  visible,
  density,
}: {
  radius: number
  visible: boolean
  // How many planes, as a multiple of the normal count.
  density: number
}) {
  const { place, bodies } = usePlanePool(SKY_PLANES, true)
  const count = overflightCount(density)
  const frame = useMemo(() => new Quaternion(), [])
  const basis = useMemo(() => new Matrix4(), [])
  // Made once: nothing is allocated in a frame.
  const axes = useMemo(
    () => [new Vector3(), new Vector3(), new Vector3()] as const,
    [],
  )

  useFrame(({ clock }) => {
    if (!visible) return
    for (let i = 0; i < SKY_PLANES; i++) {
      if (i >= count) {
        place(i, null, [0, 0, 0], 1)
        continue
      }
      const flight = skyFlight(radius, i, clock.elapsedTime)
      // Heading along X, up along Y: the plane's own frame, laid on the sphere.
      axes[0].set(...flight.xAxis)
      axes[1].set(...flight.yAxis)
      axes[2].set(...cross(flight.xAxis, flight.yAxis))
      basis.makeBasis(axes[0], axes[1], axes[2])
      frame.setFromRotationMatrix(basis)
      place(
        i,
        {
          active: true,
          x: 0,
          y: 0,
          z: 0,
          heading: 0,
          pitch: 0,
          livery: flight.livery,
          kind: flight.kind,
        },
        flight.position,
        1,
        frame,
      )
    }
  })

  return <group visible={visible}>{bodies}</group>
}
