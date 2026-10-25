// Predefined palettes of territory colours, strong enough to read against any biome and none of
// them close to the green, red and orange of the statuses.
export const BORDER_PALETTES = {
  // Saturated, like the nations of a strategy game.
  empire: [
    '#4da3ff',
    '#b377ff',
    '#ffd23f',
    '#2ee6d6',
    '#ff6fb5',
    '#f5f5f5',
    '#8d6bff',
    '#ffb3e6',
  ],
  // Softer, with a lighter touch on the map.
  pastel: [
    '#a8d0ff',
    '#d4b8ff',
    '#fff0a8',
    '#a8f0e8',
    '#ffc2e0',
    '#e8e8f0',
    '#c2b8ff',
    '#ffe0f4',
  ],
  // Glowing colours that stand out on the darkest ground.
  neon: [
    '#00b7ff',
    '#c13bff',
    '#fff200',
    '#00ffe1',
    '#ff2e97',
    '#ffffff',
    '#5b5bff',
    '#ff7af0',
  ],
} as const

export type PaletteName = keyof typeof BORDER_PALETTES

export const DEFAULT_PALETTE: PaletteName = 'empire'

// Beyond the palette, the hues step by the golden angle, so that every new one lands far from the
// ones before it.
const GOLDEN_ANGLE = 137.508

function hslToHex(h: number, s: number, l: number): string {
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    const a = s * Math.min(l, 1 - l)
    const v = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
    return Math.round(255 * v)
      .toString(16)
      .padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

// Every neighbourhood gets a colour of its own, as each nation does in a strategy game: the
// palette first, then made-up ones. It follows the order of the ids, not the order of the list.
export function borderColors(
  ids: readonly string[],
  palette: PaletteName = DEFAULT_PALETTE,
): Map<string, string> {
  const colors = BORDER_PALETTES[palette]
  const used = new Set<string>(colors)
  return new Map(
    [...ids].sort().map((id, i) => {
      if (i < colors.length) return [id, colors[i]]
      let k = i - colors.length
      let color = hslToHex((k * GOLDEN_ANGLE) % 360, 0.85, 0.62)
      while (used.has(color)) {
        k += 1
        color = hslToHex((k * GOLDEN_ANGLE) % 360, 0.85, 0.62)
      }
      used.add(color)
      return [id, color]
    }),
  )
}

// The closed ring of a border, pulled in from the edges of a tile by `inset`, at height `y`.
export function borderRing(
  halfWidth: number,
  halfDepth: number,
  inset: number,
  y: number,
): [number, number, number][] {
  const x = halfWidth - inset
  const z = halfDepth - inset
  return [
    [-x, y, -z],
    [x, y, -z],
    [x, y, z],
    [-x, y, z],
    [-x, y, -z],
  ]
}
