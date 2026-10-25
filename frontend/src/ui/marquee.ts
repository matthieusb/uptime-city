// Pixels the text moves in a second.
export const SPEED = 30
// The shortest cycle, in seconds, so that a name a few pixels too long does not twitch.
export const MIN_DURATION_S = 4

// How far a text wider than its box has to move to the left to show its end: 0 when it fits.
export const marqueeShift = (textWidth: number, boxWidth: number) =>
  textWidth > boxWidth ? boxWidth - textWidth : 0

// The seconds a way there and back takes, at the speed of the text.
export const marqueeDuration = (shift: number) =>
  Math.max(MIN_DURATION_S, (2 * -shift) / SPEED)
