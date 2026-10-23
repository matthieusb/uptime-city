import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import TabBar from '../../src/ui/TabBar'

const tabs = [
  { id: 'cards', label: 'Cards' },
  { id: 'city', label: 'City' },
]

afterEach(cleanup)

it('shows one tab per entry and marks the active one as selected', () => {
  render(<TabBar label="View" tabs={tabs} active="city" onChange={vi.fn()} />)

  expect(screen.getByRole('tablist', { name: 'View' })).toBeTruthy()
  expect(
    screen.getByRole('tab', { name: 'Cards' }).getAttribute('aria-selected'),
  ).toBe('false')
  expect(
    screen.getByRole('tab', { name: 'City' }).getAttribute('aria-selected'),
  ).toBe('true')
})

it('calls onChange with the id of the clicked tab', async () => {
  const onChange = vi.fn()
  render(<TabBar label="View" tabs={tabs} active="cards" onChange={onChange} />)

  await userEvent.click(screen.getByRole('tab', { name: 'City' }))

  expect(onChange).toHaveBeenCalledWith('city')
})

it('moves to the next tab with the right arrow key, and wraps around', async () => {
  const onChange = vi.fn()
  const { rerender } = render(
    <TabBar label="View" tabs={tabs} active="cards" onChange={onChange} />,
  )

  screen.getByRole('tab', { name: 'Cards' }).focus()
  await userEvent.keyboard('{ArrowRight}')
  expect(onChange).toHaveBeenLastCalledWith('city')

  rerender(
    <TabBar label="View" tabs={tabs} active="city" onChange={onChange} />,
  )
  screen.getByRole('tab', { name: 'City' }).focus()
  await userEvent.keyboard('{ArrowRight}')
  expect(onChange).toHaveBeenLastCalledWith('cards')
})

it('moves to the previous tab with the left arrow key', async () => {
  const onChange = vi.fn()
  render(<TabBar label="View" tabs={tabs} active="city" onChange={onChange} />)

  screen.getByRole('tab', { name: 'City' }).focus()
  await userEvent.keyboard('{ArrowLeft}')

  expect(onChange).toHaveBeenLastCalledWith('cards')
})
