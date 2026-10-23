import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { Color, Object3D, type InstancedMesh } from 'three'
import {
  mushroomPuffs,
  puffPose,
  wisps,
  type Puff,
  type Wisp,
} from './nukeShape'

// Smooth spheres, one draw call per kind of puff. They bob and breathe, and
// the whole cloud turns slowly.
function Puffs({ puffs, glow }: { puffs: Puff[]; glow: boolean }) {
  const mesh = useRef<InstancedMesh>(null)
  const dummy = useMemo(() => new Object3D(), [])
  useLayoutEffect(() => {
    if (!mesh.current) return
    const color = new Color()
    puffs.forEach((puff, i) => {
      mesh.current!.setColorAt(i, color.set(puff.color))
    })
    if (mesh.current.instanceColor)
      mesh.current.instanceColor.needsUpdate = true
  }, [puffs])
  useFrame(({ clock }) => {
    if (!mesh.current) return
    puffs.forEach((puff, i) => {
      const pose = puffPose(puff, clock.elapsedTime)
      dummy.position.set(pose.x, pose.y, pose.z)
      dummy.scale.setScalar(puff.radius * pose.scale)
      dummy.updateMatrix()
      mesh.current!.setMatrixAt(i, dummy.matrix)
    })
    mesh.current.instanceMatrix.needsUpdate = true
  })
  return (
    <instancedMesh
      key={puffs.length}
      ref={mesh}
      args={[undefined, undefined, puffs.length]}
      castShadow={!glow}
    >
      <sphereGeometry args={[1, 20, 14]} />
      {glow ? (
        // Lights itself, like fire.
        <meshBasicMaterial />
      ) : (
        <meshStandardMaterial roughness={1} />
      )}
    </instancedMesh>
  )
}

// Thin, translucent smoke that rises from the cap and fades out.
function Smoke({ list }: { list: Wisp[] }) {
  const mesh = useRef<InstancedMesh>(null)
  const dummy = useMemo(() => new Object3D(), [])
  useFrame(({ clock }) => {
    if (!mesh.current) return
    list.forEach((wisp, i) => {
      const pose = wisp.pose(clock.elapsedTime)
      dummy.position.set(pose.x, pose.y, pose.z)
      dummy.scale.setScalar(pose.scale)
      dummy.updateMatrix()
      mesh.current!.setMatrixAt(i, dummy.matrix)
    })
    mesh.current.instanceMatrix.needsUpdate = true
  })
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, list.length]}>
      <sphereGeometry args={[1, 14, 10]} />
      <meshStandardMaterial
        color="#8b8379"
        roughness={1}
        transparent
        opacity={0.35}
        depthWrite={false}
      />
    </instancedMesh>
  )
}

// A realistic mushroom cloud, smooth and not made of voxels like the rest of
// the town. It billows slowly over the middle of a nuked ground.
export default function Nuke() {
  const puffs = useMemo(() => mushroomPuffs(), [])
  const glowing = useMemo(() => puffs.filter((p) => p.glow), [puffs])
  const ash = useMemo(() => puffs.filter((p) => !p.glow), [puffs])
  const smoke = useMemo(() => wisps(), [])
  return (
    <group>
      <Puffs puffs={glowing} glow />
      <Puffs puffs={ash} glow={false} />
      <Smoke list={smoke} />
      {/* The shock wave, flat on the ground. */}
      <mesh position={[0, 0.12, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[9, 0.12, 8, 64]} />
        <meshBasicMaterial color="#ffe9c4" transparent opacity={0.55} />
      </mesh>
      <pointLight
        position={[0, 6, 0]}
        color="#ff7b00"
        intensity={120}
        distance={36}
        decay={2}
      />
    </group>
  )
}
