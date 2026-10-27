// The shaders of the mushroom cloud, the shock wave and the glows of the nuclear
// strike, and the factories of their materials. Nothing here is unit-tested (it is GLSL): the
// timing and the sizes are in `nukeShape.ts` and `blastShape.ts`, which feed the uniforms.
//
// Every surface is lit from inside: a 3D noise (fbm, 3 octaves) scrolls in time and picks a colour
// on a 1D ramp (white, yellow, orange, red, charcoal), the same noise pushes the vertices along
// their normal, and where the noise falls below a threshold the fragment is dropped, which gives
// ragged edges and a burning-away fade. All the shaders honour the clipping planes of
// `Sweep.tsx` (the restoration wave), which is why they include three's clipping chunks and set
// `clipping: true`. No real light is involved.
import {
  AdditiveBlending,
  Color,
  DataTexture,
  DoubleSide,
  LinearFilter,
  RGBAFormat,
  ShaderMaterial,
  SRGBColorSpace,
  TorusGeometry,
  UnsignedByteType,
  Vector3,
  Vector4,
  type IUniform,
  type Texture,
} from 'three'
import { rampColor } from './nukeShape'

export const RAMP_SIZE = 64
// The radius of the tube of the unit torus that the wave is made of, next to its
// major radius of 1.
export const RING_TUBE = 0.5

// The ramp of colours as a RAMP_SIZE x 1 texture. Its bytes are sRGB, which the sampler decodes.
export function createRampTexture(): DataTexture {
  const data = new Uint8Array(RAMP_SIZE * 4)
  for (let i = 0; i < RAMP_SIZE; i++) {
    const [r, g, b] = rampColor(i / (RAMP_SIZE - 1))
    data.set([r, g, b, 255], i * 4)
  }
  const texture = new DataTexture(
    data,
    RAMP_SIZE,
    1,
    RGBAFormat,
    UnsignedByteType,
  )
  texture.colorSpace = SRGBColorSpace
  texture.magFilter = LinearFilter
  texture.minFilter = LinearFilter
  texture.generateMipmaps = false
  texture.needsUpdate = true
  return texture
}

// The unit torus, lying in the ground plane: major radius 1, tube RING_TUBE. The vertex shader
// reshapes it with a uniform, so that one geometry serves the wave.
export function createRingGeometry(): TorusGeometry {
  const geometry = new TorusGeometry(1, RING_TUBE, 14, 72)
  geometry.rotateX(Math.PI / 2)
  return geometry
}

// ---- GLSL

const NOISE = /* glsl */ `
// A hash of a point of the lattice, 0 to 1.
float hash31(vec3 p) {
  p = 50.0 * fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

// 3D value noise, 0 to 1.
float vnoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash31(i), hash31(i + vec3(1.0, 0.0, 0.0)), f.x),
        mix(hash31(i + vec3(0.0, 1.0, 0.0)), hash31(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(hash31(i + vec3(0.0, 0.0, 1.0)), hash31(i + vec3(1.0, 0.0, 1.0)), f.x),
        mix(hash31(i + vec3(0.0, 1.0, 1.0)), hash31(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
    f.z);
}

// Three octaves of it, 0 to 1 and centred on 0.5.
float fbm3(vec3 p) {
  float sum = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 3; i++) {
    sum += amplitude * vnoise(p);
    p = p * 2.03 + vec3(7.1, 3.7, 5.3);
    amplitude *= 0.5;
  }
  return sum / 0.875;
}
`

