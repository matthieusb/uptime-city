import type { Badge } from './textures'

// The kinds of label on the map that the legend turns on and off.
export type LabelKind = 'host' | 'services' | 'vm'

export interface LabelInfo {
  kind: LabelKind
  // As shown in the legend.
  name: string
  badge: Badge
}

export const LABEL_KINDS: LabelInfo[] = [
  {
    kind: 'host',
    name: 'Physical hostname',
    badge: { text: 'host', color: '#c9d1d9' },
  },
  {
    kind: 'services',
    name: 'Services badge',
    badge: { text: 'services', color: '#f5a623' },
  },
  {
    kind: 'vm',
    name: 'VM hostname',
    badge: { text: 'VM', color: '#4fa6e0' },
  },
]

export const badgeOf = (kind: LabelKind): Badge =>
  LABEL_KINDS.find((l) => l.kind === kind)!.badge

// Only the physical hostnames show at first, to keep the map readable.
export const DEFAULT_LABELS: ReadonlySet<LabelKind> = new Set(['host'])

export const ALL_LABELS: ReadonlySet<LabelKind> = new Set(
  LABEL_KINDS.map((l) => l.kind),
)
