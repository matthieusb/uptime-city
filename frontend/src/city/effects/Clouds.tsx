import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { Color, Object3D, type InstancedMesh } from 'three'
import { cloudPose, cloudsFor, type CloudKind } from './cloudShape'
import Lightning from './Lightning'
import Rain from './Rain'
import { lightning } from './stormShape'

const COLORS: Record<CloudKind, string> = {
  fair: '#ffffff',
  rain: '#aab3c0',
  storm: '#59616f',
}
// What a storm cloud lights up with while it flashes.
const FLASH = new Color('#fff6c8')

// Cubes drifting over the map, all in one draw call: white when fair, grey
// when it rains, dark and flashing in a storm. They cast their shadows on the
// ground, and let the pointer through to what is under them.
export default function Clouds({
  halfWidth,
  halfDepth,
  height,
  visible,
}: {
  halfWidth: number
  halfDepth: number
  // Where the underside of the clouds floats: above the tallest building.
  height: number
  // Hidden clouds stay in the scene, so that its lights do not change.
  visible: boolean
}) {
  const clouds = useMemo(
    () => cloudsFor(halfWidth, halfDepth),
    [halfWidth, halfDepth],
  )
  const bounds = useMemo(
    () => ({ halfWidth, halfDepth }),
    [halfWidth, halfDepth],
  )
  // Where the blocks of each cloud start in the mesh.
  const starts = useMemo(() => {
    let next = 0
    return clouds.map((cloud) => {
      const start = next
      next += cloud.blocks.length
      return start
    })
  }, [clouds])
  const total = clouds.reduce((sum, cloud) => sum + cloud.blocks.length, 0)
  const mesh = useRef<InstancedMesh>(null)
  const dummy = useMemo(() => new Object3D(), [])
  const color = useMemo(() => new Color(), [])
  // How lit up each cloud is on screen right now.
  const lit = useRef<number[]>([])

  const paint = (index: number, flash: number) => {
    if (!mesh.current) return
    const cloud = clouds[index]
    color.set(COLORS[cloud.kind]).lerp(FLASH, flash)
    cloud.blocks.forEach((_, k) =>
      mesh.current!.setColorAt(starts[index] + k, color),
    )
    if (mesh.current.instanceColor)
      mesh.current.instanceColor.needsUpdate = true
    lit.current[index] = flash
  }
  useLayoutEffect(() => {
    lit.current = []
    clouds.forEach((_, index) => paint(index, 0))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clouds, total])

  useFrame(({ clock }) => {
    if (!mesh.current || !visible) return
    clouds.forEach((cloud, index) => {
      const pose = cloudPose(cloud, clock.elapsedTime, bounds)
      const flash = lightning(cloud, clock.elapsedTime).flash
      if (flash !== lit.current[index]) paint(index, flash)
      cloud.blocks.forEach((block, k) => {
        dummy.position.set(
          pose.x + block.x * pose.scale,
          height + pose.y + (block.y + 0.5) * pose.scale,
          pose.z + block.z * pose.scale,
        )
        dummy.scale.setScalar(pose.scale)
        dummy.updateMatrix()
        mesh.current!.setMatrixAt(starts[index] + k, dummy.matrix)
      })
    })
    mesh.current.instanceMatrix.needsUpdate = true
  })
  return (
    <>
      {total > 0 && (
        <instancedMesh
          key={total}
          ref={mesh}
          args={[undefined, undefined, total]}
          visible={visible}
          // The instances move far from where the mesh starts.
          frustumCulled={false}
          castShadow
          raycast={() => null}
        >
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial
            color="#ffffff"
            roughness={1}
            transparent
            opacity={0.9}
            depthWrite={false}
          />
        </instancedMesh>
      )}
      <group visible={visible}>
        <Rain
          clouds={clouds}
          bounds={bounds}
          height={height}
          visible={visible}
        />
      </group>
      <group visible={visible}>
        <Lightning
          clouds={clouds}
          bounds={bounds}
          height={height}
          visible={visible}
        />
      </group>
    </>
  )
}
