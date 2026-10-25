import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef, type RefObject } from 'react'
import {
  Color,
  Object3D,
  type InstancedMesh,
  type MeshBasicMaterial,
  type PointLight,
} from 'three'
import { demolitionElapsed, smokeAge, type Collapse } from '../collapse'
import {
  blastCubes,
  blastLight,
  MAX_BLAST_CUBES,
  PUFFS,
  smokeCubes,
  smokeOpacity,
  type Cube,
} from './demolitionShape'

// Charges going off at the foot of a building before it falls, and a little
// cloud of dust once it has fallen, thinning out in a few seconds. Nothing
// shows while the building stands or when it was in ruins since the load.
export default function Demolition({
  id,
  width,
  delay,
  collapse,
}: {
  id: string
  width: number
  // Seconds between the host going down and the fall.
  delay: number
  collapse: RefObject<Collapse | null>
}) {
  const blast = useRef<InstancedMesh>(null)
  const dust = useRef<InstancedMesh>(null)
  const dustMaterial = useRef<MeshBasicMaterial>(null)
  const light = useRef<PointLight>(null)
  const dummy = useMemo(() => new Object3D(), [])
  const color = useMemo(() => new Color(), [])

  // Instance colors must exist before the first render to be compiled in.
  useLayoutEffect(() => {
    for (let i = 0; i < MAX_BLAST_CUBES; i++)
      blast.current?.setColorAt(i, color.set('#fff'))
    for (let i = 0; i < PUFFS; i++)
      dust.current?.setColorAt(i, color.set('#fff'))
  }, [color])

  const place = (mesh: InstancedMesh, cubes: Cube[], count: number) => {
    for (let i = 0; i < count; i++) {
      const cube = cubes[i]
      dummy.position.set(cube?.x ?? 0, cube?.y ?? 0, cube?.z ?? 0)
      dummy.scale.setScalar(cube?.scale ?? 0)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
      if (cube) mesh.setColorAt(i, color.set(cube.color))
    }
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }

  useFrame(({ clock }) => {
    const state = collapse.current
    const now = clock.elapsedTime
    const elapsed = state && demolitionElapsed(state, now)
    const age = state && smokeAge(state, now, delay)
    const fire = elapsed != null ? blastCubes(id, width, elapsed) : []
    const puffs = age != null ? smokeCubes(id, width, age) : []
    if (blast.current) place(blast.current, fire, MAX_BLAST_CUBES)
    if (dust.current) place(dust.current, puffs, PUFFS)
    if (dustMaterial.current) {
      dustMaterial.current.opacity = age != null ? smokeOpacity(id, age) : 0
    }
    if (light.current) {
      light.current.intensity =
        elapsed != null ? 60 * blastLight(id, elapsed) : 0
    }
  })

  return (
    <>
      <instancedMesh
        ref={blast}
        args={[undefined, undefined, MAX_BLAST_CUBES]}
        frustumCulled={false}
      >
        <boxGeometry />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <instancedMesh
        ref={dust}
        args={[undefined, undefined, PUFFS]}
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
      <pointLight
        ref={light}
        position={[0, 1, 0]}
        color="#ff7b00"
        distance={40}
        decay={1.5}
        intensity={0}
      />
    </>
  )
}
