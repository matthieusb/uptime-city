import { describe, expect, it } from 'vitest'
import { worldFrame, worldLayout } from '../../../src/city/world'
import { hosts } from './helpers'

// Where a point of the map is on screen, seen from the isometric camera: to
// the right along (1, 0, -1), up with Y, and lower the closer to the camera.
const project = (x: number, y: number, z: number) => ({
  sx: (x - z) / Math.SQRT2,
  sy:
    y * Math.cos(Math.PI / 6) - ((x + z) / Math.SQRT2) * Math.sin(Math.PI / 6),
})

describe('worldFrame', () => {
  const world = worldLayout(hosts)

  it('frames an empty world', () => {
    const frame = worldFrame(worldLayout([]), 6)
    expect(frame.width).toBeGreaterThan(0)
    expect(frame.height).toBeGreaterThan(0)
  })

  it('is centered on the middle of what it shows', () => {
    const frame = worldFrame(world, 12)
    const center = project(...frame.target)
    for (const neighbourhood of [...world.neighbourhoods, ...world.wilds]) {
      for (const dx of [-1, 1]) {
        for (const dz of [-1, 1]) {
          const x = neighbourhood.x + dx * neighbourhood.layout.halfWidth
          const z = neighbourhood.z + dz * neighbourhood.layout.halfDepth
          for (const y of [0, 12]) {
            const { sx, sy } = project(x, y, z)
            expect(Math.abs(sx - center.sx)).toBeLessThanOrEqual(
              frame.width / 2 + 1e-6,
            )
            expect(Math.abs(sy - center.sy)).toBeLessThanOrEqual(
              frame.height / 2 + 1e-6,
            )
          }
        }
      }
    }
  })

  it('is never wider than the bounding square of the map', () => {
    const frame = worldFrame(world, 6)
    expect(frame.width).toBeLessThanOrEqual(
      (world.halfWidth + world.halfDepth) * Math.SQRT2 + 1e-6,
    )
  })

  it('makes room for taller buildings', () => {
    expect(worldFrame(world, 40).height).toBeGreaterThan(
      worldFrame(world, 6).height,
    )
  })
})
