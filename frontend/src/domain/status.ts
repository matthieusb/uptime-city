export type Status = 'up' | 'down' | 'unknown'

const COLORS: Record<Status, string> = {
  up: '#2ecc71',
  down: '#e74c3c',
  unknown: '#95a5a6',
}

export function statusColor(status: Status): string {
  return COLORS[status]
}
