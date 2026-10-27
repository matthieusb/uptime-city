import { MapControls } from '@react-three/drei'
import { Canvas, useThree } from '@react-three/fiber'
import { useQueries } from '@tanstack/react-query'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { Group } from 'three'
import type { EndpointInfo } from '../api/client'
import { historyQuery } from '../api/queries'
import {
  buildingCounts,
  hostCounts,
  servicesWithStatus,
  totalCounts,
  type StatusService,
} from '../domain/counts'
import { buildingFloors } from '../domain/floors'
import { allHosts, groupByHost } from '../domain/hosts'
import {
  buildingState,
  latestStatus,
  nukedState,
  standingState,
  type Status,
} from '../domain/status'
import { serviceLabelSides } from './layout'
import Buildings, { Label, type BuildingProps } from './Buildings'
import {
  buildingFrame,
  escapeStep,
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
import Clouds from './effects/Clouds'
import Nuke from './effects/Nuke'
import Strike from './effects/Strike'
import Sweep from './effects/Sweep'
import { sweepRange } from './effects/restoreShape'
import { courseFor } from './effects/strikeShape'
import { useStrikes } from './useStrikes'
import { popDelays } from './pop'
import ShadowPacer from './ShadowPacer'
import Planes from './Planes'
import Overflights from './Overflights'
import { cruiseHeight } from './flights'
import Traffic from './Traffic'
import Trains from './Trains'
import { holdUntil } from './strike'
import { nukeHeight } from './effects/nukeShape'
import BuildingPanel from './BuildingPanel'
import HostTitle from './HostTitle'
import DensityMenu from './DensityMenu'
import Toolbox from './Toolbox'
import { setWorldSeed } from './seed'
import DetailMenu from './DetailMenu'
import { NORMAL_DETAIL, detailSettings } from './detail'
import EffectMenu from './EffectMenu'
import { borderColors } from './borders'
import {
  DEFAULT_DENSITIES,
  DEFAULT_EFFECTS,
  type DensityKind,
  type EffectKind,
} from './effects'
import LabelLegend from './LabelLegend'
import {
  decodeDensities,
  decodeDetail,
  decodeEffects,
  decodeLabels,
  encodeSet,
} from './settings'
import { usePersistentState } from '../ui/usePersistentState'
import StatusBadges from './StatusBadges'
import StatusPanel from './StatusPanel'
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
import { findAirport } from './airport'
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

export default function CityView({
  endpoints,
  labName,
  refreshMenu,
  seed = '',
  onRegenerate,
}: {
  endpoints: EndpointInfo[]
  // The name of the lab, set in the backend's config, over the whole map.
  labName?: string
  // The box that picks the refresh period, below the other menus.
  refreshMenu?: ReactNode
  // What the layout of the city is drawn from, kept by the backend.
  seed?: string
  // Asks for another city, with a new seed.
  onRegenerate?: () => void
}) {
  // One neighbourhood per physical host, one building per vm-host and one for
  // the physical host itself, and one floor per service.
  const groups = useMemo(() => groupByHost(endpoints), [endpoints])
  // The history is reloaded by the app (see `useHistoryRefresh`): only read the shared cache here.
  const history = useQueries({
    queries: endpoints.map((e) => ({
      ...historyQuery(e),
      refetchInterval: false as const,
    })),
    combine: (results) =>
      new Map(endpoints.map((e, i) => [e.id, results[i].data])),
  })
  const world = useMemo(() => {
    setWorldSeed(seed)
    return worldLayout(
      groups.map((group) => ({
        id: group.host.id,
        buildings: [group, ...group.vms].map((b) => ({
          id: b.host.id,
          services: b.services.length,
        })),
      })),
    )
  }, [groups, seed])
  const groupOf = useMemo(
    () => new Map(groups.map((g) => [g.host.id, g])),
    [groups],
  )
  const hosts = useMemo(
    () => new Map(allHosts(groups).map((g) => [g.host.id, g])),
    [groups],
  )
  const names = new Map(groups.map((g) => [g.host.id, g.host.name]))

  // The effects to show.
  const [effects, setEffects] = usePersistentState<ReadonlySet<EffectKind>>(
    'effects',
    DEFAULT_EFFECTS,
    decodeEffects,
    encodeSet,
  )
  const toggleEffect = (kind: EffectKind) =>
    setEffects((now) => {
      const next = new Set(now)
      if (!next.delete(kind)) next.add(kind)
      return next
    })
  // How many vehicles and clouds there are.
  const [densities, setDensities] = usePersistentState(
    'densities',
    DEFAULT_DENSITIES,
    decodeDensities,
  )
  const changeDensity = (kind: DensityKind, value: number) =>
    setDensities((now) => ({ ...now, [kind]: value }))
  // The global detail level: moving it sets the labels, the effects and the
  // densities, which can still be changed one by one after.
  const [detail, setDetail] = usePersistentState(
    'detail',
    NORMAL_DETAIL,
    decodeDetail,
  )
  const changeDetail = (level: number) => {
    const settings = detailSettings(level)
    setDetail(level)
    setChosen(settings.labels)
    setEffects(settings.effects)
    setDensities(settings.densities)
  }
  // A neighbourhood is nuked when its physical host is down, once the
  // missile that falls on it hit the ground.
  const strikes = useStrikes(
    new Map(
      world.neighbourhoods.map((n) => [n.id, latestStatus(history.get(n.id))]),
    ),
    effects.has('animations'),
  )
  const nuked = new Set(
    world.neighbourhoods
      .filter((n) => {
        const phase = strikes.phases.get(n.id)
        return phase === 'struck' || phase === 'ruins'
      })
      .map((n) => n.id),
  )
  const nukedKey = [...nuked].join('|')
  // Missiles come first: the other buildings are demolished one second after
  // the last impact.
  const holdTime = holdUntil(
    world.neighbourhoods.flatMap((n) => {
      const phase = strikes.phases.get(n.id)
      const startedAt = strikes.startedAt.get(n.id)
      return (phase === 'incoming' || phase === 'struck') &&
        startedAt !== undefined
        ? [startedAt]
        : []
    }),
  )
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
  // The ruined look of a neighbourhood that is being restored, which the wave
  // sweeps away.
  const restoringKey = world.neighbourhoods
    .filter((n) => strikes.phases.get(n.id) === 'restoring')
    .map((n) => n.id)
    .join('|')
  const ruinedLayouts = useMemo(
    () =>
      new Map(
        world.neighbourhoods
          .filter((n) => restoringKey.split('|').includes(n.id))
          .map((n) => [n.id, nukedLayout(n.layout)]),
      ),
    [world, restoringKey],
  )
  const top = Math.max(
    MIN_TOP,
    // The cloud of a nuked tile is as tall as its tile makes it.
    ...world.neighbourhoods
      .filter((n) => nuked.has(n.id))
      .map((n) => nukeHeight(n.layout.halfWidth, n.layout.halfDepth)),
    ...world.neighbourhoods.flatMap((n) => n.layout.lots.map((l) => l.height)),
  )
  const frame = useMemo(() => worldFrame(world, top), [world, top])
  const airport = useMemo(() => findAirport(world), [world])
  const borderColorOf = useMemo(
    () => borderColors(world.neighbourhoods.map((n) => n.id)),
    [world],
  )
  // The kinds of label to show.
  const [chosen, setChosen] = usePersistentState<ReadonlySet<LabelKind>>(
    'labels',
    DEFAULT_LABELS,
    decodeLabels,
    encodeSet,
  )
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
      nuked.has(plate.id)
        ? nukeHeight(plate.layout.halfWidth, plate.layout.halfDepth)
        : 0,
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
  // The status whose services are listed, if any: over the whole map, or over
  // the neighbourhood in focus. A list belongs to the view it was opened in.
  const [listedIn, setListedIn] = useState<{
    scope: string | null
    status: Status
  } | null>(null)
  const listed = listedIn?.scope === focusedId ? listedIn.status : null
  const toggleListed = (status: Status) =>
    setListedIn((now) =>
      now?.scope === focusedId && now.status === status
        ? null
        : { scope: focusedId, status },
    )
  // A click on a service of the list goes to the building that holds it: its tile in focus, then
  // the building, with the list closed.
  const goToService = (service: StatusService) => {
    setFocusedId(service.plateId)
    setBuilding({ plate: service.plateId, lot: service.buildingId })
    setListedIn(null)
  }
  const statusUi = useRef<HTMLDivElement>(null)
  // A click anywhere but on the badges and the list closes the list.
  useEffect(() => {
    if (!listed) return
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node
      if (
        !statusUi.current?.contains(target) &&
        !(target as Element).closest?.('.city-title')
      )
        setListedIn(null)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [listed])
  // Escape leaves one level at a time, like a click outside: the list of services, then the
  // building, then the neighbourhood.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      const step = escapeStep({
        focused: !!focusedId,
        building: !!buildingId,
        listed: !!listed,
      })
      if (step === 'list') setListedIn(null)
      else if (step === 'building') setBuilding(null)
      else if (step === 'neighbourhood') setFocusedId(null)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [focusedId, buildingId, listed])
  // Once built, the tiles pop up one by one (not when the animations are off).
  const pops = useMemo(
    () =>
      effects.has('animations')
        ? popDelays([...world.wilds, ...world.neighbourhoods])
        : new Map<string, number>(),
    // Toggling the animations later must not replay the intro.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [world],
  )
  // The groups of the plates, for the traffic to follow them.
  const plateGroups = useRef(new Map<string, Group>())
  const register = useCallback((id: string, group: Group | null) => {
    if (group) plateGroups.current.set(id, group)
    else plateGroups.current.delete(id)
  }, [])
  const plots = useMemo(
    () =>
      [...world.neighbourhoods, ...world.wilds].map((n) => ({
        id: n.id,
        x: n.x,
        z: n.z,
        halfWidth: n.layout.halfWidth,
        halfDepth: n.layout.halfDepth,
      })),
    [world],
  )
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
        onCreated={({ gl }) => {
          // The wave of a restoration clips the tile on one side of it.
          gl.localClippingEnabled = true
        }}
        onPointerMissed={back}
        camera={{
          position: cameraPosition(frame),
          near: 0.1,
          far: 4 * frame.distance,
        }}
      >
        <FitCamera frame={frame} />
        <ShadowPacer />
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
        {/* In focus, they would drift in front of what is shown. */}
        <Clouds
          halfWidth={world.halfWidth}
          halfDepth={world.halfDepth}
          height={top + 2}
          visible={!focusedId && effects.has('clouds')}
          density={densities.clouds}
        />
        {world.wilds.map((n) => (
          <Plate
            key={n.id}
            plate={n}
            focus={null}
            inert
            register={register}
            popDelay={pops.get(n.id)}
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
          const phase = strikes.phases.get(n.id)
          const startedAt = strikes.startedAt.get(n.id) ?? null
          const restoredAt = strikes.restoredAt.get(n.id) ?? null
          const range = sweepRange(layout.halfWidth, layout.halfDepth)
          const restoring = phase === 'restoring' && restoredAt !== null
          const sides = serviceLabelSides(layout.lots)
          // The labels of the others are hidden then: keeping them as on the whole map spares
          // drawing a new texture for each of them when a neighbourhood is put in focus.
          const inFocus = focusedId === n.id
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
                  group.host.kind === 'vm' && inFocus ? group.host.name : '',
                services: floors.map((s) => s.name),
                labelSide: sides.get(lot.id),
                // In focus, the services of the building up and down.
                badge: inFocus
                  ? buildingBadges(
                      group.host.kind === 'vm' ? VM_BADGE : SERVICES_BADGE,
                      buildingCounts(group, history),
                    )
                  : group.host.kind === 'vm'
                    ? SHORT_VM_BADGE
                    : SHORT_SERVICES_BADGE,
                // Only the building in focus keeps its labels.
                muted: buildingId !== null && lot.id !== buildingId,
                showLabel: labels.has(
                  group.host.kind === 'vm' ? 'vm' : 'services',
                ),
                // In ruins at once, unless it falls before our eyes.
                ruined: phase === 'ruins',
                demolished: effects.has('animations') && !isNuked,
                holdUntil: isNuked ? 0 : holdTime,
                firefighters: effects.has('animations') && !isNuked,
                recovering: effects.has('animations') && !isNuked,
                exploding: effects.has('animations') && !isNuked,
                roads: {
                  x: n.x + lot.x,
                  z: n.z + lot.z,
                  ways: world.ways,
                  roundabouts: world.roundabouts,
                },
                restore: restoring
                  ? { startedAt: restoredAt, range }
                  : undefined,
                state: isNuked
                  ? nukedState(1 + group.services.length)
                  : phase === 'incoming'
                    ? standingState(1 + group.services.length)
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
              register={register}
              popDelay={pops.get(n.id)}
              pose={
                focusFrame && focusedId
                  ? {
                      center: focusFrame.target,
                      scale: focusedId === n.id ? NEAR : FAR,
                    }
                  : null
              }
              borders={effects.has('borders')}
              borderColor={borderColorOf.get(n.id)}
              pickable={focusedId === null || focusedId === n.id}
              onSelect={() => setFocusedId(n.id)}
              focusedLot={focusedId === n.id ? buildingId : null}
              onSelectBuilding={(lot) => setBuilding({ plate: n.id, lot })}
              onBack={() => setBuilding(null)}
            >
              {/* What the wave of a restoration passed shows as normal. */}
              <Sweep
                startedAt={restoring ? restoredAt : null}
                range={range}
                side="behind"
                wave
                onDone={strikes.refresh}
              >
                <Scenery layout={layout} nuked={isNuked} />
              </Sweep>
              {restoring && ruinedLayouts.has(n.id) && (
                <Sweep startedAt={restoredAt} range={range} side="ahead">
                  <Scenery layout={ruinedLayouts.get(n.id)!} nuked />
                  <Nuke
                    restoredAt={restoredAt}
                    halfWidth={layout.halfWidth}
                    halfDepth={layout.halfDepth}
                  />
                </Sweep>
              )}
              <Buildings buildings={buildings} />
              {isNuked && (
                <Nuke
                  startedAt={phase === 'struck' ? startedAt : null}
                  halfWidth={layout.halfWidth}
                  halfDepth={layout.halfDepth}
                />
              )}
              {(phase === 'incoming' || phase === 'struck') &&
                startedAt !== null && (
                  <Strike
                    startedAt={startedAt}
                    course={courseFor(`${n.id}:${startedAt}`, n, world)}
                    onImpact={strikes.refresh}
                    onDone={strikes.refresh}
                  />
                )}
              {/* In focus, its name is shown at the top left of the view. */}
              {focusedId !== n.id && labels.has('host') && (
                <Label
                  text={names.get(n.id) ?? n.id}
                  badge={hostBadges(hostCounts(groupOf.get(n.id)!, history))}
                  y={2}
                  x={-n.layout.halfWidth + 2}
                  size={1.3}
                  order={10}
                />
              )}
            </Plate>
          )
        })}
        <Planes
          airport={airport}
          groups={plateGroups.current}
          nuked={nuked}
          visible={effects.has('vehicles')}
          density={densities.vehicles}
          cruise={cruiseHeight(top)}
        />
        {/* In focus, they would fly in front of what is shown. */}
        <Overflights
          bounds={world}
          cruise={cruiseHeight(top)}
          visible={!focusedId && effects.has('vehicles')}
          density={densities.vehicles}
        />
        <Traffic
          ways={world.ways}
          roundabouts={world.roundabouts}
          plots={plots}
          groups={plateGroups.current}
          nuked={nuked}
          visible={effects.has('vehicles')}
          density={densities.vehicles}
        />
        <Trains
          track={world.track}
          plots={plots}
          groups={plateGroups.current}
          nuked={nuked}
          visible={effects.has('vehicles')}
          density={densities.vehicles}
        />
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
          hostStatus={
            hosts.get(buildingId)!.host.kind === 'vm'
              ? // A nuked neighbourhood is all in ruins.
                focusedId && nuked.has(focusedId)
                ? 'down'
                : latestStatus(history.get(hosts.get(buildingId)!.host.id))
              : undefined
          }
        />
      )}
      {!focusedId && (
        <div className="city-menus">
          <LabelLegend shown={chosen} onToggle={toggleLabel} />
          <DetailMenu value={detail} onChange={changeDetail} />
          <EffectMenu shown={effects} onToggle={toggleEffect} />
          <DensityMenu values={densities} onChange={changeDensity} />
          {refreshMenu}
        </div>
      )}
      {!focusedId && onRegenerate && <Toolbox onRegenerate={onRegenerate} />}
      {!focusedId && (
        <div ref={statusUi} className="status-ui">
          <StatusBadges
            labName={labName}
            counts={totalCounts(groups, history)}
            selected={listed}
            onSelect={toggleListed}
          />
          {listed && (
            <StatusPanel
              status={listed}
              services={servicesWithStatus(groups, history, listed)}
              onSelect={goToService}
            />
          )}
        </div>
      )}
      {focusedId && (
        <HostTitle
          name={names.get(focusedId) ?? focusedId}
          badges={hostBadges(hostCounts(groupOf.get(focusedId)!, history))}
          selected={listed}
          onSelect={toggleListed}
        />
      )}
      {focusedId && listed && (
        <div ref={statusUi} className="status-ui focus-status">
          <StatusPanel
            status={listed}
            services={servicesWithStatus(
              [groupOf.get(focusedId)!],
              history,
              listed,
            )}
            onSelect={goToService}
          />
        </div>
      )}
    </div>
  )
}
