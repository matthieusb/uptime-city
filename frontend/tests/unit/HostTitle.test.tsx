import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import HostTitle from '../../src/city/HostTitle'
import { hostBadges } from '../../src/city/labels'

afterEach(cleanup)

it('shows the host name with its host badge and the services up and down', () => {
  render(
    <HostTitle
      name="nas-fractal"
      badges={hostBadges({ id: 'n', services_up: 40, services_down: 3 })}
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
      badges={hostBadges({ id: 'p', services_up: 0, services_down: 0 })}
    />,
  )

  expect(screen.getByTestId('city-title').textContent).toBe('pi3host')
})
