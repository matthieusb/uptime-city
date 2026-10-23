import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import LabelLegend from '../../src/city/LabelLegend'
import { DEFAULT_LABELS, LABEL_KINDS } from '../../src/city/labels'

afterEach(cleanup)

it('lists the three kinds of label, with the physical hostname first', () => {
  render(<LabelLegend shown={DEFAULT_LABELS} onToggle={vi.fn()} />)

  expect(
    screen.getAllByRole('checkbox').map((c) => c.closest('label')?.textContent),
  ).toEqual(['host', 'services', 'VM'])
})

it('checks every kind of label by default', () => {
  expect([...DEFAULT_LABELS]).toEqual(['host', 'services', 'vm'])
  render(<LabelLegend shown={DEFAULT_LABELS} onToggle={vi.fn()} />)

  const checked = (name: string) =>
    (
      screen.getByRole('checkbox', {
        name: new RegExp(name),
      }) as HTMLInputElement
    ).checked
  expect(checked('Physical host')).toBe(true)
  expect(checked('Services badge')).toBe(true)
  expect(checked('VM host')).toBe(true)
})

it('calls onToggle with the kind of the clicked label', async () => {
  const onToggle = vi.fn()
  render(<LabelLegend shown={DEFAULT_LABELS} onToggle={onToggle} />)

  await userEvent.click(screen.getByRole('checkbox', { name: /VM host/ }))
  expect(onToggle).toHaveBeenCalledWith('vm')
  expect(LABEL_KINDS.map((l) => l.kind)).toEqual(['host', 'services', 'vm'])
})
