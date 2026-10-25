import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import {
  AdditiveBlending,
  Color,
  DoubleSide,
  Object3D,
  type Group,
  type InstancedMesh,
  type MeshBasicMaterial,
  type PointLight,
} from 'three'
import {
  blastActive,
  blastFade,
  blastRadius,
  blastWallHeight,
  CUBES,
  fireFlames,
  flameBurn,
  flameCube,
  waveColumns,
  waveCube,
  WAVE_CUBES,
} from './blastShape'
import { FIRE_STAGES } from './fireShape'
import {
  mushroomPuffs,
  NUKE_HEIGHT,
  puffPose,
  wisps,
  type Puff,
  type Wisp,
} from './nukeShape'
import { SWEEP_S } from './restoreShape'
import { growthAt, MISSILE_S, puffGrowth } from './strikeShape'

// Smooth spheres, one draw call per kind of puff. They bob and breathe, and
// the whole cloud turns slowly.
function Puffs({
  puffs,
  glow,
  growth,
}: {
  puffs: Puff[]
  glow: boolean
  growth: () => number
}) {
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
    const g = growth()
    puffs.forEach((puff, i) => {
      const pose = puffPose(puff, clock.elapsedTime)
      // The cloud swells out of the ground, foot first.
      const swell = puffGrowth(puff.y / NUKE_HEIGHT, g)
      const spread = 0.3 + 0.7 * g
      dummy.position.set(pose.x * spread, pose.y, pose.z * spread)
      dummy.scale.setScalar(puff.radius * pose.scale * swell)
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
function Smoke({ list, growth }: { list: Wisp[]; growth: () => number }) {
  const mesh = useRef<InstancedMesh>(null)
  const dummy = useMemo(() => new Object3D(), [])
  useFrame(({ clock }) => {
    if (!mesh.current) return
    const g = growth()
    list.forEach((wisp, i) => {
      const pose = wisp.pose(clock.elapsedTime)
      dummy.position.set(pose.x, pose.y, pose.z)
      dummy.scale.setScalar(pose.scale * g * g)
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

// Seconds since the impact, Infinity for a tile nuked from the start, where all has long burnt.
const sinceImpact = (startedAt: number | null) =>
  startedAt === null ? Infinity : (Date.now() - startedAt) / 1000 - MISSILE_S

// The shock wave of the impact is a wave of fire: a wall of flames, columns of voxel cubes
// around a circle, runs out across the tile to its farthest corner, fast, and dies down, with a
// red-orange glow on the ground and in the air in its wake. The flames are one instanced mesh and
// the glow two additive meshes, all drawn only while it runs.
function Shockwave({
  startedAt,
  reach,
}: {
  startedAt: number | null
  reach: number
}) {
  const front = useRef<Group>(null)
  const wall = useRef<MeshBasicMaterial>(null)
  const ring = useRef<MeshBasicMaterial>(null)
  const wallMesh = useRef<Object3D>(null)
  const flames = useRef<InstancedMesh>(null)
  const columns = useMemo(() => waveColumns(reach), [reach])
  const dummy = useMemo(() => new Object3D(), [])
  useLayoutEffect(() => {
    const instances = flames.current
    if (!instances) return
    for (let i = 0; i < columns * WAVE_CUBES; i++) {
      instances.setColorAt(i, FIRE_STAGES.fire[0])
    }
  }, [columns])
  useFrame(({ clock }) => {
    const since = sinceImpact(startedAt)
    const active = blastActive(since)
    if (front.current) front.current.visible = active
    if (flames.current) flames.current.visible = active
    if (!active) return
    const radius = Math.max(0.01, blastRadius(since, reach))
    const fade = blastFade(since)
    front.current?.scale.set(radius, 1, radius)
    const height = blastWallHeight(since)
    wallMesh.current?.scale.set(1, height, 1)
    wallMesh.current?.position.set(0, height / 2, 0)
    if (wall.current) wall.current.opacity = 0.35 * fade
    if (ring.current) ring.current.opacity = 0.7 * fade
    const instances = flames.current
    if (!instances) return
    const t = clock.elapsedTime
    for (let column = 0; column < columns; column++) {
      for (let k = 0; k < WAVE_CUBES; k++) {
        const cube = waveCube(column, k, columns, radius, since, t)
        dummy.position.set(cube.x, cube.y, cube.z)
        dummy.scale.setScalar(cube.scale)
        dummy.updateMatrix()
        const index = column * WAVE_CUBES + k
        instances.setMatrixAt(index, dummy.matrix)
        instances.setColorAt(index, FIRE_STAGES.fire[cube.stage])
      }
    }
    instances.instanceMatrix.needsUpdate = true
    if (instances.instanceColor) instances.instanceColor.needsUpdate = true
  })
  // The glow is drawn at radius 1 and scaled to the radius of the front.
  return (
    <>
      <group ref={front} visible={false}>
        <mesh ref={wallMesh}>
          <cylinderGeometry args={[1, 1, 1, 64, 1, true]} />
          <meshBasicMaterial
            ref={wall}
            color="#ff5a14"
            transparent
            side={DoubleSide}
            depthWrite={false}
            blending={AdditiveBlending}
          />
        </mesh>
        <mesh position={[0, 0.15, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.94, 1.04, 64]} />
          <meshBasicMaterial
            ref={ring}
            color="#ffb703"
            transparent
            side={DoubleSide}
            depthWrite={false}
            blending={AdditiveBlending}
          />
        </mesh>
      </group>
      <instancedMesh
        ref={flames}
        args={[undefined, undefined, columns * WAVE_CUBES]}
        frustumCulled={false}
        visible={false}
      >
        <boxGeometry />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
    </>
  )
}

// The fires that the wave sets off over the tile, each when it reaches it, as many as the size of
// the tile asks for: columns of voxel flames, all in one instanced mesh and without a light,
// updated every other frame.
function Fires({
  startedAt,
  halfWidth,
  halfDepth,
}: {
  startedAt: number | null
  halfWidth: number
  halfDepth: number
}) {
  const mesh = useRef<InstancedMesh>(null)
  const flames = useMemo(
    () => fireFlames(halfWidth, halfDepth),
    [halfWidth, halfDepth],
  )
  const dummy = useMemo(() => new Object3D(), [])
  const frame = useRef(0)
  useLayoutEffect(() => {
    const instances = mesh.current
    if (!instances) return
    dummy.scale.setScalar(0)
    dummy.updateMatrix()
    for (let i = 0; i < flames.length * CUBES; i++) {
      instances.setColorAt(i, FIRE_STAGES.fire[0])
      instances.setMatrixAt(i, dummy.matrix)
    }
    instances.instanceMatrix.needsUpdate = true
  }, [dummy, flames.length])
  useFrame(({ clock }) => {
    const instances = mesh.current
    if (!instances || frame.current++ % 2 !== 0) return
    const since = sinceImpact(startedAt)
    const t = clock.elapsedTime
    flames.forEach((flame, f) => {
      const burn = flameBurn(flame, since)
      for (let k = 0; k < CUBES; k++) {
        const cube = flameCube(flame, k, t)
        dummy.position.set(cube.x, cube.y * burn, cube.z)
        dummy.scale.setScalar(cube.scale * burn)
        dummy.updateMatrix()
        instances.setMatrixAt(f * CUBES + k, dummy.matrix)
        instances.setColorAt(f * CUBES + k, FIRE_STAGES.fire[cube.stage])
      }
    })
    instances.instanceMatrix.needsUpdate = true
    if (instances.instanceColor) instances.instanceColor.needsUpdate = true
  })
  return (
    <instancedMesh
      ref={mesh}
      args={[undefined, undefined, flames.length * CUBES]}
      frustumCulled={false}
    >
      <boxGeometry />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  )
}

// A realistic mushroom cloud, smooth and not made of voxels like the rest of
// the town. It billows slowly over the middle of a nuked ground. When the
// strike started at `startedAt` (milliseconds), it grows out of the impact;
// without one, it is full grown.
export default function Nuke({
  startedAt = null,
  restoredAt = null,
  halfWidth,
  halfDepth,
}: {
  startedAt?: number | null
  restoredAt?: number | null
  // The size of the tile it stands on, for the blast to cross and the fires to burn on.
  halfWidth: number
  halfDepth: number
}) {
  const puffs = useMemo(() => mushroomPuffs(), [])
  const glowing = useMemo(() => puffs.filter((p) => p.glow), [puffs])
  const ash = useMemo(() => puffs.filter((p) => !p.glow), [puffs])
  const smoke = useMemo(() => wisps(), [])
  const growth = () => growthAt(startedAt, Date.now())
  const light = useRef<PointLight>(null)
  useFrame(() => {
    const g = growth()
    // Its fire goes out as the wave of the restoration sweeps it away.
    const swept =
      restoredAt === null
        ? 0
        : Math.min(1, (Date.now() - restoredAt) / 1000 / SWEEP_S)
    if (light.current) light.current.intensity = 120 * g * (1 - swept)
  })
  return (
    <group>
      <Puffs puffs={glowing} glow growth={growth} />
      <Puffs puffs={ash} glow={false} growth={growth} />
      <Smoke list={smoke} growth={growth} />
      {/* The shock wave runs out across the tile, ahead of the cloud, and sets it on fire. */}
      <Shockwave
        startedAt={startedAt}
        reach={Math.hypot(halfWidth, halfDepth)}
      />
      <Fires
        startedAt={startedAt}
        halfWidth={halfWidth}
        halfDepth={halfDepth}
      />
      <pointLight
        ref={light}
        position={[0, 6, 0]}
        color="#ff7b00"
        intensity={120}
        distance={36}
        decay={2}
      />
    </group>
  )
}
