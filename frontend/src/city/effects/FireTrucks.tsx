import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  Object3D,
  type Group,
  type InstancedMesh,
  type MeshBasicMaterial,
  type Texture,
} from 'three'
import { ladderTexture } from '../textures'
import type { Way } from '../world'
import {
  approachOf,
  atTruck,
  DRIVE_DISTANCE,
  DRIVE_S,
  fireTrucks,
  initialTruck,
  ladderReach,
  LADDER_PIVOT,
  parking,
  roadParking,
  stepTruck,
  TRUCK_SPEED,
  truckOffset,
  truckScale,
  truckShown,
  type Approach,
  truckSprays,
  waterPoint,
  type FireTruck,
} from './fireTruckShape'

const DROPS = 28
// Seconds a drop takes from the nozzle to the wall.
const FLIGHT_S = 0.75
// Where the nozzle is on the truck, in its own frame.
const NOZZLE = { x: -0.35, y: 0.95, z: 0 }
// How far the jet spreads sideways, in tiles.
const SPREAD = 0.35
// The water hits just inside the wall of a standing building, or this far inside the rubble.
const WALL_DEPTH = 0.1
const RUBBLE_DEPTH = 0.3
// A rung every this far along the ladder, and how wide it is.
const RUNG = 0.5
const LADDER_WIDTH = 0.3

type Tone = 'red' | 'white' | 'dark' | 'glass'
const TONES: Record<Tone, string> = {
  red: '#c62828',
  white: '#f1f1f1',
  dark: '#2b2d33',
  glass: '#9fd3ff',
}
// A fire engine heading +X: boxes (size, then middle) in the colors of their tones.
const PARTS: {
  tone: Tone
  size: [number, number, number]
  at: [number, number, number]
}[] = [
  { tone: 'dark', size: [2, 0.12, 0.5], at: [0, 0.18, 0] },
  { tone: 'red', size: [1.3, 0.55, 0.56], at: [-0.35, 0.5, 0] },
  { tone: 'red', size: [0.6, 0.6, 0.56], at: [0.6, 0.5, 0] },
  { tone: 'glass', size: [0.08, 0.25, 0.46], at: [0.92, 0.62, 0] },
  { tone: 'white', size: [1.31, 0.08, 0.57], at: [-0.35, 0.45, 0] },
  { tone: 'white', size: [0.2, 0.25, 0.2], at: [-0.35, 0.9, 0] },
  { tone: 'dark', size: [0.32, 0.32, 0.1], at: [0.6, 0.15, 0.28] },
  { tone: 'dark', size: [0.32, 0.32, 0.1], at: [0.6, 0.15, -0.28] },
  { tone: 'dark', size: [0.32, 0.32, 0.1], at: [-0.7, 0.15, 0.28] },
  { tone: 'dark', size: [0.32, 0.32, 0.1], at: [-0.7, 0.15, -0.28] },
]

