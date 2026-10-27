import { useFrame } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import {
  CircleGeometry,
  IcosahedronGeometry,
  InstancedMesh,
  LatheGeometry,
  Object3D,
  Vector2,
  type BufferGeometry,
  type DataTexture,
  type Mesh,
} from 'three'
import {
  blastActive,
  blastFade,
  blastHeat,
  blastRadius,
  blastWallHeight,
  CUBES,
  fireFlames,
  flameBurn,
  flameCube,
  waveThickness,
} from './blastShape'
import {
  CAP_HEAT_SPAN,
  capHeat,
  capLift,
  capMajor,
  capMinor,
  capMinorY,
  capRoll,
  capScale,
  fireballHeat,
  fireballRadius,
  fireballY,
  groundGlowLevel,
  stemHeat,
  stemHeight,
  stemProfile,
  stemWidth,
  STEM_HEIGHT,
} from './nukeShape'
import {
  createBodyMaterial,
  createGlowMaterial,
  createNukeUniforms,
  createRampTexture,
  createRingGeometry,
  setRing,
  setTime,
  setUniform,
} from './nukeShader'
import { FIRE_STAGES } from './fireShape'
import { sinceImpact } from './strikeShape'

// What every nuke shares, made once, on first use: the ramp of colours and the unit geometries.
// The materials are not shared, since each nuke fades and grows by itself.
interface Assets {
  ramp: DataTexture
  fireball: BufferGeometry
  stem: BufferGeometry
  ring: BufferGeometry
  disc: BufferGeometry
}

let assets: Assets | null = null

function sharedAssets(): Assets {
  if (assets) return assets
  const disc = new CircleGeometry(1, 48)
  disc.rotateX(-Math.PI / 2)
  assets = {
    ramp: createRampTexture(),
    fireball: new IcosahedronGeometry(1, 5),
    stem: new LatheGeometry(
      stemProfile(40).map((p) => new Vector2(p.r, p.y)),
      28,
    ),
    ring: createRingGeometry(),
    disc,
  }
  return assets
}

// How far the glow on the ground under the cloud reaches.
const GROUND_GLOW_RADIUS = 8
// Just over the ground, so that the glow is not lost in it.
const GLOW_Y = 0.15

// The mushroom cloud, in four meshes with a shader each: a fireball that swells and turns into
// the cap, the cap, a torus whose surface rolls, the stem, lit from inside, and a glow on the
// ground. No light: they are all emissive. `growth` is read every frame (0 to 1) and `glow` is
// how much of the glow on the ground is left (1 whole, 0 once the restoration has swept it).
// `size` is how much the whole cloud is scaled for its tile (see `cloudScale`), by the group, so
// that the noise, the displacement and the glow grow with it and the look stays the same.
export function Mushroom({
  growth,
  glow,
  size,
}: {
  growth: () => number
  glow: () => number
  size: { width: number; height: number }
}) {
  const shared = useMemo(() => createNukeUniforms(sharedAssets().ramp), [])
  const materials = useMemo(
    () => ({
      fireball: createBodyMaterial('fireball', shared),
      stem: createBodyMaterial('stem', shared),
      cap: createBodyMaterial('cap', shared),
      ground: createGlowMaterial(
        { color: '#ff5a14', peak: 0, width: 0.6, fill: 0.6 },
        false,
      ),
    }),
    [shared],
  )
  useEffect(
    () => () => {
      Object.values(materials).forEach((m) => m.dispose())
    },
    [materials],
  )
  const fireball = useRef<Mesh>(null)
  const stem = useRef<Mesh>(null)
  const cap = useRef<Mesh>(null)
  const ground = useRef<Mesh>(null)
  useFrame(({ clock }) => {
    const g = growth()
    const t = clock.elapsedTime
    setTime(shared, t)

    const radius = fireballRadius(g)
    if (fireball.current) {
      fireball.current.visible = radius > 0.02
      fireball.current.scale.setScalar(radius)
      fireball.current.position.y = fireballY(g)
      setUniform(materials.fireball, 'uHeat', fireballHeat(g))
    }

    if (cap.current) {
      cap.current.visible = capScale(g) > 0.01
      cap.current.position.y = capLift(g)
      setRing(materials.cap, capMajor(g), capMinor(g), capMinorY(g), capRoll(t))
      setUniform(materials.cap, 'uHeat', capHeat(g))
      setUniform(materials.cap, 'uHeatSpan', CAP_HEAT_SPAN)
    }

    if (stem.current) {
      const width = stemWidth(g)
      stem.current.visible = g > 0.005
      stem.current.scale.set(width, stemHeight(g) / STEM_HEIGHT, width)
      setUniform(materials.stem, 'uHeat', stemHeat(0, g))
      setUniform(materials.stem, 'uHeatSpan', stemHeat(1, g) - stemHeat(0, g))
    }

    if (ground.current) {
      // The embers breathe a little.
      const level =
        groundGlowLevel(g) * glow() * (0.85 + 0.15 * Math.sin(t * 2.3)) * 0.6
      ground.current.visible = level > 0.01
      setUniform(materials.ground, 'uIntensity', level)
    }
  })
  const { fireball: ball, stem: column, ring, disc } = sharedAssets()
  return (
    <group scale={[size.width, size.height, size.width]}>
      <mesh
        ref={fireball}
        geometry={ball}
        material={materials.fireball}
        frustumCulled={false}
        visible={false}
      />
      <mesh
        ref={stem}
        geometry={column}
        material={materials.stem}
        frustumCulled={false}
        visible={false}
      />
      <mesh
        ref={cap}
        geometry={ring}
        material={materials.cap}
        frustumCulled={false}
        visible={false}
      />
      <mesh
        ref={ground}
        geometry={disc}
        material={materials.ground}
        // Just over the ground whatever the height of the cloud.
        position={[0, GLOW_Y / size.height, 0]}
        scale={GROUND_GLOW_RADIUS}
        frustumCulled={false}
        visible={false}
      />
    </group>
  )
}

