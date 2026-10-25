import { useFrame, useThree } from '@react-three/fiber'
import { createContext, useContext, useEffect, useMemo, useRef } from 'react'
import { Color, MeshLambertMaterial, type Group, type Sprite } from 'three'
import { badgeBreath, buildingGlow, type BuildingState } from '../domain/status'
import {
  collapseProgress,
  rebuildProgress,
  PRELUDE_S,
  floorPose,
  RUBBLE_HEIGHT,
  trackCollapse,
  type Collapse,
} from './collapse'
import {
  fromMiddle,
  lotCollapse,
  type SweepRange,
} from './effects/restoreShape'
import Demolition from './effects/Demolition'
import Fire from './effects/Fire'
import { flameSlots } from './effects/fireShape'
import { flashOf, prune, pushFloors } from './effects/floorEvents'
import FireTrucks from './effects/FireTrucks'
import Rebuild from './effects/Rebuild'
import Explosion, { type Exploded } from './effects/Explosion'
import {
  explodedFloors,
  explosionActive,
  floorBlast,
} from './effects/explosionShape'
import Recovery, { type Recovered } from './effects/Recovery'
import {
  floorFlash,
  recoveredFloors,
  recoveryActive,
} from './effects/recoveryShape'
import { floorBuilt } from './effects/rebuildShape'
import { floorBase, floorHeight, type Lot } from './layout'
import type { Way } from './world'
import { labelChange, labelShown, RESCALE, SHOW_CHANGED } from './labelView'
import { floorTexture, labelTexture, type Badge } from './textures'

export interface BuildingProps {
  lot: Lot
  name: string
  // One name per floor above the ground floor, the services.
  services: string[]
  // Which side of the building, on screen, the floor labels go to.
  labelSide?: 'left' | 'right'
  // Tells what the building is, next to its name, and how its services do.
  badge?: Badge | Badge[]
  // Whether the name and badge of the building show.
  showLabel?: boolean
  // Another building is in focus: none of its labels show.
  muted?: boolean
  state: BuildingState
  // Already in ruins, without falling before our eyes.
  ruined?: boolean
  // Charges go off at its foot before it falls, and dust rises once it has:
  // not for a building that falls with a blast of its own.
  demolished?: boolean
  // A nuke is on its way or has just hit: until this time, in milliseconds,
  // the building waits before it is demolished.
  holdUntil?: number
  // Fire trucks may come to hose it down when it lies in rubble.
  firefighters?: boolean
  // A service that comes back up shows a shock wave spreading from its floor.
  recovering?: boolean
  // A service that goes down blows its floor up.
  exploding?: boolean
  // Where the building stands on the map and the roads there are, for the trucks to come by.
  roads?: {
    x: number
    z: number
    ways: readonly Way[]
    roundabouts: readonly { x: number; z: number }[]
  }
  // The neighbourhood is being restored: the building stands again once the
  // wave, spreading from the middle, has passed it.
  restore?: { startedAt: number; range: SweepRange }
}

// Along the screen's right axis, (1, 0, -1) / sqrt(2), from the center of a
// building to just past its edge.
// No road: stable, so that nothing is computed again.
const NO_WAYS: never[] = []
const LABEL_GAP = 0.15
// The green that the floor of a recovery lights up with.
const RECOVERY_COLOR = new Color('#7dffa6')
// The orange that the floor of a blast lights up with, and how bright.
const BLAST_COLOR = new Color('#ffb347')
const BLAST_INTENSITY = 2.2
// Where the smoke of the rubble rises from: the one slot of its fire.
const RUBBLE_SLOT = [RUBBLE_HEIGHT / 2]

// The glow colors, parsed once instead of every frame.
const GLOW_COLORS = new Map<string, Color>()
function colorOf(hex: string): Color {
  let color = GLOW_COLORS.get(hex)
  if (!color) GLOW_COLORS.set(hex, (color = new Color(hex)))
  return color
}

// A floor is tall enough on screen for its label from this zoom.
const SERVICE_LABEL_ZOOM = 10

