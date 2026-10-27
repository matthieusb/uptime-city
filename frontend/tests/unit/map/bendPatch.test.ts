import {
  Frustum,
  Matrix4,
  Mesh,
  ShaderChunk,
  ShaderLib,
  BoxGeometry,
} from 'three'
import { afterEach, describe, expect, it } from 'vitest'
import {
  disablePlanetBend,
  enablePlanetBend,
} from '../../../src/city/planet/bendPatch'
import { planetLayout } from '../../../src/city/planet/planet'
import { hosts } from './helpers'

const chunks = ShaderChunk as unknown as Record<string, string>
const NAMES = [
  'common',
  'project_vertex',
  'worldpos_vertex',
  'defaultnormal_vertex',
  'clipping_planes_vertex',
]

afterEach(disablePlanetBend)

describe('bend patch', () => {
  it('bends the vertices, the normals, the shadows and the clipping of the built-in shaders', () => {
    enablePlanetBend(planetLayout(hosts, 'seed'))
    expect(chunks.project_vertex).toContain('planetBendPosition')
    expect(chunks.worldpos_vertex).toContain('planetBendPosition')
    expect(chunks.defaultnormal_vertex).toContain('planetBendNormal')
    expect(chunks.clipping_planes_vertex).toContain('planetClip')
    expect(chunks.common).toContain('planetBendPosition')
    expect(chunks.planet_pars_vertex).toContain('planetBendPosition')
  })

  it('leaves alone what is marked as placed on the planet itself', () => {
    enablePlanetBend(planetLayout(hosts, 'seed'))
    expect(chunks.project_vertex).toContain('#ifdef PLANET_FREE')
    expect(chunks.worldpos_vertex).toContain('#ifndef PLANET_FREE')
    expect(chunks.defaultnormal_vertex).toContain('#ifdef PLANET_FREE')
  })

  it('bends the sprites of the labels', () => {
    const flat = ShaderLib.sprite.vertexShader
    enablePlanetBend(planetLayout(hosts, 'seed'))
    expect(ShaderLib.sprite.vertexShader).toContain('planetBendPosition')
    disablePlanetBend()
    expect(ShaderLib.sprite.vertexShader).toBe(flat)
  })

  it('puts the flat shaders back', () => {
    const flat = NAMES.map((name) => chunks[name])
    enablePlanetBend(planetLayout(hosts, 'seed'))
    expect(NAMES.map((name) => chunks[name])).not.toEqual(flat)
    disablePlanetBend()
    expect(NAMES.map((name) => chunks[name])).toEqual(flat)
    expect(chunks.planet_pars_vertex).not.toContain('planetBendPosition')
    expect(chunks.planet_pars_vertex).toContain('planetView')
  })

  it('can be switched on again for another planet without stacking', () => {
    enablePlanetBend(planetLayout(hosts, 'one'))
    enablePlanetBend(planetLayout(hosts, 'two'))
    expect(chunks.project_vertex.match(/planetBendPosition/g)).toHaveLength(1)
    disablePlanetBend()
    expect(chunks.project_vertex).not.toContain('planetBend')
  })

  it('culls nothing while bent, since an object is culled where the atlas has it', () => {
    // A box far outside any view.
    const mesh = new Mesh(new BoxGeometry())
    mesh.position.set(1e6, 1e6, 1e6)
    mesh.updateMatrixWorld()
    const frustum = new Frustum().setFromProjectionMatrix(new Matrix4())
    expect(frustum.intersectsObject(mesh)).toBe(false)
    enablePlanetBend(planetLayout(hosts, 'seed'))
    expect(frustum.intersectsObject(mesh)).toBe(true)
    disablePlanetBend()
    expect(frustum.intersectsObject(mesh)).toBe(false)
  })
})
