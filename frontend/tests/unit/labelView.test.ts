import { describe, expect, it } from 'vitest'
import {
  labelChange,
  labelShown,
  RESCALE,
  SHOW_CHANGED,
} from '../../src/city/labelView'

describe('labelShown', () => {
  it('shows from its minimum zoom, and never in a hidden neighbourhood', () => {
    expect(labelShown(false, 10, 10)).toBe(true)
    expect(labelShown(false, 9.9, 10)).toBe(false)
    expect(labelShown(false, 1, 0)).toBe(true)
    expect(labelShown(true, 50, 0)).toBe(false)
  })
})

describe('labelChange', () => {
  it('does nothing while a label stays out of sight', () => {
    expect(labelChange(false, false, NaN, 3)).toBe(0)
  })

  it('does nothing while it shows at the same zoom', () => {
    expect(labelChange(true, true, 12, 12)).toBe(0)
  })

  it('rescales it when the zoom moves while it shows', () => {
    expect(labelChange(true, true, 12, 13)).toBe(RESCALE)
  })

  it('shows it and rescales it when it comes into sight at another zoom', () => {
    expect(labelChange(false, true, 8, 10)).toBe(SHOW_CHANGED | RESCALE)
  })

  it('hides it without rescaling it', () => {
    expect(labelChange(true, false, 12, 3)).toBe(SHOW_CHANGED)
  })

  it('rescales it on the first frame, and after its size is reset', () => {
    expect(labelChange(true, true, NaN, 5)).toBe(RESCALE)
  })
})
