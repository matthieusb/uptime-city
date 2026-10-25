import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'

// Redraws the shadow map every other frame instead of every frame. The shadows only depend on the
// scene, not on the camera, so panning and zooming never need a fresh one, and a shadow one frame
// late is not visible. The map is large: this saves a big share of the work of each frame.
export default function ShadowPacer() {
  const shadowMap = useThree((s) => s.gl.shadowMap)
  const frame = useRef(0)
  useEffect(() => {
    shadowMap.autoUpdate = false
    return () => {
      shadowMap.autoUpdate = true
    }
  }, [shadowMap])
  useFrame(() => {
    shadowMap.needsUpdate = frame.current++ % 2 === 0
  })
  return null
}
