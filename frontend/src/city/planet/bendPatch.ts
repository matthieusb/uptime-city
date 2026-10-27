// Bends every vertex shader of the scene onto the planet (see bend.ts), by rewriting three's own
// shader chunks while the planet is shown: the position of a vertex in the atlas, once the model
// and the instance have placed it, is bent before the view takes it; and the normals, the shadows
// and the clipping planes follow. A material with the define PLANET_FREE is left alone (the
// planes in the sky are placed on the planet itself). Shaders made apart (the nuke, the sprites
// of the labels, the lines of the borders) are rewritten the same way.
//
// The chunks are read when a program is compiled, so this is switched on before the canvas of the
// planet exists, and off before the one of the flat map does (each has its own renderer).
import { Frustum, Material, ShaderChunk, ShaderLib } from 'three'
import { bendGlsl } from './bend'
import type { Planet } from './planet'

type Chunks = Record<string, string>
const chunks = ShaderChunk as unknown as Chunks

// What the flat map has, kept to put back.
const FLAT_CHUNKS = [
  'common',
  'project_vertex',
  'worldpos_vertex',
  'defaultnormal_vertex',
  'clipping_planes_vertex',
]
const original = new Map<string, string>()
let originalSprite: string | null = null
const originalCompile = Material.prototype.onBeforeCompile
const originalIntersectsObject = Frustum.prototype.intersectsObject
const originalIntersectsSprite = Frustum.prototype.intersectsSprite

// Replaces `from` by `to` in `source`, or fails: a version of three that moved it must be noticed.
function swap(source: string, from: string | RegExp, to: string): string {
  const found =
    typeof from === 'string' ? source.includes(from) : from.test(source)
  if (!found) throw new Error(`planet bend: ${from} not found in the shader`)
  return source.replace(from, to)
}

// What a shader made apart includes to place a vertex: `planetView(local)` is its view position,
// bent on the planet, and sets `planetClip` to the flat one, for the clipping planes.
const VIEW = /* glsl */ `
vec4 planetClip = vec4(0.0);
vec4 planetView(vec4 local) {
  planetClip = modelViewMatrix * local;
  return viewMatrix * vec4(planetBendPosition((modelMatrix * local).xyz), 1.0);
}
`

const FLAT_VIEW = /* glsl */ `
vec4 planetClip = vec4(0.0);
vec4 planetView(vec4 local) {
  planetClip = modelViewMatrix * local;
  return planetClip;
}
`

// The bend of the border lines: each end of a segment is placed on the planet.
const bendLine = (source: string) =>
  swap(
    swap(
      source,
      /vec4 start = modelViewMatrix \* vec4\( instanceStart, 1\.0 \);/,
      'planetClip = modelViewMatrix * vec4( instanceStart, 1.0 );\n' +
        'vec4 start = viewMatrix * vec4( planetBendPosition( ( modelMatrix * vec4( instanceStart, 1.0 ) ).xyz ), 1.0 );',
    ),
    /vec4 end = modelViewMatrix \* vec4\( instanceEnd, 1\.0 \);/,
    'vec4 end = viewMatrix * vec4( planetBendPosition( ( modelMatrix * vec4( instanceEnd, 1.0 ) ).xyz ), 1.0 );',
  )

export function enablePlanetBend(planet: Planet): void {
  disablePlanetBend()
  for (const name of FLAT_CHUNKS) original.set(name, chunks[name])
  originalSprite = ShaderLib.sprite.vertexShader
  const bend = bendGlsl(planet)

  chunks.common = `${chunks.common}\n${bend}\nvec4 planetClip = vec4(0.0);\n`
  chunks.planet_pars_vertex = `${bend}\n${VIEW}`
  chunks.project_vertex = swap(
    chunks.project_vertex,
    'mvPosition = modelViewMatrix * mvPosition;',
    `#ifdef PLANET_FREE
	planetClip = modelViewMatrix * mvPosition;
	mvPosition = planetClip;
#else
	planetClip = modelViewMatrix * mvPosition;
	mvPosition = viewMatrix * vec4( planetBendPosition( ( modelMatrix * mvPosition ).xyz ), 1.0 );
#endif`,
  )
  chunks.worldpos_vertex = swap(
    chunks.worldpos_vertex,
    'worldPosition = modelMatrix * worldPosition;',
    `worldPosition = modelMatrix * worldPosition;
	#ifndef PLANET_FREE
		worldPosition.xyz = planetBendPosition( worldPosition.xyz );
	#endif`,
  )
  chunks.defaultnormal_vertex = swap(
    chunks.defaultnormal_vertex,
    'transformedNormal = normalMatrix * transformedNormal;',
    `#ifdef PLANET_FREE
	transformedNormal = normalMatrix * transformedNormal;
#else
	vec4 planetLocal = vec4( position, 1.0 );
	#ifdef USE_INSTANCING
		planetLocal = instanceMatrix * planetLocal;
	#endif
	transformedNormal = mat3( viewMatrix ) * planetBendNormal( ( modelMatrix * planetLocal ).xyz, mat3( modelMatrix ) * transformedNormal );
#endif`,
  )
  // The wave of a restoration cuts the flat ground, not the bent one.
  chunks.clipping_planes_vertex = swap(
    chunks.clipping_planes_vertex,
    'vClipPosition = - mvPosition.xyz;',
    'vClipPosition = - planetClip.xyz;',
  )
  // A sprite stands where the middle of its object is bent to, and faces the camera there.
  ShaderLib.sprite.vertexShader = swap(
    swap(
      ShaderLib.sprite.vertexShader,
      'vec4 mvPosition = modelViewMatrix[ 3 ];',
      'planetClip = modelViewMatrix[ 3 ];\n\tvec4 mvPosition = viewMatrix * vec4( planetBendPosition( modelMatrix[ 3 ].xyz ), 1.0 );',
    ),
    'mvPosition.xy += rotatedPosition;',
    'mvPosition.xy += rotatedPosition;\n\tplanetClip.xy += rotatedPosition;',
  )
  // Where an object is culled is where it stands in the atlas, not where it is bent to: nothing
  // is culled.
  Frustum.prototype.intersectsObject = () => true
  Frustum.prototype.intersectsSprite = () => true
  // The lines of drei are made with their own shader, which has no chunk to rewrite.
  Material.prototype.onBeforeCompile = function (shader) {
    if (this.type === 'LineMaterial')
      shader.vertexShader = bendLine(shader.vertexShader)
  }
}

export function disablePlanetBend(): void {
  for (const [name, source] of original) chunks[name] = source
  original.clear()
  chunks.planet_pars_vertex = FLAT_VIEW
  if (originalSprite !== null) ShaderLib.sprite.vertexShader = originalSprite
  originalSprite = null
  Material.prototype.onBeforeCompile = originalCompile
  Frustum.prototype.intersectsObject = originalIntersectsObject
  Frustum.prototype.intersectsSprite = originalIntersectsSprite
}

// What the flat map includes where the planet bends: the view position as the model view gives it.
chunks.planet_pars_vertex = FLAT_VIEW
