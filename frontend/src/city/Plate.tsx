import { Line } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Mesh, type Group } from 'three'
import { BUILDING_WIDTH } from './layout'
import { approach, type Focus } from './focus'
import type { Neighbourhood } from './world'

// Height of the flat part that catches the pointer, above the hills.
const HIT_HEIGHT = 1
// The tint that shows a hovered neighbourhood, above the hills too.
const TINT_HEIGHT = 2.2

const NO_RAYCAST = () => null

interface Props {
  plate: Neighbourhood
  // Set when this neighbourhood is the one in focus.
  focus: Focus | null
  // Whether the pointer can pick it: not while another one is in focus.
  pickable: boolean
  onSelect: () => void
  children: ReactNode
}

// A neighbourhood on the map: it is tinted under the pointer, and a click
// puts it in focus, lifted in front of the others.
export default function Plate({
  plate,
  focus,
  pickable,
  onSelect,
  children,
}: Props) {
  const group = useRef<Group>(null)
  const lifted = useRef(0)
  // The last lift stays, to come back down after the focus is gone.
  const lift = useRef<Focus['lift']>([0, 0, 0])
  if (focus) lift.current = focus.lift
  const [hovered, setHovered] = useState(false)
  const shown = hovered && pickable && !focus
  const { halfWidth, halfDepth, lots } = plate.layout

  useFrame((_, delta) => {
    lifted.current = approach(lifted.current, focus ? 1 : 0, delta)
    const [lx, ly, lz] = lift.current
    group.current?.position.set(
      plate.x + lx * lifted.current,
      ly * lifted.current,
      plate.z + lz * lifted.current,
    )
  })

  useEffect(() => {
    document.body.style.cursor = shown ? 'pointer' : ''
    return () => {
      document.body.style.cursor = ''
    }
  }, [shown])

  // Only what the pointer can see of the neighbourhood picks it: its ground
  // and its buildings, not the sky above it.
  // Always a function: React Three Fiber would leave `undefined` on the mesh
  // when it is made pickable again, and nothing could pick it.
  const picks = pickable ? Mesh.prototype.raycast : NO_RAYCAST
  const handlers = {
    onPointerOver: (e: { stopPropagation: () => void }) => {
      e.stopPropagation()
      setHovered(true)
    },
    onPointerOut: () => setHovered(false),
    onClick: (e: { stopPropagation: () => void; delta: number }) => {
      // A drag of the map is not a click.
      if (e.delta > 4) return
      e.stopPropagation()
      onSelect()
    },
  }
  const hit = <meshBasicMaterial colorWrite={false} depthWrite={false} />

  return (
    <group ref={group} position={[plate.x, 0, plate.z]}>
      {children}
      <mesh position={[0, HIT_HEIGHT, 0]} raycast={picks} {...handlers}>
        <boxGeometry args={[2 * halfWidth, 0.1, 2 * halfDepth]} />
        {hit}
      </mesh>
      {lots.map((lot) => (
        <mesh
          key={lot.id}
          position={[lot.x, lot.height / 2, lot.z]}
          raycast={picks}
          {...handlers}
        >
          <boxGeometry args={[BUILDING_WIDTH, lot.height, BUILDING_WIDTH]} />
          {hit}
        </mesh>
      ))}
      {shown && (
        <>
          <mesh
            position={[0, TINT_HEIGHT, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            raycast={() => null}
          >
            <planeGeometry args={[2 * halfWidth, 2 * halfDepth]} />
            <meshBasicMaterial
              color="#ffffff"
              transparent
              opacity={0.14}
              depthWrite={false}
            />
          </mesh>
          <Line
            points={[
              [-halfWidth, 0.3, -halfDepth],
              [halfWidth, 0.3, -halfDepth],
              [halfWidth, 0.3, halfDepth],
              [-halfWidth, 0.3, halfDepth],
              [-halfWidth, 0.3, -halfDepth],
            ]}
            color="#ffffff"
            lineWidth={2}
            transparent
            opacity={0.7}
            depthTest={false}
            raycast={() => null}
          />
        </>
      )}
    </group>
  )
}
