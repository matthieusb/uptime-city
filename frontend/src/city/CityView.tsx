import { MapControls } from '@react-three/drei'
import { Canvas, useThree } from '@react-three/fiber'
import { useQueries } from '@tanstack/react-query'
import { useLayoutEffect, useMemo } from 'react'
import type { EndpointInfo } from '../api/client'
import { historyQuery } from '../api/queries'
import { allHosts, groupByHost } from '../domain/hosts'
import { buildingState, latestStatus, nukedState } from '../domain/status'
import { serviceLabelSides } from './layout'
import Buildings, { Label, type BuildingProps } from './Buildings'
import Nuke from './effects/Nuke'
import { NUKE_HEIGHT } from './effects/nukeShape'
import Scenery from './Scenery'
import type { Badge } from './textures'
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

// What the map controls expose.
interface Controls {
  target: { set: (x: number, y: number, z: number) => void }
  update: () => void
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
    camera.zoom = Math.min(
      width / (frame.width * 1.05),
      height / (frame.height * 1.1),
    )
    camera.updateProjectionMatrix()
    const orbit = controls as unknown as Controls | null
    orbit?.target.set(...frame.target)
    orbit?.update()
  }, [get, frame, width, height])
  return null
}

// Smaller maps are framed as if they had a building this tall.
const MIN_TOP = 6

const VM_BADGE: Badge = { text: 'VM', color: '#4fa6e0' }
const SERVICES_BADGE: Badge = { text: 'services', color: '#f5a623' }
const NEIGHBOURHOOD_BADGE: Badge = { text: 'host', color: '#c9d1d9' }

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
  const shadowBox = Math.hypot(world.halfWidth, world.halfDepth) + 4
  const lightDistance = shadowBox * 1.5 + 50

  return (
    <div className="city" data-testid="city-view">
      <Canvas
        orthographic
        dpr={PIXEL_RATIO}
        gl={{ antialias: false }}
        shadows="basic"
        camera={{
          position: cameraPosition(frame),
          near: 0.1,
          far: 4 * frame.distance,
        }}
      >
        <FitCamera frame={frame} />
        <MapControls
          makeDefault
          enableRotate={false}
          screenSpacePanning
          minZoom={1}
          maxZoom={60}
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
          <group key={n.id} position={[n.x, 0, n.z]}>
            <Scenery layout={n.layout} />
          </group>
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
                name: group.host.kind === 'vm' ? group.host.name : '',
                services: floors.map((s) => s.name),
                labelSide: sides.get(lot.id),
                badge: group.host.kind === 'vm' ? VM_BADGE : SERVICES_BADGE,
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
            <group key={n.id} position={[n.x, 0, n.z]}>
              <Scenery layout={layout} nuked={isNuked} />
              <Buildings buildings={buildings} />
              {isNuked && <Nuke />}
              <Label
                text={names.get(n.id) ?? n.id}
                badge={NEIGHBOURHOOD_BADGE}
                y={2}
                x={-n.layout.halfWidth + 2}
                size={1.3}
                order={10}
              />
            </group>
          )
        })}
      </Canvas>
    </div>
  )
}
