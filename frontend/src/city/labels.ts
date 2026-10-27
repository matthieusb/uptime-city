import type { ServiceCounts } from '../domain/counts'
import { statusColor } from '../domain/status'
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
  LABEL_KINDS.find((labelInfo) => labelInfo.kind === kind)!.badge

// The badge as shown on the whole map: a short text, and no name beside it.
export const shortBadgeOf = (kind: LabelKind): Badge => {
  const { badge, short } = LABEL_KINDS.find(
    (labelInfo) => labelInfo.kind === kind,
  )!
  return { ...badge, text: short }
}

export const ALL_LABELS: ReadonlySet<LabelKind> = new Set(
  LABEL_KINDS.map((labelInfo) => labelInfo.kind),
)

// Every kind of label shows at first.
export const DEFAULT_LABELS = ALL_LABELS

// Orange, to stand apart from the grey of an unknown floor.
export const UNKNOWN_COUNT_COLOR = '#e67e22'

// The green badge with the number of services running correctly, the red one
// with the number of those that are down and the orange one, starting with a
// ?, with the number of those with no status yet. A count of zero has no badge.
function countBadges(counts: ServiceCounts | undefined): Badge[] {
  const badges: Badge[] = []
  if (counts && counts.up > 0) {
    badges.push({
      text: String(counts.up),
      color: statusColor('up'),
      pulse: true,
      status: 'up',
    })
  }
  if (counts && counts.down > 0) {
    badges.push({
      text: String(counts.down),
      color: statusColor('down'),
      textColor: '#ffffff',
      pulse: true,
      status: 'down',
    })
  }
  if (counts && counts.unknown > 0) {
    badges.push({
      text: `? ${counts.unknown}`,
      color: UNKNOWN_COUNT_COLOR,
      pulse: true,
      status: 'unknown',
    })
  }
  return badges
}

// The badges of a physical host: its own, then the services that run
// correctly and those that are down, on the host and on its vm-hosts.
export function hostBadges(counts: ServiceCounts | undefined): Badge[] {
  return [shortBadgeOf('host'), ...countBadges(counts)]
}

// The badges of a building: its own, then the services of this building that
// run correctly and those that are down.
export function buildingBadges(
  badge: Badge,
  counts: ServiceCounts | undefined,
): Badge[] {
  return [badge, ...countBadges(counts)]
}
