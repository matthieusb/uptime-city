import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { MeshLambertMaterial, type Group } from 'three'
import { REBUILD_S, rebuildElapsed, type Collapse } from '../collapse'
import { floorBase, floorHeight } from '../layout'
import { woodTexture } from '../textures'
import {
  craneLinger,
  craneSpot,
  jibAngle,
  scaffoldShown,
  trolley,
} from './rebuildShape'

const CRANE_COLOR = '#f2b705'
const POST = 0.1
// Boards are this thick, and stand this far from the walls.
const BOARD = 0.08
const SCAFFOLD_MARGIN = 0.25
const JIB_BACK = 1.5

// The wooden scaffolding, an open frame through which a building is seen
// going up again, level by level, and which comes down from the top once it
// is done, and a crane beside it, its jib
// swinging at random, which stays a few seconds more. Nothing shows when the
// building is not being rebuilt.
export default function Rebuild({
  id,
  width,
  floors,
  height,
  collapse,
}: {
  id: string
  width: number
  floors: number
  height: number
  collapse: RefObject<Collapse | null>
}) {
  const levels = useRef<(Group | null)[]>([])
  const root = useRef<Group>(null)
  const jib = useRef<Group>(null)
  const trolleyGroup = useRef<Group>(null)
  const line = useRef<Group>(null)
  const hook = useRef<Group>(null)

  const wood = useMemo(
    () => new MeshLambertMaterial({ map: woodTexture() }),
    [],
  )
  useEffect(
    () => () => {
      wood.map?.dispose()
      wood.dispose()
    },
    [wood],
  )

  const mast = height + 3
  const jibLength = width + 3
  const spot = craneSpot(id, width)
  const linger = craneLinger(id)
  const half = width / 2 + SCAFFOLD_MARGIN
  const side = width + 2 * SCAFFOLD_MARGIN

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    const elapsed = collapse.current && rebuildElapsed(collapse.current, t)
    const shown = elapsed != null && elapsed < REBUILD_S + linger
    if (root.current) root.current.visible = shown
    if (!shown) return
    const progress = elapsed / REBUILD_S
    levels.current.forEach((group, i) => {
      if (group) group.visible = scaffoldShown(progress, i, floors, REBUILD_S)
    })
    jib.current?.rotation.set(0, jibAngle(id, t), 0)
    const { run, drop } = trolley(id, t)
    trolleyGroup.current?.position.set(
      -JIB_BACK + run * (jibLength + JIB_BACK - 0.5),
      -0.15,
      0,
    )
    const rope = 0.6 + drop * (mast - 2.5)
    line.current?.scale.set(1, rope, 1)
    hook.current?.position.set(0, -rope, 0)
  })

  return (
    <group ref={root} visible={false}>
      {Array.from({ length: floors }, (_, i) => {
        const h = floorHeight(i)
        const y = floorBase(i)
        return (
          <group
            key={i}
            ref={(group) => {
              levels.current[i] = group
            }}
            visible={false}
          >
            {[
              [half, half],
              [-half, half],
              [half, -half],
              [-half, -half],
            ].map(([x, z], k) => (
              <mesh key={k} position={[x, y + h / 2, z]} material={wood}>
                <boxGeometry args={[POST, h, POST]} />
              </mesh>
            ))}
            {/* Two rails per side, which leave the walls in sight. */}
            {[h / 2, h].flatMap((rail) =>
              [
                [0, half, side, BOARD],
                [0, -half, side, BOARD],
                [half, 0, BOARD, side],
                [-half, 0, BOARD, side],
              ].map(([x, z, sx, sz], k) => (
                <mesh
                  key={`${rail}:${k}`}
                  position={[x, y + rail, z]}
                  material={wood}
                >
                  <boxGeometry args={[sx, BOARD, sz]} />
                </mesh>
              )),
            )}
          </group>
        )
      })}
      <group position={[spot.x, 0, spot.z]}>
        <mesh position={[0, mast / 2, 0]} castShadow>
          <boxGeometry args={[0.3, mast, 0.3]} />
          <meshLambertMaterial color={CRANE_COLOR} />
        </mesh>
        <group ref={jib} position={[0, mast, 0]}>
          <mesh position={[(jibLength - JIB_BACK) / 2, 0, 0]} castShadow>
            <boxGeometry args={[jibLength + JIB_BACK, 0.2, 0.3]} />
            <meshLambertMaterial color={CRANE_COLOR} />
          </mesh>
          <mesh position={[-JIB_BACK, -0.3, 0]}>
            <boxGeometry args={[0.6, 0.6, 0.5]} />
            <meshLambertMaterial color="#5c5c66" />
          </mesh>
          <group ref={trolleyGroup} position={[0, -0.15, 0]}>
            <group ref={line}>
              <mesh position={[0, -0.5, 0]}>
                <boxGeometry args={[0.04, 1, 0.04]} />
                <meshLambertMaterial color="#222" />
              </mesh>
            </group>
            <group ref={hook}>
              <mesh position={[0, -0.1, 0]}>
                <boxGeometry args={[0.25, 0.2, 0.25]} />
                <meshLambertMaterial color="#222" />
              </mesh>
            </group>
          </group>
        </group>
      </group>
    </group>
  )
}
