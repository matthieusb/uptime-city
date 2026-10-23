import { MapControls } from '@react-three/drei'
import { Canvas, useThree } from '@react-three/fiber'
import { useQueries, useQuery } from '@tanstack/react-query'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { EndpointInfo } from '../api/client'
import {
  buildingSummariesQuery,
  historyQuery,
  hostSummariesQuery,
} from '../api/queries'
import { buildingFloors } from '../domain/floors'
import { allHosts, groupByHost } from '../domain/hosts'
import { buildingState, latestStatus, nukedState } from '../domain/status'
import { serviceLabelSides } from './layout'
import Buildings, { Label, type BuildingProps } from './Buildings'
import {
  buildingFrame,
  FAR,
  fitZoom,
  focusFor,
  NEAR,
  plateFrame,
} from './focus'
import {
  Backdrop,
  CameraRig,
  MAX_ZOOM,
  MIN_ZOOM,
  type Controls,
} from './FocusRig'
import Nuke from './effects/Nuke'
import { NUKE_HEIGHT } from './effects/nukeShape'
import BuildingPanel from './BuildingPanel'
import HostTitle from './HostTitle'
import LabelLegend from './LabelLegend'
import {
  ALL_LABELS,
  badgeOf,
  buildingBadges,
  hostBadges,
  shortBadgeOf,
  DEFAULT_LABELS,
  type LabelKind,
} from './labels'
import Plate from './Plate'
import Scenery from './Scenery'
import { nukedLayout, worldFrame, worldLayout, type Frame } from './world'

// Render at the screen's native resolution (up to 2x on hi-dpi screens). The
// pixel art look comes from the voxel shapes and the nearest-filtered textures.
const PIXEL_RATIO: [number, number] = [1, 2]

// Habbo-like 2:1 isometric view: 45° around Y, 30° above the ground. The
// camera is far enough that even a large map stays in front of it.
function cameraPosition(frame: Frame): [number, number, number] {
  const [x, y, z] = frame.target
  return [
    x + frame.distance,
    y + frame.distance * Math.SQRT2 * Math.tan(Math.PI / 6),
    z + frame.distance,
  ]
}

// Zooms so that the whole map, up to its tallest building, fits in the
// canvas. The map can then be dragged and zoomed.
function FitCamera({ frame }: { frame: Frame }) {
  const get = useThree((s) => s.get)
  const { width, height } = useThree((s) => s.size)
  useLayoutEffect(() => {
    const { camera, controls } = get()
    const [x, y, z] = cameraPosition(frame)
    camera.position.set(x, y, z)
    camera.zoom = fitZoom(frame, width, height)
    camera.updateProjectionMatrix()
    const orbit = controls as unknown as Controls | null
    orbit?.target.set(...frame.target)
    orbit?.update()
  }, [get, frame, width, height])
  return null
}

// From the point looked at to the camera.
function offset(frame: Frame): [number, number, number] {
  const [x, y, z] = cameraPosition(frame)
  return [x - frame.target[0], y - frame.target[1], z - frame.target[2]]
}

// Smaller maps are framed as if they had a building this tall.
const MIN_TOP = 6

const VM_BADGE = badgeOf('vm')
const SERVICES_BADGE = badgeOf('services')
const SHORT_VM_BADGE = shortBadgeOf('vm')
const SHORT_SERVICES_BADGE = shortBadgeOf('services')

