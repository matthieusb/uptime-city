// What a label has to do on a frame, worked out from numbers alone so that a still camera costs
// nothing (see `Label` in `Buildings.tsx`).

// Whether the label shows: not in a hidden neighbourhood, and not zoomed out further than its
// minimum.
export const labelShown = (hidden: boolean, zoom: number, minZoom: number) =>
  !hidden && zoom >= minZoom

// What changed since the last frame, as flags.
export const SHOW_CHANGED = 1
export const RESCALE = 2

// A label keeps the same size on screen: its scale only follows the zoom, and only matters while
// it shows. Compares with the last frame and tells what to redo, so that nothing is set on a frame
// where nothing moved.
export function labelChange(
  wasShown: boolean,
  shown: boolean,
  lastZoom: number,
  zoom: number,
): number {
  let change = 0
  if (shown !== wasShown) change |= SHOW_CHANGED
  if (shown && zoom !== lastZoom) change |= RESCALE
  return change
}
