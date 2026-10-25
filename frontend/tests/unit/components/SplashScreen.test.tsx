import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import SplashScreen from '../../../src/ui/SplashScreen'

afterEach(cleanup)

it('shows its message as a heading, with a spinner', () => {
  render(<SplashScreen message="Building the city…" />)
  const splash = screen.getByTestId('splash-screen')
  expect(
    screen.getByRole('heading', { level: 1, name: 'Building the city…' }),
  ).toBeTruthy()
  expect(splash.querySelector('.splash-spinner')).toBeTruthy()
})
