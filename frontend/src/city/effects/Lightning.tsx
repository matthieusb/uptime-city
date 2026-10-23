import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { Object3D, Vector3, type InstancedMesh, type PointLight } from 'three'
import { cloudPose, type Bounds, type Cloud } from './cloudShape'
import {
  BOLT_SEGMENTS,
  boltPoints,
  fallOf,
  GROUND,
  lightning,
} from './stormShape'

const BOLT_WIDTH = 0.2
const LIGHT_INTENSITY = 400

// The bolts of the storm clouds, and the light they throw on the ground while
// they flash.
export default function Lightning({
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
  const storms = useMemo(
    () => clouds.filter((c) => c.kind === 'storm'),
    [clouds],
  )
  const total = storms.length * BOLT_SEGMENTS
  const mesh = useRef<InstancedMesh>(null)
  // Always in the scene, so that lights do not come and go with the clouds.
  const light = useRef<PointLight>(null)
  const dummy = useMemo(() => new Object3D(), [])
  const target = useMemo(() => new Vector3(), [])
  useFrame(({ clock }) => {
    if (!mesh.current) return
    let i = 0
    let brightest = 0
    for (const cloud of storms) {
      const pose = cloudPose(cloud, clock.elapsedTime, bounds)
      const { flash, strike } = lightning(cloud, clock.elapsedTime)
      // No bolt from a cloud that is still growing or already shrinking.
      const struck = visible && flash > 0 && pose.scale > 0.5
      const base = height + pose.y
      const points = struck
        ? boltPoints(cloud, strike, fallOf(cloud, height))
        : []
      for (let s = 0; s < BOLT_SEGMENTS; s++) {
        const from = points[s]
        const to = points[s + 1]
        if (!from || !to) {
          dummy.scale.setScalar(0)
        } else {
          dummy.position.set(
            pose.x + (from.x + to.x) / 2,
            base + (from.y + to.y) / 2,
            pose.z + (from.z + to.z) / 2,
          )
          target.set(pose.x + to.x, base + to.y, pose.z + to.z)
          dummy.lookAt(target)
          const width = BOLT_WIDTH * (flash > 0.5 ? 1 : 0.6)
          dummy.scale.set(
            width,
            width,
            Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z) + width,
          )
        }
        dummy.updateMatrix()
        mesh.current.setMatrixAt(i++, dummy.matrix)
      }
      if (struck && flash > brightest) {
        brightest = flash
        const ground = points[points.length - 1]
        light.current?.position.set(
          pose.x + ground.x,
          GROUND + 4,
          pose.z + ground.z,
        )
      }
    }
    mesh.current.instanceMatrix.needsUpdate = true
    if (light.current) light.current.intensity = brightest * LIGHT_INTENSITY
  })
  return (
    <>
      {total > 0 && (
        <instancedMesh
          key={total}
          ref={mesh}
          args={[undefined, undefined, total]}
          frustumCulled={false}
          raycast={() => null}
        >
          <boxGeometry args={[1, 1, 1]} />
          <meshBasicMaterial color="#fff7cf" toneMapped={false} />
        </instancedMesh>
      )}
      <pointLight
        ref={light}
        color="#cfe0ff"
        intensity={0}
        distance={50}
        decay={2}
      />
    </>
  )
}
