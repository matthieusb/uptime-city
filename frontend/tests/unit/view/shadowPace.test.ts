import { describe, expect, it } from 'vitest'
import {
  cameraMoved,
  SHADOW_EVERY,
  SHADOW_EVERY_MOVING,
  shadowDue,
  type SeenView,
} from '../../../src/city/shadowPace'

describe('shadowDue', () => {
  it('redraws every other frame while the camera is still', () => {
    const frames = Array.from({ length: 8 }, (_, i) => shadowDue(i, false))
    expect(frames.filter(Boolean)).toHaveLength(8 / SHADOW_EVERY)
    expect(frames[0]).toBe(true)
    expect(frames[1]).toBe(false)
  })

  it('redraws less often while the camera moves', () => {
    const frames = Array.from({ length: 8 }, (_, i) => shadowDue(i, true))
    expect(frames.filter(Boolean)).toHaveLength(8 / SHADOW_EVERY_MOVING)
    expect(SHADOW_EVERY_MOVING).toBeGreaterThan(SHADOW_EVERY)
  })
})

describe('cameraMoved', () => {
  const fresh = (): SeenView => ({ zoom: NaN, x: NaN, y: NaN, z: NaN })

  it('sees the first frame as a move, then a still camera as still', () => {
    const seen = fresh()
    expect(cameraMoved(seen, 5, 1, 2, 3)).toBe(true)
    expect(cameraMoved(seen, 5, 1, 2, 3)).toBe(false)
  })

  it('sees a zoom or a pan as a move', () => {
    const seen = fresh()
    cameraMoved(seen, 5, 1, 2, 3)
    expect(cameraMoved(seen, 5.1, 1, 2, 3)).toBe(true)
    expect(cameraMoved(seen, 5.1, 1.5, 2, 3)).toBe(true)
    expect(cameraMoved(seen, 5.1, 1.5, 2, 3.5)).toBe(true)
    expect(cameraMoved(seen, 5.1, 1.5, 2, 3.5)).toBe(false)
  })
})
