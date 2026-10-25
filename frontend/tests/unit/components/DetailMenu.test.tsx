import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import DetailMenu from '../../../src/city/DetailMenu'
import { DETAIL_MAX, DETAIL_MIN } from '../../../src/city/detail'

afterEach(cleanup)

it('is named Detail Level and has one slider from 0 to 100, shown as a percentage', () => {
  render(<DetailMenu value={75} onChange={vi.fn()} />)

  expect(screen.getByRole('group', { name: 'Detail Level' })).toBeTruthy()
  expect(screen.getByText('Detail Level')).toBeTruthy()
  const slider = screen.getByRole('slider', {
    name: 'Detail level',
  }) as HTMLInputElement
  expect(slider.value).toBe('75')
  expect(slider.min).toBe(String(DETAIL_MIN))
  expect(slider.max).toBe(String(DETAIL_MAX))
  expect(screen.getByText('75%')).toBeTruthy()
})

it('calls onChange with the new level', () => {
  const onChange = vi.fn()
  render(<DetailMenu value={75} onChange={onChange} />)

  fireEvent.change(screen.getByRole('slider', { name: 'Detail level' }), {
    target: { value: '20' },
  })
  expect(onChange).toHaveBeenCalledWith(20)
})
