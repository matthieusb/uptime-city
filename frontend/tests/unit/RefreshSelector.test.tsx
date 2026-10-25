import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import RefreshSelector from '../../src/ui/RefreshSelector'

afterEach(cleanup)

const labels = () =>
  screen.getAllByRole('option').map((option) => option.textContent)

it('offers the four periods, without the simulation sync outside of simulation', () => {
  render(
    <RefreshSelector
      value="30s"
      simulation={false}
      nextRefreshAt={null}
      refreshStartedAt={null}
      onChange={vi.fn()}
    />,
  )

  expect(labels()).toEqual(['10s', '30s', '1min', '5min'])
  expect(
    (screen.getByRole('combobox', { name: 'Refresh' }) as HTMLSelectElement)
      .value,
  ).toBe('30s')
})

it('adds the sync with the simulation in simulation mode', () => {
  render(
    <RefreshSelector
      value="sync"
      simulation
      nextRefreshAt={null}
      refreshStartedAt={null}
      onChange={vi.fn()}
    />,
  )

  expect(labels()).toEqual([
    '10s',
    '30s',
    '1min',
    '5min',
    'Sync with simulation',
  ])
})

it('tells the chosen period', async () => {
  const onChange = vi.fn()
  render(
    <RefreshSelector
      value="30s"
      simulation
      nextRefreshAt={null}
      refreshStartedAt={null}
      onChange={onChange}
    />,
  )

  await userEvent.selectOptions(
    screen.getByRole('combobox', { name: 'Refresh' }),
    '5min',
  )

  expect(onChange).toHaveBeenCalledWith('5m')
})

it('tells in how many seconds the next refresh comes, on the title line', () => {
  render(
    <RefreshSelector
      value="30s"
      simulation={false}
      nextRefreshAt={Date.now() + 12_000}
      refreshStartedAt={null}
      onChange={vi.fn()}
    />,
  )

  const countdown = screen.getByTestId('refresh-countdown')
  expect(countdown.textContent).toBe('in 12 seconds')
  expect(countdown.parentElement?.className).toBe('city-legend-title')
  expect(countdown.parentElement?.textContent).toMatch(/^Refresh/)
})

it('says "1 second" in the singular, and shows nothing without a refresh', () => {
  const { rerender } = render(
    <RefreshSelector
      value="30s"
      simulation={false}
      nextRefreshAt={Date.now() + 1_000}
      refreshStartedAt={null}
      onChange={vi.fn()}
    />,
  )
  expect(screen.getByTestId('refresh-countdown').textContent).toBe(
    'in 1 second',
  )

  rerender(
    <RefreshSelector
      value="30s"
      simulation={false}
      nextRefreshAt={null}
      refreshStartedAt={null}
      onChange={vi.fn()}
    />,
  )
  expect(screen.queryByTestId('refresh-countdown')).toBeNull()
})

const titleName = () => screen.getByText('Refresh', { selector: 'span' })

it('breathes the title to bold as a refresh begins, and not before or after', () => {
  const props = {
    value: '30s' as const,
    simulation: false,
    nextRefreshAt: null,
  }
  const { rerender } = render(
    <RefreshSelector {...props} refreshStartedAt={null} onChange={vi.fn()} />,
  )
  expect(titleName().className).not.toContain('refresh-breathing')

  rerender(
    <RefreshSelector
      {...props}
      refreshStartedAt={Date.now()}
      onChange={vi.fn()}
    />,
  )
  expect(titleName().className).toContain('refresh-breathing')

  // A refresh that began more than 3 seconds ago no longer breathes.
  rerender(
    <RefreshSelector
      {...props}
      refreshStartedAt={Date.now() - 3_500}
      onChange={vi.fn()}
    />,
  )
  expect(titleName().className).not.toContain('refresh-breathing')
})
