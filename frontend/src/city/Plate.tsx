import { Line } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { LabelsHidden } from './Buildings'
import { borderRing } from './borders'
import { Matrix4, Mesh, Quaternion, Vector3, type Group } from 'three'
import { type Lot } from './layout'
import { approach, type Focus, type Pose } from './focus'
import { popScale } from './pop'
import type { Island } from './planet/island'
import type { Neighbourhood } from './world'

// Height of the flat part that catches the pointer, above the hills.
const HIT_HEIGHT = 1
// The tint that shows a hovered neighbourhood, above the hills too.
const TINT_HEIGHT = 2.2

// The size of a tile before it pops: tiny rather than hidden, so that it is drawn from the first
// frame and its shaders, textures and geometry are on the GPU before its pop (a hidden object is
// only uploaded when it first shows, which stutters).
const UNPOPPED = 1e-4

// The territory border of a neighbourhood, on the whole map: an outer and a fainter inner line.
const BORDER_HEIGHT = 0.3
const BORDER_INSET = 0.35
const BORDER_INNER_INSET = 1.1

// In the exploded view, each tile moves away from the middle of the map by this share of its
// distance to it, so that the gap between two tiles follows their size.
export const EXPLODE_SPREAD = 0.15

const NO_RAYCAST = () => null

interface Props {
  plate: Neighbourhood
  // Set when this neighbourhood is the one in focus.
  focus: Focus | null
  // Where and how big it stands while a neighbourhood is in focus, if so.
  pose: Pose | null
  // Whether the pointer can pick it: not while another one is in focus.
  pickable: boolean
  // Whether the territory border shows (the borders effect).
  borders?: boolean
  // The colour of its border, its own among the neighbourhoods.
  borderColor?: string
  // Whether the exploded view is on: the tiles are set a little apart.
  exploded?: boolean
  // On the planet: where the island stands and how it lies on the sphere, in place of its x and
  // z on the flat map. It never moves apart nor into focus.
  placement?: Pick<Island, 'center' | 'normal' | 'xAxis' | 'zAxis'>
  // A joining tile, which only follows the others: it is never picked.
  inert?: boolean
  // Tells where its group is, for what drives across the plates (the traffic), or that it is gone.
  register?: (id: string, group: Group | null) => void
  // When it pops up in the intro, in seconds after it begins; none, and it is there from the start.
  popDelay?: number
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
  borders = true,
  borderColor = '#ffffff',
  exploded = false,
  inert = false,
  placement,
  register,
  popDelay,
  onSelect,
  focusedLot = null,
  onSelectBuilding,
  onBack,
  children,
}: Props) {
  const group = useRef<Group>(null)
  const lifted = useRef(0)
  // How far apart it stands, from 0 to 1, easing towards the exploded view.
  const apart = useRef(0)
  // The time of the first frame, when the intro begins for this tile.
  const born = useRef<number | null>(null)
  // The last pose stays too, to come back after the focus is gone.
  const posed = useRef<Pose>({ center: [0, 0, 0], scale: 1 })
  if (pose) posed.current = pose
  // Another neighbourhood is in focus: its labels are hidden.
  const behind = pose !== null && !focus
  // The last lift stays, to come back down after the focus is gone.
  const lift = useRef<Focus['lift']>([0, 0, 0])
  if (focus) lift.current = focus.lift
  // Its up is the normal of the sphere there, its X and Z the tangent axes.
  const orientation = useMemo(
    () =>
      placement
        ? new Quaternion().setFromRotationMatrix(
            new Matrix4().makeBasis(
              new Vector3(...placement.xAxis),
              new Vector3(...placement.normal),
              new Vector3(...placement.zAxis),
            ),
          )
        : null,
    [placement],
  )
  const pickable = canPick && !inert
  const [hovered, setHovered] = useState(false)
  // The building under the pointer, to pick in focus view.
  const [hoveredLot, setHoveredLot] = useState<string | null>(null)
  const shown = hovered && pickable && !focus
  const pointing = shown || (!!focus && hoveredLot !== null)
  const { halfWidth, halfDepth, lots } = plate.layout

  useFrame(({ clock }, delta) => {
    born.current ??= clock.elapsedTime
    const pop =
      popDelay === undefined
        ? 1
        : popScale(clock.elapsedTime - born.current, popDelay)
    if (placement && orientation) {
      group.current?.position.set(...placement.center)
      group.current?.quaternion.copy(orientation)
      group.current?.scale.setScalar(Math.max(pop, UNPOPPED))
      return
    }
    const t = (lifted.current = approach(lifted.current, pose ? 1 : 0, delta))
    apart.current = approach(apart.current, exploded ? 1 : 0, delta, 5)
    // The focus view takes over, and the tiles come back together under it.
    const spread = 1 + EXPLODE_SPREAD * apart.current * (1 - t)
    const { center, scale } = posed.current
    // Grows or shrinks around the middle of the screen.
    const k = 1 + (scale - 1) * t
    const [lx, ly, lz] = lift.current
    const own = focus ? t : 0
    group.current?.position.set(
      center[0] + k * (plate.x * spread - center[0]) + lx * own,
      center[1] + k * (0 - center[1]) + ly * own,
      center[2] + k * (plate.z * spread - center[2]) + lz * own,
    )
    group.current?.scale.setScalar(k * Math.max(pop, UNPOPPED))
  })

  useEffect(() => {
    register?.(plate.id, group.current)
    return () => register?.(plate.id, null)
  }, [register, plate.id])

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
    <group
      ref={group}
      position={[plate.x, 0, plate.z]}
      scale={popDelay === undefined ? 1 : UNPOPPED}
    >
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
          <boxGeometry args={[lot.width, lot.height, lot.width]} />
          {hit}
        </mesh>
      ))}
      {borders && !inert && !pose && (
        <>
          <Line
            points={borderRing(
              halfWidth,
              halfDepth,
              BORDER_INSET,
              BORDER_HEIGHT,
            )}
            color={borderColor}
            lineWidth={3.5}
            transparent
            opacity={0.95}
            depthTest={false}
            raycast={() => null}
          />
          <Line
            points={borderRing(
              halfWidth,
              halfDepth,
              BORDER_INNER_INSET,
              BORDER_HEIGHT,
            )}
            color={borderColor}
            lineWidth={1.5}
            transparent
            opacity={0.45}
            depthTest={false}
            raycast={() => null}
          />
        </>
      )}
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