export default function CityView({ endpoints }: { endpoints: EndpointInfo[] }) {
  // One neighbourhood per physical host, one building per vm-host and one for
  // the physical host itself, and one floor per service.
  const groups = useMemo(() => groupByHost(endpoints), [endpoints])
  // The cards already poll the history: only read the shared cache here.
  const history = useQueries({
    queries: endpoints.map((e) => ({
      ...historyQuery(e),
      refetchInterval: false as const,
    })),
    combine: (results) =>
      new Map(endpoints.map((e, i) => [e.id, results[i].data])),
  })
  const world = useMemo(
    () =>
      worldLayout(
        groups.map((group) => ({
          id: group.host.id,
          buildings: [group, ...group.vms].map((b) => ({
            id: b.host.id,
            services: b.services.length,
          })),
        })),
      ),
    [groups],
  )
  // The services up and down of each physical host, from the backend.
  const { data: summaries } = useQuery(hostSummariesQuery)
  const summaryOf = useMemo(
    () => new Map((summaries ?? []).map((s) => [s.id, s])),
    [summaries],
  )
  // The same for the services right on each building, from the backend.
  const { data: buildingSummaries } = useQuery(buildingSummariesQuery)
  const buildingSummaryOf = useMemo(
    () => new Map((buildingSummaries ?? []).map((s) => [s.id, s])),
    [buildingSummaries],
  )
  const hosts = useMemo(
    () => new Map(allHosts(groups).map((g) => [g.host.id, g])),
    [groups],
  )
  const names = new Map(groups.map((g) => [g.host.id, g.host.name]))

  // A neighbourhood is nuked when its physical host is down.
  const nuked = new Set(
    world.neighbourhoods
      .filter((n) => latestStatus(history.get(n.id)) === 'down')
      .map((n) => n.id),
  )
  const nukedKey = [...nuked].join('|')
  const layouts = useMemo(
    () =>
      new Map(
        world.neighbourhoods.map((n) => [
          n.id,
          nukedKey.split('|').includes(n.id) ? nukedLayout(n.layout) : n.layout,
        ]),
      ),
    [world, nukedKey],
  )
  const top = Math.max(
    MIN_TOP,
    nuked.size > 0 ? NUKE_HEIGHT : 0,
    ...world.neighbourhoods.flatMap((n) => n.layout.lots.map((l) => l.height)),
  )
  const frame = useMemo(() => worldFrame(world, top), [world, top])
  // The kinds of label to show.
  const [chosen, setChosen] = useState<ReadonlySet<LabelKind>>(DEFAULT_LABELS)
  const toggleLabel = (kind: LabelKind) =>
    setChosen((now) => {
      const next = new Set(now)
      if (!next.delete(kind)) next.add(kind)
      return next
    })
  // The neighbourhood in focus, lifted in front of the others.
  const [focusedId, setFocusedId] = useState<string | null>(null)
  // The legend only applies to the whole map: in focus, every label shows.
  const labels = focusedId ? ALL_LABELS : chosen
  // The building in focus within it, if any.
  const [building, setBuilding] = useState<{
    plate: string
    lot: string
  } | null>(null)
  const buildingId =
    building && building.plate === focusedId ? building.lot : null
  const focusFrame = useMemo(() => {
    const plate = world.neighbourhoods.find((n) => n.id === focusedId)
    if (!plate) return null
    // Framed up to its own tallest building, to center what it shows.
    const tallest = Math.max(
      MIN_TOP,
      nuked.has(plate.id) ? NUKE_HEIGHT : 0,
      ...plate.layout.lots.map((l) => l.height),
    )
    return plateFrame(plate, tallest)
    // `nukedKey` stands for `nuked`.
  }, [world, focusedId, nukedKey])
  const focus = useMemo(
    () =>
      focusedId && focusFrame
        ? focusFor(world, focusedId, top, focusFrame.target)
        : null,
    [world, focusedId, focusFrame, top],
  )
  const buildingFocus = useMemo(() => {
    const plate = world.neighbourhoods.find((n) => n.id === focusedId)
    const lot = plate?.layout.lots.find((l) => l.id === buildingId)
    return plate && lot && focusFrame
      ? buildingFrame(plate, lot, focusFrame.target)
      : null
  }, [world, focusedId, buildingId, focusFrame])
  // A neighbourhood that is gone cannot stay in focus.
  useEffect(() => {
    if (focusedId && !focus) setFocusedId(null)
  }, [focusedId, focus])
  // A click anywhere but on the focused neighbourhood, on the dimmed map or
  // outside of the 3D view, goes up one level: from a building to its
  // neighbourhood, then to the whole map.
  const back = () => (buildingId ? setBuilding(null) : setFocusedId(null))
  const view = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!focusedId) return
    const onPointerDown = (e: PointerEvent) => {
      if (!view.current?.contains(e.target as Node)) {
        if (buildingId) setBuilding(null)
        else setFocusedId(null)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [focusedId, buildingId])
  const lift = focus ? Math.hypot(...focus.lift) : 0
  const shadowBox = Math.hypot(world.halfWidth, world.halfDepth) + 4 + lift
  const lightDistance = shadowBox * 1.5 + 50

  return (
    <div ref={view} className="city" data-testid="city-view">
      <Canvas
        orthographic
        dpr={PIXEL_RATIO}
        gl={{ antialias: false }}
        shadows="basic"
        onPointerMissed={back}
        camera={{
          position: cameraPosition(frame),
          near: 0.1,
          far: 4 * frame.distance,
        }}
      >
        <FitCamera frame={frame} />
        <CameraRig
          offset={offset(frame)}
          focusFrame={buildingFocus ?? focusFrame}
        />
        <Backdrop focus={focus} frame={frame} onClose={back} />
        <MapControls
          makeDefault
          enableRotate={false}
          screenSpacePanning
          minZoom={MIN_ZOOM}
          maxZoom={MAX_ZOOM}
          target={frame.target}
        />
        <hemisphereLight args={['#dff3ff', '#5a4a3a', 1.2]} />
        <directionalLight
          position={[
            0.46 * lightDistance,
            0.78 * lightDistance,
            0.21 * lightDistance,
          ]}
          intensity={2}
          castShadow
          shadow-mapSize={[4096, 4096]}
          shadow-bias={-0.002}
          shadow-camera-left={-shadowBox}
          shadow-camera-right={shadowBox}
          shadow-camera-top={shadowBox}
          shadow-camera-bottom={-shadowBox}
          shadow-camera-far={4 * lightDistance}
        />
        {world.wilds.map((n) => (
          <Plate
            key={n.id}
            plate={n}
            focus={null}
            inert
            pose={
              focusFrame && focusedId
                ? { center: focusFrame.target, scale: FAR }
                : null
            }
            pickable={false}
            onSelect={back}
          >
            <Scenery layout={n.layout} />
          </Plate>
        ))}
        {world.neighbourhoods.map((n) => {
          const layout = layouts.get(n.id) ?? n.layout
          const isNuked = nuked.has(n.id)
          const sides = serviceLabelSides(layout.lots)
          const buildings: BuildingProps[] = layout.lots
            .filter((lot) => !lot.decor)
            .map((lot) => {
              const group = hosts.get(lot.id)!
              // The floors are stacked from the ground up, so the first
              // service in alphabetical order goes on the top floor.
              const floors = [...group.services].reverse()
              return {
                lot,
                // On the whole map, a badge alone: there is little room.
                name:
                  group.host.kind === 'vm' && focusedId ? group.host.name : '',
                services: floors.map((s) => s.name),
                labelSide: sides.get(lot.id),
                // In focus, the services of the building up and down.
                badge: focusedId
                  ? buildingBadges(
                      group.host.kind === 'vm' ? VM_BADGE : SERVICES_BADGE,
                      buildingSummaryOf.get(lot.id),
                    )
                  : group.host.kind === 'vm'
                    ? SHORT_VM_BADGE
                    : SHORT_SERVICES_BADGE,
                // Only the building in focus keeps its labels.
                muted: buildingId !== null && lot.id !== buildingId,
                showLabel: labels.has(
                  group.host.kind === 'vm' ? 'vm' : 'services',
                ),
                ruined: isNuked,
                state: isNuked
                  ? nukedState(1 + group.services.length)
                  : buildingState(
                      history.get(group.host.id),
                      floors.map((s) => history.get(s.id)),
                    ),
              }
            })
          return (
            <Plate
              key={n.id}
              plate={n}
              focus={focusedId === n.id ? focus : null}
              pose={
                focusFrame && focusedId
                  ? {
                      center: focusFrame.target,
                      scale: focusedId === n.id ? NEAR : FAR,
                    }
                  : null
              }
              pickable={focusedId === null || focusedId === n.id}
              onSelect={() => setFocusedId(n.id)}
              focusedLot={focusedId === n.id ? buildingId : null}
              onSelectBuilding={(lot) => setBuilding({ plate: n.id, lot })}
              onBack={() => setBuilding(null)}
            >
              <Scenery layout={layout} nuked={isNuked} />
              <Buildings buildings={buildings} />
              {isNuked && <Nuke />}
              {/* In focus, its name is shown at the top left of the view. */}
              {focusedId !== n.id && labels.has('host') && (
                <Label
                  text={names.get(n.id) ?? n.id}
                  badge={hostBadges(summaryOf.get(n.id))}
                  y={2}
                  x={-n.layout.halfWidth + 2}
                  size={1.3}
                  order={10}
                />
              )}
            </Plate>
          )
        })}
      </Canvas>
      {buildingId && hosts.get(buildingId) && (
        <BuildingPanel
          name={hosts.get(buildingId)!.host.name}
          badge={
            hosts.get(buildingId)!.host.kind === 'vm'
              ? VM_BADGE
              : SERVICES_BADGE
          }
          floors={buildingFloors(hosts.get(buildingId)!, history)}
        />
      )}
      {!focusedId && <LabelLegend shown={chosen} onToggle={toggleLabel} />}
      {focusedId && (
        <HostTitle
          name={names.get(focusedId) ?? focusedId}
          badges={hostBadges(summaryOf.get(focusedId))}
        />
      )}
    </div>
  )
}