// Bodies. The defines pick the shape: RING (the unit torus, reshaped by uRing) and, with it, GROUND
// (only the upper half, for the wave). `vNoise` is where the fragment shader samples the noise.
export const BODY_VERTEX = /* glsl */ `
uniform float uTime;
uniform float uDisp;
uniform float uFreq;
uniform vec3 uFlow;
// RING: x the major radius, y the width of the tube, z its height, w the angle the noise has rolled.
uniform vec4 uRing;

varying vec3 vNormalV;
varying vec3 vNoise;
varying float vHeight;

#include <clipping_planes_pars_vertex>

${NOISE}

void main() {
  vec3 base = position;
  vec3 nrm = normal;
  vec3 np = position;
  float height = 0.0;

#ifdef RING
  // The unit torus has a major radius of 1: (cos, sin) is the place on the tube.
  vec2 tube = vec2(length(position.xz) - 1.0, position.y) / RING_TUBE;
  vec2 dir = position.xz / max(length(position.xz), 0.0001);
  float reach = uRing.x + tube.x * uRing.y;
  float rise = tube.y * uRing.z;
#ifdef GROUND
  rise = max(rise, 0.0);
#endif
  base = vec3(dir.x * reach, rise, dir.y * reach);
  // The normal of an ellipse of half sizes (y, z).
  nrm = normalize(vec3(dir.x * tube.x / uRing.y, tube.y / uRing.z, dir.y * tube.x / uRing.y));
  // The surface rolls: the noise is read after turning the place on the tube by uRing.w, so it
  // flows up on the inside of the ring, out over its top, and down on the outside.
  float c = cos(uRing.w);
  float s = sin(uRing.w);
  vec2 rolled = vec2(c * tube.x - s * tube.y, s * tube.x + c * tube.y);
  float rolledReach = uRing.x + rolled.x * uRing.y;
  np = vec3(dir.x * rolledReach, rolled.y * uRing.z, dir.y * rolledReach);
  height = clamp(0.5 + 0.5 * tube.y, 0.0, 1.0);
#ifdef GROUND
  height = clamp(tube.y, 0.0, 1.0);
#endif
#endif

  float n = fbm3(np * uFreq + uFlow * uTime);
  vec3 displaced = base + nrm * ((n - 0.5) * uDisp);

  vNormalV = normalMatrix * nrm;
  vNoise = np;
  vHeight = height;

  vec4 mvPosition = modelViewMatrix * vec4(displaced, 1.0);
  gl_Position = projectionMatrix * mvPosition;
#include <clipping_planes_vertex>
}
`

// uHeat + uHeatSpan * height + noise + rim: where on the ramp the fragment is. Hot parts light
// themselves, smoke is shaded by a fixed light so it reads as a volume. Fragments under the
// threshold are dropped. ADDITIVE draws the body as fire over what is behind, with an alpha.
export const BODY_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uFade;
uniform float uHeat;
uniform float uHeatSpan;
uniform float uHeatNoise;
uniform float uRim;
uniform float uRagged;
uniform float uGain;
uniform float uFreq;
uniform vec3 uFlow;
uniform sampler2D uRamp;

varying vec3 vNormalV;
varying vec3 vNoise;
varying float vHeight;

#include <clipping_planes_pars_fragment>

${NOISE}

void main() {
#include <clipping_planes_fragment>
  vec3 nrm = normalize(vNormalV);
  if (!gl_FrontFacing) nrm = -nrm;
  // The camera is orthographic: the view direction is the same everywhere.
  float rim = 1.0 - clamp(nrm.z, 0.0, 1.0);

  float n = fbm3(vNoise * uFreq * 2.3 + uFlow * uTime);

  // Burning away: the noise eats the surface from its edges, and all of it as uFade falls to 0.
  float cut = (1.0 - uFade) + rim * rim * uRagged;
  if (n < cut) discard;

  float heat = clamp(uHeat + uHeatSpan * vHeight + (n - 0.5) * uHeatNoise + rim * uRim, 0.0, 1.0);
  vec3 color = texture2D(uRamp, vec2(heat, 0.5)).rgb;

  float smoke = smoothstep(0.55, 0.9, heat);
  float lit = 0.55 + 0.45 * clamp(dot(nrm, normalize(vec3(0.35, 0.8, 0.5))), 0.0, 1.0);
  color *= mix(uGain * (0.8 + 0.4 * n), lit, smoke);

  // An ember edge where it burns away.
  float ember = 1.0 - smoothstep(0.0, 0.1, n - cut);
  color += vec3(1.0, 0.4, 0.08) * ember * (1.0 - uFade) * 2.0;

#ifdef ADDITIVE
  gl_FragColor = vec4(color, 0.55 + 0.45 * (1.0 - rim));
#else
  gl_FragColor = vec4(color, 1.0);
#endif
#include <colorspace_fragment>
}
`

// A soft round glow, drawn over what is behind (additive): a disc lying on the ground, or with
// BILLBOARD a quad facing the screen. A bright spot at uPeak (0 the middle, near 1 a ring) of
// width uWidth, over a faint fill that fades towards the edge.
export const GLOW_VERTEX = /* glsl */ `
varying vec2 vUv;

#include <clipping_planes_pars_vertex>

