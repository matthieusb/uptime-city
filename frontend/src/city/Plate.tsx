import { Line } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { LabelsHidden } from './Buildings'
import { Mesh, type Group } from 'three'
import { BUILDING_WIDTH, type Lot } from './layout'
import { approach, type Focus, type Pose } from './focus'
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
  // Where and how big it stands while a neighbourhood is in focus, if so.
  pose: Pose | null
  // Whether the pointer can pick it: not while another one is in focus.
  pickable: boolean
  // A joining tile, which only follows the others: it is never picked.
  inert?: boolean
  onSelect: () => void
  // In focus: the building in focus, if any, the pick of one, and the way back
  // to the whole neighbourhood.
  focusedLot?: string | null
  onSelectBuilding?: (lotId: string) => void
  onBack?: () => void
  children: ReactNode
}

// A neighbourhood on the map: it is tinted under the pointer, and a click
// puts it in focus, lifted in front of the others.
export default function Plate({
  plate,
  focus,
  pose,
  pickable: canPick,
  inert = false,
  onSelect,
  focusedLot = null,
  onSelectBuilding,
  onBack,
  children,
}: Props) {
  const group = useRef<Group>(null)
  const lifted = useRef(0)
  // The last pose stays too, to come back after the focus is gone.
  const posed = useRef<Pose>({ center: [0, 0, 0], scale: 1 })
  if (pose) posed.current = pose
  // Another neighbourhood is in focus: its labels are hidden.
  const behind = pose !== null && !focus
  // The last lift stays, to come back down after the focus is gone.
  const lift = useRef<Focus['lift']>([0, 0, 0])
  if (focus) lift.current = focus.lift
  const pickable = canPick && !inert
  const [hovered, setHovered] = useState(false)
  // The building under the pointer, to pick in focus view.
  const [hoveredLot, setHoveredLot] = useState<string | null>(null)
  const shown = hovered && pickable && !focus
  const pointing = shown || (!!focus && hoveredLot !== null)
  const { halfWidth, halfDepth, lots } = plate.layout

  useFrame((_, delta) => {
    const t = (lifted.current = approach(lifted.current, pose ? 1 : 0, delta))
    const { center, scale } = posed.current
    // Grows or shrinks around the middle of the screen.
    const k = 1 + (scale - 1) * t
    const [lx, ly, lz] = lift.current
    const own = focus ? t : 0
    group.current?.position.set(
      center[0] + k * (plate.x - center[0]) + lx * own,
      center[1] + k * (0 - center[1]) + ly * own,
      center[2] + k * (plate.z - center[2]) + lz * own,
    )
    group.current?.scale.setScalar(k)
  })

  useEffect(() => {
    document.body.style.cursor = pointing ? 'pointer' : ''
    return () => {
      document.body.style.cursor = ''
    }
  }, [pointing])

  // Only what the pointer can see of the neighbourhood picks it: its ground
  // and its buildings, not the sky above it.
  // Always a function: React Three Fiber would leave `undefined` on the mesh
  // when it is made pickable again, and nothing could pick it.
  const picks = pickable ? Mesh.prototype.raycast : NO_RAYCAST
  // `lot` is the building that the pointer is over, if it is a monitored one.
  const handlers = (lot?: Lot) => ({
    onPointerOver: (e: { stopPropagation: () => void }) => {
      e.stopPropagation()
      setHovered(true)
      setHoveredLot(lot && lot.id !== focusedLot ? lot.id : null)
    },
    onPointerOut: () => {
      setHovered(false)
      setHoveredLot(null)
    },
    onClick: (e: { stopPropagation: () => void; delta: number }) => {
      // A drag of the map is not a click.
      if (e.delta > 4) return
      e.stopPropagation()
      if (!focus) onSelect()
      else if (lot) {
        if (lot.id !== focusedLot) onSelectBuilding?.(lot.id)
      } else if (focusedLot) onBack?.()
    },
  })
  const hit = <meshBasicMaterial colorWrite={false} depthWrite={false} />

  return (
    <group ref={group} position={[plate.x, 0, plate.z]}>
      <LabelsHidden.Provider value={behind}>{children}</LabelsHidden.Provider>
      <mesh position={[0, HIT_HEIGHT, 0]} raycast={picks} {...handlers()}>
        <boxGeometry args={[2 * halfWidth, 0.1, 2 * halfDepth]} />
        {hit}
      </mesh>
      {lots.map((lot) => (
        <mesh
          key={lot.id}
          position={[lot.x, lot.height / 2, lot.z]}
          raycast={picks}
          {...handlers(lot.decor ? undefined : lot)}
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
