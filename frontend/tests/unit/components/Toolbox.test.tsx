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

it('has no exploded view button without a switch for it', () => {
  render(<Toolbox onRegenerate={vi.fn()} />)

  expect(screen.queryByRole('button', { name: 'Exploded view' })).toBeNull()
})

it('switches the exploded view with a button next to the toolbox one', async () => {
  const onToggleExploded = vi.fn()
  const { rerender } = render(
    <Toolbox onRegenerate={vi.fn()} onToggleExploded={onToggleExploded} />,
  )
  const button = screen.getByRole('button', { name: 'Exploded view' })
  expect(button.getAttribute('aria-pressed')).toBe('false')

  await userEvent.click(button)
  expect(onToggleExploded).toHaveBeenCalledTimes(1)

  rerender(
    <Toolbox
      onRegenerate={vi.fn()}
      exploded
      onToggleExploded={onToggleExploded}
    />,
  )
  expect(
    screen
      .getByRole('button', { name: 'Exploded view' })
      .getAttribute('aria-pressed'),
  ).toBe('true')
})

it('has no planet button without a switch for it', () => {
  render(<Toolbox onRegenerate={vi.fn()} />)

  expect(screen.queryByRole('button', { name: 'Planet view' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Flat plan' })).toBeNull()
})

it('shows the planet icon on the flat plan, and switches to the planet', async () => {
  const onTogglePlanet = vi.fn()
  render(<Toolbox onRegenerate={vi.fn()} onTogglePlanet={onTogglePlanet} />)
  const button = screen.getByRole('button', { name: 'Planet view' })
  expect(button.textContent).toBe('🪐')

  await userEvent.click(button)
  expect(onTogglePlanet).toHaveBeenCalledTimes(1)
})

it('shows a flat plan icon on the planet, to go back to the plan', async () => {
  const onTogglePlanet = vi.fn()
  render(
    <Toolbox onRegenerate={vi.fn()} planet onTogglePlanet={onTogglePlanet} />,
  )
  expect(screen.queryByRole('button', { name: 'Planet view' })).toBeNull()
  const button = screen.getByRole('button', { name: 'Flat plan' })
  expect(button.textContent).toBe('🗺️')

  await userEvent.click(button)
  expect(onTogglePlanet).toHaveBeenCalledTimes(1)
})

it('puts the planet button right of the exploded one, next to the toolbox one', () => {
  render(
    <Toolbox
      onRegenerate={vi.fn()}
      onToggleExploded={vi.fn()}
      onTogglePlanet={vi.fn()}
    />,
  )
  const names = screen
    .getAllByRole('button')
    .map((button) => button.getAttribute('aria-label'))
  expect(names).toEqual(['Exploded view', 'Planet view', 'Toolbox'])
})
