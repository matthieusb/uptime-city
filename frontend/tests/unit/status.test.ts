import { describe, expect, it } from 'vitest'
import { statusColor } from '../../src/domain/status'

describe('statusColor', () => {
  it('maps each status to a color', () => {
    expect(statusColor('up')).toBe('#2ecc71')
    expect(statusColor('down')).toBe('#e74c3c')
    expect(statusColor('unknown')).toBe('#95a5a6')
  })
})
