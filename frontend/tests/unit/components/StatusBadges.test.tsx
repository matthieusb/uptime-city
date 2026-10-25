import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import StatusBadges, { DEFAULT_LAB_NAME } from '../../../src/city/StatusBadges'

afterEach(cleanup)

it('shows the green, red and orange badges, even when they are zero', () => {
  render(
    <StatusBadges
      counts={{ up: 0, down: 0, unknown: 0 }}
      selected={null}
      onSelect={vi.fn()}
    />,
  )

  const badges = screen.getAllByRole('button')
  expect(badges.map((b) => b.textContent)).toEqual(['0', '0', '? 0'])
  expect(badges.map((b) => b.style.background)).toEqual([
    'rgb(46, 204, 113)',
    'rgb(231, 76, 60)',
    'rgb(230, 126, 34)',
  ])
  expect(screen.getByText('?').tagName).toBe('STRONG')
})

it('shows the counts', () => {
  render(
    <StatusBadges
      counts={{ up: 12, down: 3, unknown: 4 }}
      selected={null}
      onSelect={vi.fn()}
    />,
  )

  expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual([
    '12',
    '3',
    '? 4',
  ])
})

it('calls onSelect with the status of the clicked badge', async () => {
  const onSelect = vi.fn()
  render(
    <StatusBadges
      counts={{ up: 1, down: 1, unknown: 1 }}
      selected={null}
      onSelect={onSelect}
    />,
  )

  await userEvent.click(screen.getByRole('button', { name: /down/ }))
  expect(onSelect).toHaveBeenCalledWith('down')
  await userEvent.click(screen.getByRole('button', { name: /unknown/ }))
  expect(onSelect).toHaveBeenCalledWith('unknown')
})

it('marks the selected badge as pressed', () => {
  render(
    <StatusBadges
      counts={{ up: 1, down: 1, unknown: 1 }}
      selected="up"
      onSelect={vi.fn()}
    />,
  )

  expect(
    screen.getAllByRole('button').map((b) => b.getAttribute('aria-pressed')),
  ).toEqual(['true', 'false', 'false'])
})

it('names the lab on the left of the badges, lab-map by default', () => {
  const { rerender } = render(
    <StatusBadges
      counts={{ up: 1, down: 1, unknown: 1 }}
      selected={null}
      onSelect={vi.fn()}
    />,
  )
  const group = screen.getByRole('group', { name: 'Services' })
  expect(group.firstElementChild?.textContent).toBe(DEFAULT_LAB_NAME)
  expect(DEFAULT_LAB_NAME).toBe('lab-map')
  expect(group.firstElementChild?.nextElementSibling?.tagName).toBe('BUTTON')

  rerender(
    <StatusBadges
      labName="home-lab"
      counts={{ up: 1, down: 1, unknown: 1 }}
      selected={null}
      onSelect={vi.fn()}
    />,
  )
  expect(group.firstElementChild?.textContent).toBe('home-lab')
})

it('puts the name and the badges in the same box as the title of a host in focus', () => {
  render(
    <StatusBadges
      counts={{ up: 1, down: 1, unknown: 1 }}
      selected={null}
      onSelect={vi.fn()}
    />,
  )

  const group = screen.getByRole('group', { name: 'Services' })
  expect(group.classList.contains('city-title')).toBe(true)
  expect(group.firstElementChild?.classList.contains('city-title-name')).toBe(
    true,
  )
})
