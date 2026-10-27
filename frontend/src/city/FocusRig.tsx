import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useRef } from 'react'
import { Mesh, type MeshBasicMaterial } from 'three'
import { approach, depth, fitZoom, VIEW, type Focus } from './focus'
import type { Frame } from './world'

// Zoom limits of the map controls.
export const MIN_ZOOM = 1
export const MAX_ZOOM = 60

// What the map controls expose.
export interface Controls {
  target: {
    x: number
    y: number
    z: number
    set: (x: number, y: number, z: number) => void
  }
  update: () => void
}

// The controls keep the zoom within these limits: a goal outside them would
// never be reached.
const clamp = (zoom: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))

interface View {
  zoom: number
  target: [number, number, number]
}

// Moves the camera to frame the focused neighbourhood, and back to where it
// was when the focus ends.
export function CameraRig({
  offset,
  focusFrame,
}: {
  // From the point looked at to the camera.
  offset: [number, number, number]
  focusFrame: Frame | null
}) {
  const get = useThree((rootState) => rootState.get)
  const { width, height } = useThree((rootState) => rootState.size)
  const saved = useRef<View | null>(null)
  const goal = useRef<View | null>(null)

  useEffect(() => {
    const { camera, controls } = get()
    const orbit = controls as unknown as Controls | null
    if (!orbit) return
    if (focusFrame) {
      saved.current ??= {
        zoom: camera.zoom,
        target: [orbit.target.x, orbit.target.y, orbit.target.z],
      }
      goal.current = {
        zoom: clamp(fitZoom(focusFrame, width, height)),
        target: focusFrame.target,
      }
    } else if (saved.current) {
      goal.current = {
        ...saved.current,
        zoom: clamp(saved.current.zoom),
      }
      saved.current = null
    }
  }, [get, focusFrame, width, height])

  // Whoever drags or zooms the map takes over from the move.
  const element = useThree((rootState) => rootState.gl.domElement)
  useEffect(() => {
    const stop = () => {
      goal.current = null
    }
    element.addEventListener('pointerdown', stop)
    element.addEventListener('wheel', stop)
    return () => {
      element.removeEventListener('pointerdown', stop)
      element.removeEventListener('wheel', stop)
    }
  }, [element])

  useFrame((_, delta) => {
    const to = goal.current
    const { camera, controls } = get()
    const orbit = controls as unknown as Controls | null
    if (!to || !orbit) return
    const at = orbit.target
    const x = approach(at.x, to.target[0], delta)
    const y = approach(at.y, to.target[1], delta)
    const z = approach(at.z, to.target[2], delta)
    camera.zoom = approach(camera.zoom, to.zoom, delta)
    orbit.target.set(x, y, z)
    camera.position.set(x + offset[0], y + offset[1], z + offset[2])
    camera.updateProjectionMatrix()
    orbit.update()
    if (
      camera.zoom === to.zoom &&
      x === to.target[0] &&
      y === to.target[1] &&
      z === to.target[2]
    ) {
      goal.current = null
    }
  })
  return null
}

const NO_RAYCAST = () => null

// The most opaque the backdrop gets.
const DIM = 0.6

// A dark pane across the view, between the focused neighbourhood and the
// others. A click on it ends the focus.
export function Backdrop({
  focus,
  frame,
  onClose,
}: {
  focus: Focus | null
  frame: Frame
  onClose: () => void
}) {
  const mesh = useRef<Mesh>(null)
  const material = useRef<MeshBasicMaterial>(null)
  const shown = useRef(0)
  // Kept to fade out after the focus is gone.
  const last = useRef<Focus | null>(null)
  if (focus) last.current = focus
  const at = last.current?.backdropDepth ?? 0

  useLayoutEffect(() => {
    const m = mesh.current
    if (!m) return
    const along = at - depth(...frame.target)
    m.position.set(
      frame.target[0] + VIEW[0] * along,
      frame.target[1] + VIEW[1] * along,
      frame.target[2] + VIEW[2] * along,
    )
    m.lookAt(
      m.position.x + VIEW[0],
      m.position.y + VIEW[1],
      m.position.z + VIEW[2],
    )
  }, [at, frame])

  useFrame((_, delta) => {
    shown.current = approach(shown.current, focus ? 1 : 0, delta)
    if (material.current) material.current.opacity = DIM * shown.current
    if (mesh.current) mesh.current.visible = shown.current > 0
  })

  // Wide enough to cover the map however it is panned and zoomed.
  const size = 8 * Math.max(frame.width, frame.height)
  return (
    <mesh
      ref={mesh}
      visible={false}
      renderOrder={1}
      raycast={focus ? Mesh.prototype.raycast : NO_RAYCAST}
      onClick={(event) => {
        event.stopPropagation()
        // A drag of the map is not a click.
        if (event.delta <= 4) onClose()
      }}
    >
      <planeGeometry args={[size, size]} />
      <meshBasicMaterial
        ref={material}
        color="#05080c"
        transparent
        opacity={0}
        depthWrite={false}
      />
    </mesh>
  )
}
