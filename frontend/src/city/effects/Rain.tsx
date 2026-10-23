import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { Object3D, type InstancedMesh } from 'three'
import { cloudPose, type Bounds, type Cloud } from './cloudShape'
import { dropPose, fallOf, GROUND, raindrops } from './stormShape'

const WIDTH = 0.07

// Streaks of rain under the rainy and stormy clouds, all in one draw call.
// They fall with their cloud and thin out with it at the edges of the map.
export default function Rain({
  clouds,
  bounds,
  height,
  visible,
}: {
  clouds: Cloud[]
  bounds: Bounds
  height: number
  visible: boolean
}) {
  const showers = useMemo(
    () => clouds.map((cloud) => ({ cloud, drops: raindrops(cloud) })),
    [clouds],
  )
  const total = showers.reduce((sum, s) => sum + s.drops.length, 0)
  const mesh = useRef<InstancedMesh>(null)
  const dummy = useMemo(() => new Object3D(), [])
  useFrame(({ clock }) => {
    if (!mesh.current || !visible) return
    let i = 0
    for (const { cloud, drops } of showers) {
      const pose = cloudPose(cloud, clock.elapsedTime, bounds)
      const fall = fallOf(cloud, height)
      for (const drop of drops) {
        const at = dropPose(drop, clock.elapsedTime, fall)
        dummy.position.set(
          pose.x + at.x * pose.scale,
          GROUND + at.y,
          pose.z + at.z * pose.scale,
        )
        dummy.scale.set(
          WIDTH * pose.scale,
          drop.length * pose.scale,
          WIDTH * pose.scale,
        )
        dummy.updateMatrix()
        mesh.current.setMatrixAt(i++, dummy.matrix)
      }
    }
    mesh.current.instanceMatrix.needsUpdate = true
  })
  if (total === 0) return null
  return (
    <instancedMesh
      key={total}
      ref={mesh}
      args={[undefined, undefined, total]}
      frustumCulled={false}
      raycast={() => null}
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial
        color="#a8c8ff"
        transparent
        opacity={0.7}
        depthWrite={false}
      />
    </instancedMesh>
  )
}
