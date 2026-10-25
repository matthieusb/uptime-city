import {
  DENSITY_KINDS,
  DENSITY_MAX,
  DENSITY_MIN,
  DEFAULT_DENSITIES,
  EFFECT_KINDS,
  type Densities,
  type EffectKind,
} from './effects'
import { DETAIL_MAX, DETAIL_MIN } from './detail'
import { LABEL_KINDS, type LabelKind } from './labels'

// How the settings of the 3D view's menus are read back from the browser's
// storage (see `usePersistentState`): anything unknown or invalid is dropped.

export const encodeSet = <T>(set: ReadonlySet<T>): T[] => [...set]

const decodeSet =
  <T extends string>(known: readonly T[]) =>
  (raw: unknown): ReadonlySet<T> | undefined =>
    Array.isArray(raw)
      ? new Set(known.filter((kind) => raw.includes(kind)))
      : undefined

export const decodeLabels = decodeSet<LabelKind>(LABEL_KINDS.map((l) => l.kind))
export const decodeEffects = decodeSet<EffectKind>(
  EFFECT_KINDS.map((e) => e.kind),
)

export function decodeDensities(raw: unknown): Densities | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const stored = raw as Record<string, unknown>
  const densities = { ...DEFAULT_DENSITIES }
  for (const { kind } of DENSITY_KINDS) {
    const value = stored[kind]
    if (
      typeof value === 'number' &&
      value >= DENSITY_MIN &&
      value <= DENSITY_MAX
    )
      densities[kind] = value
  }
  return densities
}

export const decodeDetail = (raw: unknown): number | undefined =>
  typeof raw === 'number' && raw >= DETAIL_MIN && raw <= DETAIL_MAX
    ? raw
    : undefined