// One fire engine of a building: it waits for the alarm, drives in along the road by the building
// (or, with none, along the wall it is sent to), parks and hoses the target floor (or the rubble) until it is called off, then drives away.
function Engine({
  id,
  side,
  width,
  config,
  active,
  approach,
}: {
  id: string
  side: number
  width: number
  config: FireTruck
  active: boolean
  approach: Approach | null
}) {
  const group = useRef<Group>(null)
  const water = useRef<InstancedMesh>(null)
  const beacon = useRef<MeshBasicMaterial>(null)
  const rig = useRef<Group>(null)
  const truck = useRef(initialTruck())
  const reach = useMemo(() => ladderReach(config.targetY), [config.targetY])
  const rungMap = useMemo<Texture | null>(
    () => (config.ladder ? ladderTexture() : null),
    [config.ladder],
  )
  useEffect(() => () => rungMap?.dispose(), [rungMap])
  const dummy = useMemo(() => new Object3D(), [])
  const spot = useMemo(
    () =>
      approach ? roadParking(approach, config.shift) : parking(side, width),
    [approach, config.shift, side, width],
  )
  // How far it drives in and out, and for how long: at its pace along a road.
  const legIn = approach?.before ?? DRIVE_DISTANCE
  const legOut = approach?.after ?? DRIVE_DISTANCE
  const driveIn = approach ? Math.max(DRIVE_S, legIn / TRUCK_SPEED) : DRIVE_S
  const driveOut = approach ? Math.max(DRIVE_S, legOut / TRUCK_SPEED) : DRIVE_S

  useFrame(({ clock }, delta) => {
    const t = clock.elapsedTime
    truck.current = stepTruck(
      truck.current,
      active,
      Math.min(delta, 0.1),
      config.delay,
      config.ladder,
      driveIn,
      driveOut,
    )
    const shown = truckShown(truck.current)
    if (group.current) {
      group.current.visible = shown
      const offset = truckOffset(truck.current.s, legIn, legOut)
      group.current.scale.setScalar(
        Math.max(truckScale(truck.current.s, legIn, legOut), 1e-3),
      )
      group.current.position.set(
        spot.x + spot.dx * offset,
        0,
        spot.z + spot.dz * offset,
      )
      group.current.rotation.y = spot.heading
    }
    // The ladder rises from the turntable, a rung pattern that does not stretch with it.
    if (rig.current) {
      const up = truck.current.ladder
      rig.current.visible = up > 0
      rig.current.scale.y = Math.max(up * reach.length, 1e-3)
      if (rungMap) rungMap.repeat.set(1, (up * reach.length) / RUNG)
    }
    beacon.current?.color.set(Math.floor(t * 5) % 2 ? '#ff2d2d' : '#2d7bff')

    const jet = water.current
    if (!jet) return
    const spraying = truckSprays(truck.current, active)
    jet.visible = spraying
    if (!spraying) return
    // From the tip of the ladder or the roof, to the wall of the building or over its rubble.
    const from = atTruck(spot, config.ladder ? reach.tip : NOZZLE)
    const depth = config.ladder ? width / 2 - WALL_DEPTH : RUBBLE_DEPTH
    const to = {
      x: -spot.nx * depth,
      y: config.targetY,
      z: -spot.nz * depth,
    }
    for (let i = 0; i < DROPS; i++) {
      const u = (t / FLIGHT_S + i / DROPS) % 1
      const p = waterPoint(from, to, u)
      // A jet widens a little in flight, and each drop has its own course.
      const sideways =
        (((i * 37) % 11) / 11 - 0.5) * SPREAD * Math.sin(u * Math.PI)
      dummy.position.set(
        p.x + spot.dx * sideways,
        p.y,
        p.z + spot.dz * sideways,
      )
      dummy.scale.setScalar(0.09 + 0.07 * Math.sin(u * Math.PI))
      dummy.updateMatrix()
      jet.setMatrixAt(i, dummy.matrix)
    }
    jet.instanceMatrix.needsUpdate = true
  })

  return (
    <>
      <group ref={group} visible={false}>
        {PARTS.map((part, n) => (
          <mesh key={n} position={part.at} castShadow>
            <boxGeometry args={part.size} />
            <meshLambertMaterial color={TONES[part.tone]} />
          </mesh>
        ))}
        {config.ladder && (
          <group
            ref={rig}
            position={[LADDER_PIVOT.x, LADDER_PIVOT.y, LADDER_PIVOT.z]}
            rotation={[reach.tilt, 0, 0]}
            visible={false}
          >
            {/* Unit long, scaled to the length it has reached; its foot is at the turntable. */}
            <mesh position={[0, 0.5, 0]}>
              <boxGeometry args={[LADDER_WIDTH, 1, LADDER_WIDTH]} />
              <meshLambertMaterial map={rungMap} alphaTest={0.5} />
            </mesh>
          </group>
        )}
        <mesh position={[0.55, 0.88, 0]}>
          <boxGeometry args={[0.12, 0.1, 0.4]} />
          <meshBasicMaterial ref={beacon} color="#ff2d2d" toneMapped={false} />
        </mesh>
      </group>
      <instancedMesh
        key={id}
        ref={water}
        args={[undefined, undefined, DROPS]}
        frustumCulled={false}
        visible={false}
      >
        <boxGeometry />
        <meshBasicMaterial color="#8fd3ff" toneMapped={false} />
      </instancedMesh>
    </>
  )
}

// The fire trucks of a building. A building in rubble calls some out, at random, up to three: none,
// one or several. They come by the road beside it, `x` and `z` being where it stands on the map.
export default function FireTrucks({
  id,
  width,
  x,
  z,
  ways,
  roundabouts,
  burning,
  collapsed,
}: {
  id: string
  width: number
  x: number
  z: number
  ways: readonly Way[]
  roundabouts: readonly { x: number; z: number }[]
  burning: boolean[]
  collapsed: boolean
}) {
  // The states are often rebuilt on render: compare them by what they say.
  const key = burning.map(Number).join('')
  const trucks = useMemo(
    () => fireTrucks(id, burning, collapsed),
    // `key` stands for `burning`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id, key, collapsed],
  )
  const approach = useMemo(
    () => approachOf(ways, roundabouts, { x, z }, width),
    [ways, roundabouts, x, z, width],
  )
  // A truck that has been called stays on the map until it has driven away.
  const called = useRef<(FireTruck | null)[]>([])
  trucks.forEach((truck, slot) => {
    if (truck) called.current[slot] = truck
  })
  return called.current.map(
    (config, slot) =>
      config && (
        <Engine
          key={slot}
          id={id}
          side={slot}
          width={width}
          config={config}
          active={trucks[slot] !== null}
          approach={approach}
        />
      ),
  )
}
