import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import {
  Color,
  Object3D,
  Quaternion,
  Vector3,
  type Group,
  type InstancedMesh,
  type Mesh,
  type MeshBasicMaterial,
  type PointLight,
} from 'three'
import {
  MISSILE_S,
  DEFAULT_COURSE,
  type Course,
  STRIKE_S,
  flashLevel,
  missileAt,
  missileBoxes,
  trailPuff,
  trailSeeds,
} from './strikeShape'

const HOT = new Color('#fff1d6')
const SMOKE = new Color('#ffffff')
const COOL = new Color('#d9dbe0')

// The smoke of the engine: many translucent puffs that swell, drift, swirl
// and thin out. They overlap, so that their translucency adds up to a
// volume, denser at the core than at the edges.
function Trail({ since, course }: { since: () => number; course: Course }) {
  const mesh = useRef<InstancedMesh>(null)
  const seeds = useMemo(() => trailSeeds(), [])
  const dummy = useMemo(() => new Object3D(), [])
  const color = useMemo(() => new Color(), [])
  useFrame(() => {
    if (!mesh.current) return
    const t = since()
    seeds.forEach((seed, i) => {
      const puff = trailPuff(seed, t, course)
      if (!puff) {
        dummy.scale.setScalar(0)
      } else {
        dummy.position.set(puff.x, puff.y, puff.z)
        dummy.scale.setScalar(puff.radius)
      }
      dummy.updateMatrix()
      mesh.current!.setMatrixAt(i, dummy.matrix)
      if (puff) {
        // White-hot at the engine, then white smoke, then grey as it thins.
        color.copy(SMOKE).lerp(COOL, Math.min(1, (t - seed.emit) / 4) * 0.6)
        color.lerp(HOT, puff.heat)
        mesh.current!.setColorAt(i, color)
      }
    })
    mesh.current.instanceMatrix.needsUpdate = true
    if (mesh.current.instanceColor)
      mesh.current.instanceColor.needsUpdate = true
  })
  return (
    <instancedMesh
      ref={mesh}
      args={[undefined, undefined, seeds.length]}
      frustumCulled={false}
    >
      <sphereGeometry args={[1, 16, 12]} />
      <meshStandardMaterial
        roughness={1}
        transparent
        opacity={0.5}
        depthWrite={false}
      />
    </instancedMesh>
  )
}

// The rocket, in boxes like the rest of the town, nose down.
function Missile({ since, course }: { since: () => number; course: Course }) {
  const group = useRef<Group>(null)
  const flame = useRef<Mesh>(null)
  const boxes = useMemo(() => missileBoxes(), [])
  const down = useMemo(() => new Vector3(0, -1, 0), [])
  const heading = useMemo(() => new Vector3(), [])
  const quaternion = useMemo(() => new Quaternion(), [])
  useFrame(({ clock }) => {
    const t = since()
    if (!group.current) return
    group.current.visible = t < MISSILE_S
    const pose = missileAt(t, course)
    group.current.position.set(pose.x, pose.y, pose.z)
    heading.set(...pose.dir)
    group.current.quaternion.copy(quaternion.setFromUnitVectors(down, heading))
    // The engine flickers.
    flame.current?.scale.set(1, 0.8 + 0.5 * Math.sin(clock.elapsedTime * 60), 1)
  })
  return (
    <group ref={group}>
      {boxes.map((b, i) => (
        <mesh key={i} position={[b.x, b.y, b.z]} castShadow>
          <boxGeometry args={[b.w, b.h, b.d]} />
          <meshStandardMaterial color={b.color} roughness={0.6} />
        </mesh>
      ))}
      <mesh ref={flame} position={[0, 2.35, 0]}>
        <boxGeometry args={[0.5, 0.8, 0.5]} />
        <meshBasicMaterial color="#ffb703" />
      </mesh>
    </group>
  )
}

// The white ball and the light of the explosion, at the impact.
function Flash({ since }: { since: () => number }) {
  const ball = useRef<Mesh>(null)
  const light = useRef<PointLight>(null)
  useFrame(() => {
    const level = flashLevel(since() - MISSILE_S)
    if (ball.current) {
      ball.current.visible = level > 0
      ball.current.scale.setScalar(2 + 14 * (1 - level))
      ;(ball.current.material as MeshBasicMaterial).opacity = 0.9 * level
    }
    if (light.current) light.current.intensity = 900 * level * level
  })
  return (
    <>
      <mesh ref={ball} position={[0, 1.5, 0]}>
        <sphereGeometry args={[1, 24, 16]} />
        <meshBasicMaterial color="#fff3d0" transparent depthWrite={false} />
      </mesh>
      <pointLight
        ref={light}
        position={[0, 4, 0]}
        color="#fff0c0"
        intensity={0}
        distance={50}
        decay={2}
      />
    </>
  )
}

// A missile that falls on the middle of a tile with a trail of smoke and
// explodes. It tells when it hits the ground (`onImpact`) and when all is
// over (`onDone`), so that the tile can be nuked at the right time.
export default function Strike({
  startedAt,
  course = DEFAULT_COURSE,
  onImpact,
  onDone,
}: {
  startedAt: number
  course?: Course
  onImpact: () => void
  onDone: () => void
}) {
  const since = () => (Date.now() - startedAt) / 1000
  const impacted = useRef(false)
  const done = useRef(false)
  useFrame(() => {
    const t = since()
    if (!impacted.current && t >= MISSILE_S) {
      impacted.current = true
      onImpact()
    }
    if (!done.current && t >= STRIKE_S) {
      done.current = true
      onDone()
    }
  })
  return (
    <group>
      <Trail since={since} course={course} />
      <Missile since={since} course={course} />
      <Flash since={since} />
    </group>
  )
}