void main() {
  vUv = uv;
  vec4 mvPosition;
#ifdef BILLBOARD
  mvPosition = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  mvPosition.xy += position.xy * length(modelViewMatrix[0].xyz);
#else
  mvPosition = modelViewMatrix * vec4(position, 1.0);
#endif
  gl_Position = projectionMatrix * mvPosition;
#include <clipping_planes_vertex>
}
`

export const GLOW_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uIntensity;
uniform float uPeak;
uniform float uWidth;
uniform float uFill;

varying vec2 vUv;

#include <clipping_planes_pars_fragment>

void main() {
#include <clipping_planes_fragment>
  float r = length(vUv - 0.5) * 2.0;
  float d = (r - uPeak) / uWidth;
  float edge = 1.0 - smoothstep(0.8, 1.0, r);
  float a = (exp(-d * d) + uFill * (1.0 - r)) * edge * uIntensity;
  if (a < 0.003) discard;
  gl_FragColor = vec4(uColor, clamp(a, 0.0, 1.0));
#include <colorspace_fragment>
}
`

// ---- Materials

// What the materials of one nuke share, so that the clock and the fade are written once a frame.
export interface NukeUniforms {
  uTime: IUniform<number>
  uFade: IUniform<number>
  uRamp: IUniform<Texture>
}

export const createNukeUniforms = (ramp: Texture): NukeUniforms => ({
  uTime: { value: 0 },
  uFade: { value: 1 },
  uRamp: { value: ramp },
})

export type BodyKind = 'wave'

// The look of each body, which `Shockwave` then drives with the pure functions of blastShape.
const BODY_LOOK: Record<
  BodyKind,
  {
    defines: Record<string, string>
    disp: number
    freq: number
    flow: [number, number, number]
    heatNoise: number
    rim: number
    ragged: number
    gain: number
    additive: boolean
  }
> = {
  wave: {
    defines: { RING: '', GROUND: '', RING_TUBE: RING_TUBE.toFixed(3) },
    disp: 0.8,
    freq: 0.7,
    flow: [0, -2.2, 0],
    heatNoise: 0.35,
    rim: 0.15,
    ragged: 0.2,
    gain: 1.3,
    additive: true,
  },
}

// One material of a body, made once. Its heat, its ring and the like are set by the caller each
// frame, in place, through `uniforms`.
export function createBodyMaterial(
  kind: BodyKind,
  shared: NukeUniforms,
): ShaderMaterial {
  const look = BODY_LOOK[kind]
  return new ShaderMaterial({
    defines: { ...look.defines, ...(look.additive ? { ADDITIVE: '' } : {}) },
    uniforms: {
      uTime: shared.uTime,
      // The wave fades with its own clock.
      uFade: { value: 1 },
      uRamp: shared.uRamp,
      uHeat: { value: 0 },
      uHeatSpan: { value: 0 },
      uHeatNoise: { value: look.heatNoise },
      uRim: { value: look.rim },
      uRagged: { value: look.ragged },
      uGain: { value: look.gain },
      uDisp: { value: look.disp },
      uFreq: { value: look.freq },
      uFlow: { value: new Vector3(...look.flow) },
      uRing: { value: new Vector4(1, 1, 1, 0) },
    },
    vertexShader: BODY_VERTEX,
    fragmentShader: BODY_FRAGMENT,
    clipping: true,
    toneMapped: false,
    side: DoubleSide,
    transparent: look.additive,
    depthWrite: !look.additive,
    ...(look.additive ? { blending: AdditiveBlending } : {}),
  })
}

// The material of a glow of the given colour (a hex string). Its intensity is set by the caller
// each frame, in place, through `uniforms.uIntensity`.
export function createGlowMaterial(
  look: {
    color: string
    peak: number
    width: number
    fill: number
  },
  billboard: boolean,
  depthTest = true,
): ShaderMaterial {
  return new ShaderMaterial({
    defines: billboard ? { BILLBOARD: '' } : {},
    uniforms: {
      uColor: { value: new Color(look.color) },
      uIntensity: { value: 0 },
      uPeak: { value: look.peak },
      uWidth: { value: look.width },
      uFill: { value: look.fill },
    },
    vertexShader: GLOW_VERTEX,
    fragmentShader: GLOW_FRAGMENT,
    clipping: true,
    toneMapped: false,
    side: DoubleSide,
    transparent: true,
    depthWrite: false,
    depthTest,
    blending: AdditiveBlending,
  })
}

// Writes in place, once a frame. They live here rather than in the components because they change
// what a hook gave them, which the React lint forbids in a component.
export function setUniform(
  material: ShaderMaterial,
  name: string,
  value: number,
): void {
  material.uniforms[name].value = value
}

export function setTime(shared: NukeUniforms, t: number): void {
  shared.uTime.value = t
}

// The reshaping of the ring of the wave (see `uRing` in the vertex shader).
export function setRing(
  material: ShaderMaterial,
  major: number,
  width: number,
  height: number,
  roll: number,
): void {
  material.uniforms.uRing.value.set(major, width, height, roll)
}
