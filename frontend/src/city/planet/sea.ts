import type { ShaderMaterial } from 'three'

// Writes the clock of the swell in place, once a frame. It lives here rather than in the component
// because it changes what a hook gave it, which the React lint forbids in a component.
export function setSeaTime(material: ShaderMaterial, seconds: number): void {
  material.uniforms.uTime.value = seconds
}
