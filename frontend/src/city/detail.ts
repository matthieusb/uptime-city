import {
  DENSITY_KINDS,
  DENSITY_MAX,
  DENSITY_STEP,
  EFFECT_KINDS,
  type Densities,
  type EffectKind,
} from './effects'
import { LABEL_KINDS, type LabelKind } from './labels'

// The global detail level, in percent: the detail menu's slider sets every
// checkbox and every slider of the other menus at once.
export const DETAIL_MIN = 0
export const DETAIL_MAX = 100
export const DETAIL_STEP = 1
// The level at which every box is checked and the densities are normal, as the
// menus are at first. Past it, only the densities go on up to their max.
export const NORMAL_DETAIL = 75

export interface DetailSettings {
  labels: ReadonlySet<LabelKind>
  effects: ReadonlySet<EffectKind>
  densities: Densities
}

// The checkboxes in the order they get checked as the level goes up: the
// labels first, then the effects.
const CHECKBOXES: ({ label: LabelKind } | { effect: EffectKind })[] = [
  ...LABEL_KINDS.map(({ kind }) => ({ label: kind })),
  ...EFFECT_KINDS.map(({ kind }) => ({ effect: kind })),
]

// What every menu holds at a level: the boxes get checked one after the other
// up to the normal level, and the sliders rise with the level.
export function detailSettings(level: number): DetailSettings {
  const labels = new Set<LabelKind>()
  const effects = new Set<EffectKind>()
  CHECKBOXES.forEach((box, i) => {
    // The (i + 1)th box is checked from (i + 1) / N of the normal level.
    if (level * CHECKBOXES.length < NORMAL_DETAIL * (i + 1)) return
    if ('label' in box) labels.add(box.label)
    else effects.add(box.effect)
  })

  const raw =
    level <= NORMAL_DETAIL
      ? level / NORMAL_DETAIL
      : 1 +
        ((DENSITY_MAX - 1) * (level - NORMAL_DETAIL)) /
          (DETAIL_MAX - NORMAL_DETAIL)
  const density = Math.min(
    DENSITY_MAX,
    Math.max(0, Math.round(raw / DENSITY_STEP) * DENSITY_STEP),
  )
  const densities = Object.fromEntries(
    DENSITY_KINDS.map(({ kind }) => [kind, density]),
  ) as Densities
  return { labels, effects, densities }
}
