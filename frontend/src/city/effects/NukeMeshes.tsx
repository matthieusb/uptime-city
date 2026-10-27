import { useFrame } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import {
  CircleGeometry,
  Color,
  InstancedMesh,
  Object3D,
  SRGBColorSpace,
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
import { groundGlowLevel, rampColor } from './nukeShape'
import {
  ballCube,
  BALL_CUBES,
  capCube,
  CAP_CUBES,
  CLOUD_CUBES,
  newCube,
  snap,
  stemCube,
  VOXEL,
} from './voxelCloud'
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
    ring: createRingGeometry(),
    disc,
  }
  return assets
}

// How far the glow on the ground under the cloud reaches.
const GROUND_GLOW_RADIUS = 8
// Just over the ground, so that the glow is not lost in it.
const GLOW_Y = 0.15

// How fast the cubes move next to real time: slow, so that the cloud churns heavily.
const CLOUD_PACE = 0.5

// The colours a cube goes through, from white-hot to charcoal smoke, as ready-made colours.
const HEAT_STEPS = 24
const HEAT_COLORS = Array.from({ length: HEAT_STEPS }, (_, i) => {
  const [r, g, b] = rampColor(i / (HEAT_STEPS - 1))
  return new Color().setRGB(r / 255, g / 255, b / 255, SRGBColorSpace)
})

// The mushroom cloud: the fireball that swells and turns into the cap, the cap, a torus whose
// surface rolls, and the stem, all made of cubes in one instanced mesh (see `voxelCloud.ts`), each
// on a grid of its own size so that they step as they move, without a light. Plus a glow on the
// ground. `growth` is read every frame (0 to 1) and `glow` is how much of the glow on the ground
// is left (1 whole, 0 once the restoration has swept it). `size` is how much the whole cloud is
// scaled for its tile (see `cloudScale`), by the group, so that the look stays the same: the cubes
// are made taller or flatter to stay cubes once scaled.
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
  const groundMaterial = useMemo(
    () =>
      createGlowMaterial(
        { color: '#ff5a14', peak: 0, width: 0.6, fill: 0.6 },
        false,
      ),
    [],
  )
  useEffect(() => () => groundMaterial.dispose(), [groundMaterial])
  const cubes = useRef<InstancedMesh>(null)
  const ground = useRef<Mesh>(null)
  const cube = useMemo(() => newCube(), [])
  // What each cube was last written as, to rewrite only the ones that moved or changed colour:
  // snapped to the grid, most keep their place and colour from one update to the next.
  const written = useMemo(
    () => ({
      place: new Float32Array(4 * CLOUD_CUBES).fill(NaN),
      heat: new Int8Array(CLOUD_CUBES).fill(-1),
    }),
    [],
  )
  const frame = useRef(0)
  // The cloud is hidden while no cube is there.
  const blank = useRef(true)
  useLayoutEffect(() => {
    const instances = cubes.current
    if (!instances) return
    // Every cube starts as nothing: a matrix with a scale of 0.
    instances.instanceMatrix.array.fill(0)
    for (let i = 0; i < CLOUD_CUBES; i++) {
      instances.setColorAt(i, HEAT_COLORS[0])
      instances.instanceMatrix.array[16 * i + 15] = 1
    }
    instances.instanceMatrix.needsUpdate = true
    if (instances.instanceColor) instances.instanceColor.needsUpdate = true
    written.place.fill(NaN)
    written.heat.fill(-1)
    blank.current = true
  }, [written])
  // Once scaled by the group, a cube is as wide as it is high; the grid is squared the same way.
  const stretch = size.width / size.height
  useFrame(({ clock }) => {
    const g = growth()
    setTime(shared, clock.elapsedTime)

    // The cubes move at their own, slower pace, and are rewritten every other frame.
    const t = clock.elapsedTime * CLOUD_PACE
    const instances = cubes.current
    if (instances && frame.current++ % 2 === 0 && !(g <= 0 && blank.current)) {
      const matrices = instances.instanceMatrix.array
      let moved = false
      let recoloured = false
      let any = false
      for (let i = 0; i < CLOUD_CUBES; i++) {
        if (i < BALL_CUBES) ballCube(i, g, t, cube)
        else if (i < BALL_CUBES + CAP_CUBES) capCube(i - BALL_CUBES, g, t, cube)
        else stemCube(i - BALL_CUBES - CAP_CUBES, g, t, cube)
        const x = snap(cube.x, VOXEL)
        const y = snap(cube.y, VOXEL * stretch)
        const z = snap(cube.z, VOXEL)
        const s = cube.scale
        any ||= s > 0
        const at = 4 * i
        const place = written.place
        if (
          place[at] !== x ||
          place[at + 1] !== y ||
          place[at + 2] !== z ||
          place[at + 3] !== s
        ) {
          place[at] = x
          place[at + 1] = y
          place[at + 2] = z
          place[at + 3] = s
          // Position and scale only: the cubes never turn.
          const m = 16 * i
          matrices[m] = s
          matrices[m + 5] = s * stretch
          matrices[m + 10] = s
          matrices[m + 12] = x
          matrices[m + 13] = y
          matrices[m + 14] = z
          moved = true
        }
        const heat = Math.round(cube.heat * (HEAT_STEPS - 1))
        if (written.heat[i] !== heat) {
          written.heat[i] = heat
          instances.setColorAt(i, HEAT_COLORS[heat])
          recoloured = true
        }
      }
      if (moved) instances.instanceMatrix.needsUpdate = true
      if (recoloured && instances.instanceColor) {
        instances.instanceColor.needsUpdate = true
      }
      blank.current = !any
    }

    if (ground.current) {
      // The embers breathe a little.
      const level =
        groundGlowLevel(g) *
        glow() *
        (0.85 + 0.15 * Math.sin(clock.elapsedTime * 2.3)) *
        0.6
      ground.current.visible = level > 0.01
      setUniform(groundMaterial, 'uIntensity', level)
    }
  })
  const { disc } = sharedAssets()
  return (
    <group scale={[size.width, size.height, size.width]}>
      <instancedMesh
        ref={cubes}
        args={[undefined, undefined, CLOUD_CUBES]}
        frustumCulled={false}
      >
        <boxGeometry />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <mesh
        ref={ground}
        geometry={disc}
        material={groundMaterial}
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
      Object.values(materials).forEach((shaderMaterial) =>
        shaderMaterial.dispose(),
      )
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
    () => Math.min(...flames.map((flame) => flame.ignite)),
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
