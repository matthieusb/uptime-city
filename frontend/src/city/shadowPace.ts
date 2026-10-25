// How often the shadow map is redrawn, in frames. The shadows only depend on the scene, not on the
// camera, so while the camera moves (a zoom, a drag, a focus move) they can wait longer: redrawing
// the whole map's shadow every other frame makes the frames alternate between heavy and light.
export const SHADOW_EVERY = 2
export const SHADOW_EVERY_MOVING = 4

export const shadowDue = (frame: number, moving: boolean) =>
  frame % (moving ? SHADOW_EVERY_MOVING : SHADOW_EVERY) === 0

// The camera as the last frame saw it.
export interface SeenView {
  zoom: number
  x: number
  y: number
  z: number
}

// Updates `seen` in place (nothing allocated) and tells whether the camera moved since.
export function cameraMoved(
  seen: SeenView,
  zoom: number,
  x: number,
  y: number,
  z: number,
): boolean {
  const moved =
    seen.zoom !== zoom || seen.x !== x || seen.y !== y || seen.z !== z
  seen.zoom = zoom
  seen.x = x
  seen.y = y
  seen.z = z
  return moved
}
