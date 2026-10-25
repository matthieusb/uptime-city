import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import DensityMenu from '../../src/city/DensityMenu'
import {
  DEFAULT_DENSITIES,
  DENSITY_MAX,
  DENSITY_MIN,
} from '../../src/city/effects'

afterEach(cleanup)

it('is named Density and has a slider for the vehicles and one for the clouds, at normal density by default', () => {
  expect(DEFAULT_DENSITIES).toEqual({ vehicles: 1, clouds: 1 })
  render(<DensityMenu values={DEFAULT_DENSITIES} onChange={vi.fn()} />)

  expect(screen.getByRole('group', { name: 'Density' })).toBeTruthy()
  for (const name of ['Vehicles density', 'Clouds density']) {
    const slider = screen.getByRole('slider', { name }) as HTMLInputElement
    expect(slider.value).toBe('1')
    expect(slider.min).toBe(String(DENSITY_MIN))
    expect(slider.max).toBe(String(DENSITY_MAX))
  }
  expect(screen.getAllByText('100%')).toHaveLength(2)
})

it('shows each density as a percentage', () => {
  render(
    <DensityMenu values={{ vehicles: 0.25, clouds: 2 }} onChange={vi.fn()} />,
  )

  expect(screen.getByText('25%')).toBeTruthy()
  expect(screen.getByText('200%')).toBeTruthy()
})

it('calls onChange with the kind and the new value of the moved slider', () => {
  const onChange = vi.fn()
  render(<DensityMenu values={DEFAULT_DENSITIES} onChange={onChange} />)

  fireEvent.change(screen.getByRole('slider', { name: 'Vehicles density' }), {
    target: { value: '1.5' },
  })
  expect(onChange).toHaveBeenCalledWith('vehicles', 1.5)

  fireEvent.change(screen.getByRole('slider', { name: 'Clouds density' }), {
    target: { value: '0' },
  })
  expect(onChange).toHaveBeenCalledWith('clouds', 0)
})
