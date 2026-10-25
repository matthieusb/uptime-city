import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import EffectMenu from '../../../src/city/EffectMenu'
import { DEFAULT_EFFECTS } from '../../../src/city/effects'

afterEach(cleanup)

it('is named Effects and lists the clouds, the vehicles, the animations and the borders, checked by default', () => {
  expect([...DEFAULT_EFFECTS]).toEqual([
    'clouds',
    'vehicles',
    'animations',
    'borders',
  ])
  render(<EffectMenu shown={DEFAULT_EFFECTS} onToggle={vi.fn()} />)

  expect(screen.getByRole('group', { name: 'Effects' })).toBeTruthy()
  expect(
    screen.getByText('Effects', { selector: '.city-legend-title' }),
  ).toBeTruthy()
  expect(
    (screen.getByRole('checkbox', { name: 'Borders' }) as HTMLInputElement)
      .checked,
  ).toBe(true)
  expect(
    (screen.getByRole('checkbox', { name: 'Clouds' }) as HTMLInputElement)
      .checked,
  ).toBe(true)
  expect(
    (screen.getByRole('checkbox', { name: 'Vehicles' }) as HTMLInputElement)
      .checked,
  ).toBe(true)
  expect(
    (screen.getByRole('checkbox', { name: 'Animations' }) as HTMLInputElement)
      .checked,
  ).toBe(true)
})

it('shows the clouds unchecked once they are disabled', () => {
  render(<EffectMenu shown={new Set()} onToggle={vi.fn()} />)

  expect(
    (screen.getByRole('checkbox', { name: 'Clouds' }) as HTMLInputElement)
      .checked,
  ).toBe(false)
})

it('calls onToggle with the kind of the clicked effect', async () => {
  const onToggle = vi.fn()
  render(<EffectMenu shown={DEFAULT_EFFECTS} onToggle={onToggle} />)

  await userEvent.click(screen.getByRole('checkbox', { name: 'Clouds' }))
  expect(onToggle).toHaveBeenCalledWith('clouds')
})

it('calls onToggle with animations when they are clicked', async () => {
  const onToggle = vi.fn()
  render(<EffectMenu shown={DEFAULT_EFFECTS} onToggle={onToggle} />)

  await userEvent.click(screen.getByRole('checkbox', { name: 'Animations' }))
  expect(onToggle).toHaveBeenCalledWith('animations')
})

it('calls onToggle with vehicles when they are clicked', async () => {
  const onToggle = vi.fn()
  render(<EffectMenu shown={DEFAULT_EFFECTS} onToggle={onToggle} />)

  await userEvent.click(screen.getByRole('checkbox', { name: 'Vehicles' }))
  expect(onToggle).toHaveBeenCalledWith('vehicles')
})

it('calls onToggle with borders when they are clicked', async () => {
  const onToggle = vi.fn()
  render(<EffectMenu shown={DEFAULT_EFFECTS} onToggle={onToggle} />)

  await userEvent.click(screen.getByRole('checkbox', { name: 'Borders' }))
  expect(onToggle).toHaveBeenCalledWith('borders')
})