// Where the front of the wave is on its glow, as a fraction of the radius of the disc.
const FRONT = 0.88

// The shock wave of the impact, a wave of fire: a torus of flames standing on the circle of the
// wave, eaten away by its noise as it runs out across the tile to its farthest corner, over a
// red-orange glow on the ground and in its wake. Both are drawn only while it runs.
export function Shockwave({
  startedAt,
  reach,
}: {
  startedAt: number | null
  reach: number
}) {
  const shared = useMemo(() => createNukeUniforms(sharedAssets().ramp), [])
  const materials = useMemo(
    () => ({
      wave: createBodyMaterial('wave', shared),
      glow: createGlowMaterial(
        { color: '#ff7a1a', peak: FRONT, width: 0.12, fill: 0.35 },
        false,
      ),
    }),
    [shared],
  )
  useEffect(
    () => () => {
      Object.values(materials).forEach((m) => m.dispose())
    },
    [materials],
  )
  const wave = useRef<Mesh>(null)
  const glow = useRef<Mesh>(null)
  useFrame(({ clock }) => {
    const since = sinceImpact(startedAt, Date.now())
    const active = blastActive(since)
    if (wave.current) wave.current.visible = active
    if (glow.current) glow.current.visible = active
    if (!active) return
    const radius = Math.max(0.01, blastRadius(since, reach))
    const fade = blastFade(since)
    setTime(shared, clock.elapsedTime)
    const { wave: body } = materials
    setRing(body, radius, waveThickness(radius), blastWallHeight(since), 0)
    setUniform(body, 'uFade', fade)
    setUniform(body, 'uHeat', blastHeat(since))
    setUniform(body, 'uHeatSpan', 0.3)
    // The disc reaches past the front, which sits at FRONT of its radius.
    glow.current?.scale.setScalar(radius / FRONT)
    setUniform(materials.glow, 'uIntensity', 0.9 * fade)
  })
  const { ring, disc } = sharedAssets()
  return (
    <>
      <mesh
        ref={wave}
        geometry={ring}
        material={materials.wave}
        frustumCulled={false}
        visible={false}
      />
      <mesh
        ref={glow}
        geometry={disc}
        material={materials.glow}
        position={[0, GLOW_Y, 0]}
        frustumCulled={false}
        visible={false}
      />
    </>
  )
}

// The fires that the wave sets off over the tile, each when it reaches it, as many as the size of
// the tile asks for: columns of voxel flames, all in one instanced mesh and without a light. Each
// cube rises, shrinks and darkens as it burns (`flameCube`) and the column grows as `flameBurn`
// says. They flicker for ever, so they are rewritten every other frame, except while none is lit.
export function Fires({
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
  // When the first fire catches.
  const firstLit = useMemo(
    () => Math.min(...flames.map((f) => f.ignite)),
    [flames],
  )
  const dummy = useMemo(() => new Object3D(), [])
  const frame = useRef(0)
  // Whether every cube is written as nothing, so that there is nothing to rewrite before a fire.
  const blank = useRef(true)
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
    if (instances.instanceColor) instances.instanceColor.needsUpdate = true
    blank.current = true
  }, [dummy, flames.length])
  useFrame(({ clock }) => {
    const instances = mesh.current
    if (!instances || frame.current++ % 2 !== 0) return
    const since = sinceImpact(startedAt, Date.now())
    const unlit = since < firstLit
    if (unlit && blank.current) return
    const t = clock.elapsedTime
    for (let f = 0; f < flames.length; f++) {
      const flame = flames[f]
      const burn = flameBurn(flame, since)
      for (let k = 0; k < CUBES; k++) {
        const cube = flameCube(flame, k, t)
        dummy.position.set(cube.x, cube.y * burn, cube.z)
        dummy.scale.setScalar(cube.scale * burn)
        dummy.updateMatrix()
        instances.setMatrixAt(f * CUBES + k, dummy.matrix)
        instances.setColorAt(f * CUBES + k, FIRE_STAGES.fire[cube.stage])
      }
    }
    instances.instanceMatrix.needsUpdate = true
    if (instances.instanceColor) instances.instanceColor.needsUpdate = true
    blank.current = unlit
  })
  return (
    <instancedMesh
      key={flames.length}
      ref={mesh}
      args={[undefined, undefined, flames.length * CUBES]}
      frustumCulled={false}
    >
      <boxGeometry />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  )
}
