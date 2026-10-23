import type { HostSummary } from '../api/client'
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
  LABEL_KINDS.find((l) => l.kind === kind)!.badge

// The badge as shown on the whole map: a short text, and no name beside it.
export const shortBadgeOf = (kind: LabelKind): Badge => {
  const { badge, short } = LABEL_KINDS.find((l) => l.kind === kind)!
  return { ...badge, text: short }
}

export const ALL_LABELS: ReadonlySet<LabelKind> = new Set(
  LABEL_KINDS.map((l) => l.kind),
)

// Every kind of label shows at first.
export const DEFAULT_LABELS = ALL_LABELS

// The green badge with the number of services running correctly and the red
// one with the number of those that are down. A count of zero has no badge.
function countBadges(summary: HostSummary | undefined): Badge[] {
  const badges: Badge[] = []
  if (summary && summary.services_up > 0) {
    badges.push({
      text: String(summary.services_up),
      color: statusColor('up'),
      pulse: true,
    })
  }
  if (summary && summary.services_down > 0) {
    badges.push({
      text: String(summary.services_down),
      color: statusColor('down'),
      textColor: '#ffffff',
      pulse: true,
    })
  }
  return badges
}

// The badges of a physical host: its own, then the services that run
// correctly and those that are down, on the host and on its vm-hosts.
export function hostBadges(summary: HostSummary | undefined): Badge[] {
  return [shortBadgeOf('host'), ...countBadges(summary)]
}

// The badges of a building: its own, then the services of this building that
// run correctly and those that are down.
export function buildingBadges(
  badge: Badge,
  summary: HostSummary | undefined,
): Badge[] {
  return [badge, ...countBadges(summary)]
}
