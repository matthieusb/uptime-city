import { useFrame } from '@react-three/fiber'
import { useMemo } from 'react'
import { Color, ShaderMaterial, Vector3 } from 'three'
import type { ShaderMaterialParameters } from 'three'
import { setSeaTime } from './sea'

// The sea is a little under the ground of the islands (their water tiles are at -0.15).
export const SEA_LEVEL = -0.25

// The direction the light comes from, as for the lights of the scene (see CityView).
const LIGHT = new Vector3(0.46, 0.78, 0.21).normalize()

const VERTEX = /* glsl */ `
varying vec3 vPlace;

void main() {
  vPlace = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

// Three layers of swell run over the sphere in different directions and speeds: they tilt the
// surface a little for the light, tint it between deep and shallow, and whiten the crests.
const FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uRadius;
uniform vec3 uLight;
uniform vec3 uDeep;
uniform vec3 uShallow;

varying vec3 vPlace;

vec3 swell(vec3 p, vec3 dir, float freq, float speed, inout float height) {
  float phase = dot(p, dir) * freq + uTime * speed;
  height += sin(phase);
  // The slope of this layer, along its direction.
  return dir * cos(phase) * freq;
}

void main() {
  vec3 up = normalize(vPlace);
  vec3 p = up * uRadius;
  float height = 0.0;
  vec3 slope = swell(p, normalize(vec3(0.8, 0.3, 0.5)), 0.55, 0.9, height);
  slope += swell(p, normalize(vec3(-0.4, 0.7, 0.6)), 0.9, 1.3, height);
  slope += swell(p, normalize(vec3(0.2, -0.6, 0.8)), 1.7, 1.9, height);
  // Only the part of the slope along the surface tilts it.
  slope -= up * dot(slope, up);
  vec3 normal = normalize(up - 0.045 * slope);

  float lit = 0.35 + 0.65 * max(dot(normal, uLight), 0.0);
  float depth = 0.5 + height / 6.0;
  vec3 color = mix(uDeep, uShallow, clamp(depth, 0.0, 1.0)) * lit;

  vec3 toCamera = normalize(cameraPosition - p);
  float glint = pow(max(dot(reflect(-uLight, normal), toCamera), 0.0), 60.0);
  float foam = smoothstep(2.15, 2.6, height);
  color += vec3(0.9, 0.95, 1.0) * (0.55 * glint + 0.35 * foam);

  gl_FragColor = vec4(color, 1.0);
#include <colorspace_fragment>
}
`

// The sea of the planet: a sphere the islands rise from, with swell that moves. Not lit by the
// lights of the scene and not bent (it is the planet itself); the pointer goes through it.
export default function PlanetSea({ radius }: { radius: number }) {
  const material = useMemo(() => {
    const parameters: ShaderMaterialParameters = {
      uniforms: {
        uTime: { value: 0 },
        uRadius: { value: radius + SEA_LEVEL },
        uLight: { value: LIGHT },
        uDeep: { value: new Color('#164b86') },
        uShallow: { value: new Color('#3a8fd6') },
      },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
    }
    return new ShaderMaterial(parameters)
  }, [radius])

  useFrame(({ clock }) => {
    setSeaTime(material, clock.elapsedTime)
  })

  return (
    <mesh raycast={() => null} material={material}>
      <sphereGeometry args={[radius + SEA_LEVEL, 128, 96]} />
    </mesh>
  )
}
