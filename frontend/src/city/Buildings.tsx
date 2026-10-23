import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { MeshLambertMaterial, type Group, type Sprite } from 'three'
import { buildingGlow, type BuildingState } from '../domain/status'
import {
  collapseProgress,
  floorPose,
  RUBBLE_HEIGHT,
  trackCollapse,
  type Collapse,
} from './collapse'
import Fire from './effects/Fire'
import { BUILDING_WIDTH, floorBase, floorHeight, type Lot } from './layout'
import { floorTexture, labelTexture, type Badge } from './textures'

export interface BuildingProps {
  lot: Lot
  name: string
  // One name per floor above the ground floor, the services.
  services: string[]
  // Which side of the building, on screen, the floor labels go to.
  labelSide?: 'left' | 'right'
  // Tells what the building is, next to its name.
  badge?: Badge
  state: BuildingState
  // Already in ruins, without falling before our eyes.
  ruined?: boolean
}

// Along the screen's right axis, (1, 0, -1) / sqrt(2), from the center of a
// building to just past its edge.
const SERVICE_LABEL_OFFSET = BUILDING_WIDTH / 2 + 0.15

// A floor is tall enough on screen for its label from this zoom.
const SERVICE_LABEL_ZOOM = 10

// The host name, always on top and at the same size on screen whatever the
// zoom. A sprite rather than a drei `Html` label: with React 19, the first
// `Html` label rendered empty.
export function Label({
  text,
  y,
  x = 0,
  z = 0,
  anchor = 0.5,
  badge,
  minZoom = 0,
  size = 1,
  order = 1,
}: {
  text: string
  y: number
  x?: number
  z?: number
  // 0 puts the label's left edge at the position, 0.5 centers it.
  anchor?: number
  badge?: Badge
  // Hidden while the camera is zoomed out further than this.
  minZoom?: number
  // Multiplies the on-screen size.
  size?: number
  order?: number
}) {
  const sprite = useRef<Sprite>(null)
  const label = useMemo(() => labelTexture(text, badge), [text, badge])
  useEffect(() => () => label.texture.dispose(), [label])
  useFrame(({ camera }) => {
    if (!sprite.current) return
    sprite.current.visible = camera.zoom >= minZoom
    sprite.current.scale.set(
      (size * label.width) / camera.zoom,
      (size * label.height) / camera.zoom,
      1,
    )
  })
  return (
    <sprite
      ref={sprite}
      position={[x, y, z]}
      center={[anchor, 0.5]}
      renderOrder={order}
    >
      <spriteMaterial map={label.texture} depthTest={false} transparent />
    </sprite>
  )
}

// One floor per service on the host's ground floor. Each floor glows on its
// own, and they all fall into rubble when the host is down.
function Building({
  lot,
  name,
  services,
  labelSide = 'right',
  badge,
  state,
  ruined = false,
}: BuildingProps) {
  const floors = useMemo(
    () =>
      Array.from({ length: lot.floors }, (_, i) => ({
        wall: new MeshLambertMaterial({
          map: floorTexture(lot.id, i, floorHeight(i)),
        }),
        slab: new MeshLambertMaterial({ color: '#7a7a85' }),
      })),
    [lot.id, lot.floors],
  )
  useEffect(
    () => () => {
      for (const { wall, slab } of floors) {
        wall.map?.dispose()
        wall.dispose()
        slab.dispose()
      }
    },
    [floors],
  )

  const groups = useRef<(Group | null)[]>([])
  const collapse = useRef<Collapse | null>(null)
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    collapse.current = trackCollapse(collapse.current, state.floors[0], t)
    const progress = ruined ? 1 : collapseProgress(collapse.current, t)
    floors.forEach(({ wall, slab }, i) => {
      const pose = floorPose(lot.id, i, lot.floors, progress)
      const group = groups.current[i]
      group?.position.set(pose.x, pose.y, pose.z)
      group?.rotation.set(pose.rx, 0, pose.rz)
      group?.scale.set(1, pose.sy, 1)
      // The rubble blinks red, so that a fallen host stays easy to spot.
      const glow = buildingGlow(
        state.collapsed ? 'down' : state.floors[i],
        t + i * 0.3,
      )
      for (const material of [wall, slab]) {
        material.emissive.set(glow.color)
        material.emissiveIntensity = glow.intensity
      }
    })
  })

  const topBurning = state.burning.at(-1) ?? false
  const labelY = state.collapsed
    ? RUBBLE_HEIGHT + 2.2
    : lot.height + (topBurning ? 1.8 : 0.9)
  return (
    <group position={[lot.x, 0, lot.z]}>
      {floors.map(({ wall, slab }, i) => {
        const height = floorHeight(i)
        return (
          <group
            key={i}
            ref={(group) => {
              groups.current[i] = group
            }}
            position={[0, floorBase(i) + height / 2, 0]}
          >
            {/* Box faces: +x, -x, +y, -y, +z, -z */}
            <mesh
              material={[wall, wall, slab, slab, wall, wall]}
              castShadow
              receiveShadow
            >
              <boxGeometry args={[BUILDING_WIDTH, height, BUILDING_WIDTH]} />
            </mesh>
            {i === lot.floors - 1 && (
              <mesh
                position={[0.7, height / 2 + 0.25, -0.7]}
                material={slab}
                castShadow
              >
                <boxGeometry args={[0.9, 0.5, 0.9]} />
              </mesh>
            )}
          </group>
        )
      })}
      {state.burning.map(
        (burning, i) =>
          burning && <Fire key={i} id={`${lot.id}:${i}`} y={floorBase(i)} />,
      )}
      {state.collapsed && <Fire id={lot.id} y={RUBBLE_HEIGHT / 2} smoke />}
      <Label text={name} y={labelY} badge={badge} size={name ? 1 : 1.4} />
      {/* Beside each floor, on the side of the building with room, on screen. Only a
          standing building has floors to point at. */}
      {!state.collapsed &&
        services.map((service, i) => (
          <Label
            key={i}
            text={service}
            y={floorBase(i + 1) + floorHeight(i + 1) / 2}
            x={
              labelSide === 'right'
                ? SERVICE_LABEL_OFFSET
                : -SERVICE_LABEL_OFFSET
            }
            z={
              labelSide === 'right'
                ? -SERVICE_LABEL_OFFSET
                : SERVICE_LABEL_OFFSET
            }
            anchor={labelSide === 'right' ? 0 : 1}
            minZoom={SERVICE_LABEL_ZOOM}
          />
        ))}
    </group>
  )
}

export default function Buildings({
  buildings,
}: {
  buildings: BuildingProps[]
}) {
  return buildings.map((building) => (
    <Building key={building.lot.id} {...building} />
  ))
}
