import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import HostTitle from '../../src/city/HostTitle'
import { hostBadges } from '../../src/city/labels'

afterEach(cleanup)

it('shows the host name with its host badge and the services up and down', () => {
  render(
    <HostTitle
      name="nas-fractal"
      badges={hostBadges({ up: 40, down: 3, unknown: 0 })}
    />,
  )

  const title = screen.getByTestId('city-title')
  expect(title.textContent).toBe('nas-fractalhost403')
  expect(screen.getByText('40').style.background).not.toBe('')
  expect(screen.getByText('3').style.color).toBe('rgb(255, 255, 255)')
})

it('leaves out the counts that are zero', () => {
  render(
    <HostTitle
      name="pi3"
      badges={hostBadges({ up: 0, down: 0, unknown: 0 })}
    />,
  )

  expect(screen.getByTestId('city-title').textContent).toBe('pi3host')
})

it('makes the counting badges breathe, not the host badge', () => {
  render(
    <HostTitle
      name="nas"
      badges={hostBadges({ up: 2, down: 1, unknown: 0 })}
    />,
  )

  expect(screen.getByText('host').className).not.toContain('breathing')
  expect(screen.getByText('2').className).toContain('breathing')
  expect(screen.getByText('1').className).toContain('breathing')
})

it('shows the unknown services after a bold ?', () => {
  render(
    <HostTitle
      name="nas"
      badges={hostBadges({ up: 1, down: 0, unknown: 5 })}
    />,
  )

  expect(screen.getByTestId('city-title').textContent).toBe('nashost1? 5')
  expect(screen.getByText('?').tagName).toBe('STRONG')
  expect(
    (screen.getByText('?').closest('.city-title-badge') as HTMLElement).style
      .background,
  ).not.toBe('')
})

it('lets the counting badges, not the host badge, be clicked to list their services', async () => {
  const onSelect = vi.fn()
  render(
    <HostTitle
      name="nas"
      badges={hostBadges({ up: 2, down: 1, unknown: 3 })}
      selected="down"
      onSelect={onSelect}
    />,
  )

  expect(screen.queryByRole('button', { name: /host/ })).toBeNull()
  expect(screen.getAllByRole('button')).toHaveLength(3)
  expect(
    screen
      .getByRole('button', { name: 'Services down: 1' })
      .getAttribute('aria-pressed'),
  ).toBe('true')
  expect(
    screen
      .getByRole('button', { name: 'Services up: 2' })
      .getAttribute('aria-pressed'),
  ).toBe('false')

  await userEvent.click(screen.getByRole('button', { name: 'Services up: 2' }))
  await userEvent.click(
    screen.getByRole('button', { name: 'Services unknown: 3' }),
  )
  expect(onSelect.mock.calls).toEqual([['up'], ['unknown']])
})
