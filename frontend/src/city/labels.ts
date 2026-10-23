import type { Badge } from './textures'

// The kinds of label on the map that the legend turns on and off.
export type LabelKind = 'host' | 'services' | 'vm'

export interface LabelInfo {
  kind: LabelKind
  // As shown in the legend.
  name: string
  badge: Badge
  // The badge text on the whole map, where there is little room.
  short: string
}

export const LABEL_KINDS: LabelInfo[] = [
  {
    kind: 'host',
    name: 'Physical host',
    badge: { text: 'host', color: '#c9d1d9' },
    short: 'host',
  },
  {
    kind: 'services',
    name: 'Services badge',
    badge: { text: 'services', color: '#f5a623' },
    short: 's',
  },
  {
    kind: 'vm',
    name: 'VM host',
    badge: { text: 'VM', color: '#4fa6e0' },
    short: 'VM',
  },
]

export const badgeOf = (kind: LabelKind): Badge =>
  LABEL_KINDS.find((l) => l.kind === kind)!.badge

// The badge as shown on the whole map: a short text, and no name beside it.
export const shortBadgeOf = (kind: LabelKind): Badge => {
  const { badge, short } = LABEL_KINDS.find((l) => l.kind === kind)!
  return { ...badge, text: short }
}

// Only the physical hosts show at first, to keep the map readable.
export const DEFAULT_LABELS: ReadonlySet<LabelKind> = new Set(['host'])

export const ALL_LABELS: ReadonlySet<LabelKind> = new Set(
  LABEL_KINDS.map((l) => l.kind),
)
