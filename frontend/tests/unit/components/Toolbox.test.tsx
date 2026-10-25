import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import Toolbox from '../../../src/city/Toolbox'

afterEach(cleanup)

it('is a closed icon button at first, with no menu', () => {
  render(<Toolbox onRegenerate={vi.fn()} />)

  const toggle = screen.getByRole('button', { name: 'Toolbox' })
  expect(toggle.getAttribute('aria-expanded')).toBe('false')
  expect(screen.queryByRole('group', { name: 'Toolbox' })).toBeNull()
})

it('opens a menu with the regenerate button, and closes it again', async () => {
  render(<Toolbox onRegenerate={vi.fn()} />)
  const toggle = screen.getByRole('button', { name: 'Toolbox' })

  await userEvent.click(toggle)
  expect(toggle.getAttribute('aria-expanded')).toBe('true')
  expect(screen.getByRole('group', { name: 'Toolbox' })).toBeTruthy()
  expect(
    screen.getByRole('button', { name: 'Regenerate the city' }),
  ).toBeTruthy()

  await userEvent.click(toggle)
  expect(screen.queryByRole('group', { name: 'Toolbox' })).toBeNull()
})

it('asks for a new city when the regenerate button is clicked', async () => {
  const onRegenerate = vi.fn()
  render(<Toolbox onRegenerate={onRegenerate} />)

  await userEvent.click(screen.getByRole('button', { name: 'Toolbox' }))
  await userEvent.click(
    screen.getByRole('button', { name: 'Regenerate the city' }),
  )
  expect(onRegenerate).toHaveBeenCalledTimes(1)
})

it('cannot regenerate twice while it is busy', async () => {
  render(<Toolbox onRegenerate={vi.fn()} busy />)

  await userEvent.click(screen.getByRole('button', { name: 'Toolbox' }))
  const button = screen.getByRole('button', {
    name: 'Regenerate the city',
  }) as HTMLButtonElement
  expect(button.disabled).toBe(true)
})

it('marks the regenerate button with a refresh icon, in a colour of its own', async () => {
  render(<Toolbox onRegenerate={vi.fn()} />)

  await userEvent.click(screen.getByRole('button', { name: 'Toolbox' }))
  const button = screen.getByRole('button', { name: 'Regenerate the city' })
  expect(button.contains(screen.getByTestId('regenerate-icon'))).toBe(true)
  expect(screen.getByTestId('regenerate-icon').textContent).toBe('↻')
  expect(button.classList.contains('city-toolbox-action')).toBe(true)
})
