import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { Object3D, type InstancedMesh } from 'three'
import { hash, seededRandom } from '../layout'
import { FIRE_STAGES, fireStage, smokeStage } from './fireShape'

const COUNT = 18
// Flames lick a floor and the one above it, smoke rises higher.
const FIRE_RISE = 1.6
const SMOKE_RISE = 2.6
// Just outside the walls of a building.
const WALL_GAP = 0.05

// Voxel fire: cubes rising from the windows of the floors whose base is in `slots` (null for a
// floor that does not burn), and shrinking as they burn out. All the floors of a building share
// one instanced mesh, which is not drawn when nothing burns. With smoke, cubes of dust rise
// slowly from the rubble instead, without lighting it. There is no light of its own: the floors
// glow red.
export default function Fire({
  id,
  slots,
  width,
  smoke = false,
}: {
  id: string
  slots: readonly (number | null)[]
  width: number
  smoke?: boolean
}) {
  const mesh = useRef<InstancedMesh>(null)
  const WALL = width / 2 + WALL_GAP
  const stages = smoke ? FIRE_STAGES.smoke : FIRE_STAGES.fire
  const stageOf = smoke ? smokeStage : fireStage
  // Seeded, so that each floor burns its own way.
  const particles = useMemo(
    () =>
      slots.map((_, floor) => {
        const random = seededRandom(
          hash(`${smoke ? 'smoke' : 'fire'}:${id}:${floor}`),
        )
        return Array.from({ length: COUNT }, () => {
          const along = (random() * 2 - 1) * WALL
          const side = Math.floor(random() * 4)
          return {
            phase: random(),
            speed: smoke ? 0.2 + random() * 0.25 : 0.5 + random() * 0.5,
            // Smoke rises from all over the rubble, flames from the walls.
            x: smoke ? along : side < 2 ? (side * 2 - 1) * WALL : along,
            z: smoke
              ? (random() * 2 - 1) * WALL
              : side < 2
                ? along
                : (side * 2 - 5) * WALL,
          }
        })
      }),
    // `slots` stands for its length.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id, smoke, slots.length, WALL],
  )
  const dummy = useMemo(() => new Object3D(), [])
  // The floors whose particles are drawn, so that they are cleared once, when they stop burning.
  const drawn = useRef(new Set<number>())
  const capacity = Math.max(1, slots.length) * COUNT

  // Instance colors must exist before the first render to be compiled in, and nothing shows.
  useLayoutEffect(() => {
    const instances = mesh.current
    if (!instances) return
    dummy.scale.setScalar(0)
    dummy.updateMatrix()
    for (let i = 0; i < capacity; i++) {
      instances.setColorAt(i, stages[0])
      instances.setMatrixAt(i, dummy.matrix)
    }
    instances.instanceMatrix.needsUpdate = true
    drawn.current.clear()
  }, [capacity, dummy, stages])

  useFrame(({ clock }) => {
    const instances = mesh.current
    if (!instances) return
    const t = clock.elapsedTime
    const rise = smoke ? SMOKE_RISE : FIRE_RISE
    let changed = false
    for (let floor = 0; floor < slots.length; floor++) {
      const y = slots[floor]
      if (y === null) {
        if (!drawn.current.delete(floor)) continue
        // No longer burning: its particles go.
        dummy.scale.setScalar(0)
        dummy.updateMatrix()
        for (let k = 0; k < COUNT; k++) {
          instances.setMatrixAt(floor * COUNT + k, dummy.matrix)
        }
        changed = true
        continue
      }
      drawn.current.add(floor)
      changed = true
      particles[floor].forEach((p, k) => {
        const life = (t * p.speed + p.phase) % 1
        const spread = smoke ? 1 + life * 0.3 : 1 - life * 0.4
        dummy.position.set(p.x * spread, y + life * rise, p.z * spread)
        dummy.scale.setScalar(
          smoke ? 0.2 + 0.3 * Math.sin(life * Math.PI) : 0.1 + 0.4 * (1 - life),
        )
        dummy.updateMatrix()
        instances.setMatrixAt(floor * COUNT + k, dummy.matrix)
        instances.setColorAt(floor * COUNT + k, stages[stageOf(life)])
      })
    }
    // Nothing to draw, nothing to send: the mesh stays out of the frame.
    instances.visible = drawn.current.size > 0
    if (!changed) return
    instances.instanceMatrix.needsUpdate = true
    if (instances.instanceColor) instances.instanceColor.needsUpdate = true
  })

  return (
    <instancedMesh
      ref={mesh}
      args={[undefined, undefined, capacity]}
      frustumCulled={false}
      visible={false}
    >
      <boxGeometry />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  )
}
