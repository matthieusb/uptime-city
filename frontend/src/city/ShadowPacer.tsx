import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { cameraMoved, shadowDue, type SeenView } from './shadowPace'

// Redraws the shadow map every other frame instead of every frame, and less often still while the
// camera moves. The shadows only depend on the scene, not on the camera, and a shadow a few frames
// late is not visible. The map is large: this saves a big share of the work of each frame, and
// spares a zoom the frames that alternate between heavy and light.
export default function ShadowPacer() {
  const shadowMap = useThree((s) => s.gl.shadowMap)
  const frame = useRef(0)
  const seen = useRef<SeenView>({ zoom: NaN, x: NaN, y: NaN, z: NaN })
  useEffect(() => {
    shadowMap.autoUpdate = false
    return () => {
      shadowMap.autoUpdate = true
    }
  }, [shadowMap])
  useFrame(({ camera }) => {
    const { x, y, z } = camera.position
    const moving = cameraMoved(seen.current, camera.zoom, x, y, z)
    shadowMap.needsUpdate = shadowDue(frame.current++, moving)
  })
  return null
}