// Set by a neighbourhood whose labels are not shown, while another one is in
// focus.
export const LabelsHidden = createContext(false)

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
  badge?: Badge | Badge[]
  // Hidden while the camera is zoomed out further than this.
  minZoom?: number
  // Multiplies the on-screen size.
  size?: number
  order?: number
}) {
  const hidden = useContext(LabelsHidden)
  const gl = useThree((s) => s.gl)
  const sprite = useRef<Sprite>(null)
  const pulse = useRef<Sprite>(null)
  // Badges are often rebuilt on render: compare them by what they show.
  const badgeKey = [badge ?? []]
    .flat()
    .map((b) => `${b.text}|${b.color}|${b.textColor}`)
    .join()
  const label = useMemo(() => labelTexture(text, badge), [text, badgeKey])
  useEffect(
    () => () => {
      label.texture.dispose()
      label.pulse?.dispose()
    },
    [label],
  )
  // What the last frame left. A label zoomed out of sight is never drawn, so its texture would only
  // go to the GPU when it first shows, a hitch when zooming in: it is uploaded now instead.
  const last = useRef({ shown: true, zoom: NaN })
  useEffect(() => {
    gl.initTexture(label.texture)
    if (label.pulse) gl.initTexture(label.pulse)
  }, [gl, label])
  // A new texture or size needs its scale again.
  useEffect(() => {
    last.current.zoom = NaN
  }, [label, size])
  useFrame(({ camera, clock }) => {
    const shown = labelShown(hidden, camera.zoom, minZoom)
    const state = last.current
    const change = labelChange(state.shown, shown, state.zoom, camera.zoom)
    if (change & SHOW_CHANGED) {
      if (sprite.current) sprite.current.visible = shown
      if (pulse.current) pulse.current.visible = shown
      state.shown = shown
    }
    if (change & RESCALE) {
      // The same size on screen whatever the zoom.
      const w = (size * label.width) / camera.zoom
      const h = (size * label.height) / camera.zoom
      sprite.current?.scale.set(w, h, 1)
      pulse.current?.scale.set(w, h, 1)
      state.zoom = camera.zoom
    }
    // The counting badges are a layer of their own, which breathes.
    if (shown && pulse.current) {
      pulse.current.material.opacity = badgeBreath(clock.elapsedTime)
    }
  })
  return (
    <>
      <sprite
        ref={sprite}
        position={[x, y, z]}
        center={[anchor, 0.5]}
        renderOrder={order}
      >
        <spriteMaterial map={label.texture} depthTest={false} transparent />
      </sprite>
      {label.pulse && (
        <sprite
          ref={pulse}
          position={[x, y, z]}
          center={[anchor, 0.5]}
          renderOrder={order}
        >
          <spriteMaterial map={label.pulse} depthTest={false} transparent />
        </sprite>
      )}
    </>
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
  showLabel = true,
  muted = false,
  state,
  ruined = false,
  demolished = false,
  holdUntil = 0,
  firefighters = false,
  recovering = false,
  exploding = false,
  roads,
  restore,
}: BuildingProps) {
  const floors = useMemo(
    () =>
      Array.from({ length: lot.floors }, (_, i) => ({
        wall: new MeshLambertMaterial({
          map: floorTexture(lot.id, i, floorHeight(i), lot.width),
        }),
        slab: new MeshLambertMaterial({ color: '#7a7a85' }),
      })),
    [lot.id, lot.floors, lot.width],
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

  const delay = demolished ? PRELUDE_S : 0
  const groups = useRef<(Group | null)[]>([])
  const collapse = useRef<Collapse | null>(null)
  const seen = useRef<BuildingState | null>(null)
  const recovered = useRef<Recovered[]>([])
  const exploded = useRef<Exploded[]>([])
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    // Once per new state: the services that just came back up send a shock wave from their
    // floors, and the ones that just went down blow their floors up, then burn.
    if (seen.current !== state) {
      if (recovering && !ruined && !restore) {
        recovered.current = pushFloors(
          recovered.current,
          recoveredFloors(seen.current, state),
          t,
        )
      }
      if (exploding && !ruined && !restore) {
        exploded.current = pushFloors(
          exploded.current,
          explodedFloors(seen.current, state),
          t,
        )
      }
      seen.current = state
    }
    exploded.current = prune(exploded.current, t, explosionActive)
    recovered.current = prune(recovered.current, t, recoveryActive)
    collapse.current = trackCollapse(
      collapse.current,
      state.floors[0],
      t,
      Date.now() < holdUntil,
      demolished,
    )
    const progress = restore
      ? lotCollapse(
          fromMiddle(lot.x, lot.z),
          (Date.now() - restore.startedAt) / 1000,
          restore.range,
        )
      : ruined
        ? 1
        : collapseProgress(collapse.current, t, delay)
    const rebuilding =
      restore || ruined ? null : rebuildProgress(collapse.current, t)
    floors.forEach(({ wall, slab }, i) => {
      const pose = floorPose(lot.id, i, lot.floors, progress)
      // Going up again, floor by floor from the ground.
      const rebuilt =
        rebuilding === null ? 1 : floorBuilt(rebuilding, i, lot.floors)
      if (rebuilt < 1) {
        pose.y = floorBase(i) + (floorHeight(i) * rebuilt) / 2
        pose.sy = Math.max(rebuilt, 0.001)
      }
      const group = groups.current[i]
      if (group) group.visible = rebuilt > 0
      group?.position.set(pose.x, pose.y, pose.z)
      group?.rotation.set(pose.rx, 0, pose.rz)
      group?.scale.set(1, pose.sy, 1)
      // The rubble blinks red, so that a fallen host stays easy to spot.
      const glow = buildingGlow(
        state.collapsed ? 'down' : state.floors[i],
        t + i * 0.3,
      )
      // The floor of a service that came back up lights up green, and no other. The flash of
      // the blast of its own floor outshines the rest.
      const flash = flashOf(recovered.current, i, t, floorFlash)
      const blast = flashOf(exploded.current, i, t, floorBlast)
      const color =
        blast > 0
          ? BLAST_COLOR
          : flash > 0
            ? RECOVERY_COLOR
            : colorOf(glow.color)
      const intensity = Math.max(glow.intensity, flash, blast * BLAST_INTENSITY)
      for (const material of [wall, slab]) {
        material.emissive.copy(color)
        material.emissiveIntensity = intensity
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
              <boxGeometry args={[lot.width, height, lot.width]} />
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
      {state.burning.some(Boolean) && (
        <Fire id={lot.id} slots={flameSlots(state.burning)} width={lot.width} />
      )}
      {demolished && !ruined && !restore && (
        <Demolition
          id={lot.id}
          width={lot.width}
          height={lot.height}
          floors={lot.floors}
          delay={delay}
          collapse={collapse}
        />
      )}
      {demolished && !ruined && !restore && (
        <Rebuild
          id={lot.id}
          width={lot.width}
          floors={lot.floors}
          height={lot.height}
          collapse={collapse}
        />
      )}
      {exploding && !ruined && !restore && (
        <Explosion
          id={lot.id}
          width={lot.width}
          floors={lot.floors}
          exploded={exploded}
        />
      )}
      {recovering && !ruined && !restore && (
        <Recovery width={lot.width} floors={lot.floors} recovered={recovered} />
      )}
      {state.collapsed && (
        <Fire
          id={`${lot.id}:rubble`}
          slots={RUBBLE_SLOT}
          width={lot.width}
          smoke
        />
      )}
      {firefighters && !ruined && !restore && (
        <FireTrucks
          id={lot.id}
          width={lot.width}
          x={roads?.x ?? 0}
          z={roads?.z ?? 0}
          ways={roads?.ways ?? NO_WAYS}
          roundabouts={roads?.roundabouts ?? NO_WAYS}
          burning={state.burning}
          collapsed={state.collapsed}
        />
      )}
      {showLabel && !muted && <Label text={name} y={labelY} badge={badge} />}
      {/* Beside each floor, on the side of the building with room, on screen. Only a
          standing building has floors to point at. */}
      {!state.collapsed &&
        !muted &&
        services.map((service, i) => (
          <Label
            key={i}
            text={service}
            y={floorBase(i + 1) + floorHeight(i + 1) / 2}
            x={
              labelSide === 'right'
                ? lot.width / 2 + LABEL_GAP
                : -(lot.width / 2 + LABEL_GAP)
            }
            z={
              labelSide === 'right'
                ? -(lot.width / 2 + LABEL_GAP)
                : lot.width / 2 + LABEL_GAP
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
