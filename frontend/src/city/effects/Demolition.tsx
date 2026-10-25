import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef, type RefObject } from 'react'
import {
  Color,
  Object3D,
  type InstancedMesh,
  type MeshBasicMaterial,
} from 'three'
import { demolitionElapsed, smokeAge, type Collapse } from '../collapse'
import {
  BLAST_COLORS,
  blastPlan,
  newPose,
  piecePose,
  puffPose,
  smokeOpacity,
  smokePlan,
  smokeProgress,
} from './demolitionShape'

// The colors are made once, not parsed in every frame.
const TONES = BLAST_COLORS.map((c) => new Color(c))
const WHITE = new Color('#fff')

// A shock wave climbing a building before it falls: its floors burst one after
// the other, fireballs coming out of the windows, up to the roof, and a little
// cloud of dust once it has fallen, thinning out in a few seconds. Nothing
// shows while the building stands or when it was in ruins since the load.
export default function Demolition({
  id,
  width,
  height,
  floors,
  delay,
  collapse,
}: {
  id: string
  width: number
  height: number
  floors: number
  // Seconds between the host going down and the fall.
  delay: number
  collapse: RefObject<Collapse | null>
}) {
  const blast = useRef<InstancedMesh>(null)
  const dust = useRef<InstancedMesh>(null)
  const dustMaterial = useRef<MeshBasicMaterial>(null)
  const dummy = useMemo(() => new Object3D(), [])
  const pose = useRef(newPose()).current
  const pieces = useMemo(
    () => blastPlan(id, width, height, floors),
    [id, width, height, floors],
  )
  const puffs = useMemo(() => smokePlan(id, width), [id, width])
  // Whether something was drawn last frame, so that a building with nothing to show costs nothing.
  const shown = useRef(false)

  // Instance colors must exist before the first render to be compiled in, and nothing shows. The
  // dust keeps its colors for good.
  useLayoutEffect(() => {
    dummy.scale.setScalar(0)
    dummy.updateMatrix()
    pieces.forEach((_, i) => {
      blast.current?.setColorAt(i, WHITE)
      blast.current?.setMatrixAt(i, dummy.matrix)
    })
    puffs.forEach((puff, i) => {
      dust.current?.setColorAt(i, TONES[0].clone().set(puff.color))
      dust.current?.setMatrixAt(i, dummy.matrix)
    })
    for (const mesh of [blast.current, dust.current]) {
      if (!mesh) continue
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    }
  }, [dummy, pieces, puffs])

  useFrame(({ clock }) => {
    const put = (mesh: InstancedMesh, i: number) => {
      dummy.position.set(pose.x, pose.y, pose.z)
      dummy.scale.setScalar(pose.scale)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    const state = collapse.current
    const now = clock.elapsedTime
    const elapsed = state && demolitionElapsed(state, now)
    const age = state && smokeAge(state, now, delay)
    const progress = age != null ? smokeProgress(id, age) : null
    if (elapsed == null && progress == null && !shown.current) return
    shown.current = elapsed != null || progress != null

    const fire = blast.current
    if (fire) {
      for (let i = 0; i < pieces.length; i++) {
        const lit = elapsed != null && piecePose(pieces[i], elapsed, pose)
        if (lit) fire.setColorAt(i, TONES[pose.tone])
        else pose.scale = 0
        put(fire, i)
      }
      fire.instanceMatrix.needsUpdate = true
      if (fire.instanceColor) fire.instanceColor.needsUpdate = true
    }
    const cloud = dust.current
    if (cloud) {
      for (let i = 0; i < puffs.length; i++) {
        if (progress != null) puffPose(puffs[i], progress, pose)
        else pose.scale = 0
        put(cloud, i)
      }
      cloud.instanceMatrix.needsUpdate = true
    }
    if (dustMaterial.current) {
      dustMaterial.current.opacity = age != null ? smokeOpacity(id, age) : 0
    }
  })

  return (
    <>
      <instancedMesh
        key={pieces.length}
        ref={blast}
        args={[undefined, undefined, pieces.length]}
        frustumCulled={false}
      >
        <boxGeometry />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <instancedMesh
        ref={dust}
        args={[undefined, undefined, puffs.length]}
        frustumCulled={false}
        renderOrder={2}
      >
        <boxGeometry />
        <meshBasicMaterial
          ref={dustMaterial}
          transparent
          opacity={0}
          depthWrite={false}
        />
      </instancedMesh>
    </>
  )
}
