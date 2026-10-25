import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef, type RefObject } from 'react'
import { Color, Object3D, type InstancedMesh } from 'three'

const WHITE = new Color('#fff')
import {
  explosionActive,
  explosionParts,
  partColor,
  partPose,
  PARTS,
} from './explosionShape'

// A service of a building that went down, and when (a clock time, in seconds).
export interface Exploded {
  floor: number
  start: number
}

// The explosion of a floor whose service went down: fireballs burst out of its windows and chunks
// and embers fly off and fall, in voxels. All the floors of the building share one instanced mesh,
// of which only the parts of the floors in `exploded` are drawn.
export default function Explosion({
  id,
  width,
  floors,
  exploded,
}: {
  id: string
  width: number
  floors: number
  exploded: RefObject<Exploded[]>
}) {
  const mesh = useRef<InstancedMesh>(null)
  const services = Math.max(0, floors - 1)
  const parts = useMemo(
    () =>
      Array.from({ length: services }, (_, i) =>
        explosionParts(`${id}:${i + 1}`, width, i + 1),
      ),
    [id, width, services],
  )
  const dummy = useMemo(() => new Object3D(), [])
  // The floors whose parts are drawn, so that they are cleared once, when the blast is over.
  const drawn = useRef(new Set<number>())

  // Instance colors must exist before the first render to be compiled in, and nothing shows.
  useLayoutEffect(() => {
    const instances = mesh.current
    if (!instances) return
    dummy.scale.setScalar(0)
    dummy.updateMatrix()
    for (let i = 0; i < services * PARTS; i++) {
      instances.setColorAt(i, WHITE)
      instances.setMatrixAt(i, dummy.matrix)
    }
    instances.instanceMatrix.needsUpdate = true
  }, [dummy, services])

  useFrame(({ clock }) => {
    const instances = mesh.current
    if (!instances) return
    let changed = false
    for (let floor = 1; floor <= services; floor++) {
      const found = exploded.current?.find((r) => r.floor === floor)
      const age = found ? clock.elapsedTime - found.start : -1
      const active = explosionActive(age)
      if (!active && !drawn.current.has(floor)) continue
      parts[floor - 1].forEach((part, k) => {
        const index = (floor - 1) * PARTS + k
        const pose = partPose(part, active ? age : -1)
        dummy.position.set(pose.x, pose.y, pose.z)
        dummy.scale.setScalar(pose.scale)
        dummy.updateMatrix()
        instances.setMatrixAt(index, dummy.matrix)
        if (active) {
          instances.setColorAt(index, partColor(part.kind, pose.life))
        }
      })
      if (active) drawn.current.add(floor)
      else drawn.current.delete(floor)
      changed = true
    }
    // Nothing to draw, nothing to send: the mesh stays out of the frame.
    instances.visible = drawn.current.size > 0
    if (!changed) return
    instances.instanceMatrix.needsUpdate = true
    if (instances.instanceColor) instances.instanceColor.needsUpdate = true
  })

  if (services === 0) return null
  return (
    <instancedMesh
      ref={mesh}
      args={[undefined, undefined, services * PARTS]}
      frustumCulled={false}
      visible={false}
    >
      <boxGeometry />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  )
}
