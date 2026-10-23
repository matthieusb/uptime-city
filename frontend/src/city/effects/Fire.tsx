import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { Color, Object3D, type InstancedMesh, type PointLight } from 'three'
import { BUILDING_WIDTH, hash, seededRandom } from '../layout'

const COUNT = 18
// Flames lick a floor and the one above it, smoke rises higher.
const FIRE_RISE = 1.6
const SMOKE_RISE = 2.6
// Just outside the walls of a building.
const WALL = BUILDING_WIDTH / 2 + 0.05

// Flames fade from yellow to red, then turn to smoke.
function fireColor(life: number): string {
  if (life < 0.3) return '#ffd23f'
  if (life < 0.6) return '#ff7b00'
  if (life < 0.85) return '#d62828'
  return '#4a4a4a'
}

// A few embers, then grey dust.
function smokeColor(life: number): string {
  if (life < 0.12) return '#ff7b00'
  if (life < 0.5) return '#6b6b6b'
  return '#4a4a4a'
}

// Voxel fire: cubes rising from the windows of a floor whose base is at y,
// and shrinking as they burn out. With smoke, cubes of dust rise slowly from
// the rubble instead, without lighting it.
export default function Fire({
  id,
  y,
  smoke = false,
}: {
  id: string
  y: number
  smoke?: boolean
}) {
  const mesh = useRef<InstancedMesh>(null)
  const light = useRef<PointLight>(null)
  const particles = useMemo(() => {
    // Seeded, so that each floor burns its own way.
    const random = seededRandom(hash(`${smoke ? 'smoke' : 'fire'}:${id}`))
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
  }, [id, smoke])
  const dummy = useMemo(() => new Object3D(), [])
  const color = useMemo(() => new Color(), [])

  // Instance colors must exist before the first render to be compiled in.
  useLayoutEffect(() => {
    for (let i = 0; i < COUNT; i++)
      mesh.current?.setColorAt(i, color.set('#fff'))
  }, [color])

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    if (!mesh.current) return
    const rise = smoke ? SMOKE_RISE : FIRE_RISE
    particles.forEach((p, i) => {
      const life = (t * p.speed + p.phase) % 1
      const spread = smoke ? 1 + life * 0.3 : 1 - life * 0.4
      dummy.position.set(p.x * spread, y + life * rise, p.z * spread)
      dummy.scale.setScalar(
        smoke ? 0.2 + 0.3 * Math.sin(life * Math.PI) : 0.1 + 0.4 * (1 - life),
      )
      dummy.updateMatrix()
      mesh.current!.setMatrixAt(i, dummy.matrix)
      mesh.current!.setColorAt(
        i,
        color.set(smoke ? smokeColor(life) : fireColor(life)),
      )
    })
    mesh.current.instanceMatrix.needsUpdate = true
    if (mesh.current.instanceColor)
      mesh.current.instanceColor.needsUpdate = true
    if (light.current) {
      light.current.intensity = 8 + 3 * Math.sin(t * 17) + 2 * Math.random()
    }
  })

  return (
    <>
      <instancedMesh
        ref={mesh}
        args={[undefined, undefined, COUNT]}
        frustumCulled={false}
      >
        <boxGeometry />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      {!smoke && (
        <pointLight
          ref={light}
          position={[0, y + 1, 0]}
          color="#ff7b00"
          distance={7}
          decay={1.5}
        />
      )}
    </>
  )
}
