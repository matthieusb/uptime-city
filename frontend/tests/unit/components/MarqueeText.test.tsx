import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import MarqueeText from '../../../src/ui/MarqueeText'
import { marqueeShift } from '../../../src/ui/marquee'

afterEach(cleanup)

describe('marqueeShift', () => {
  it('is 0 when the text fits', () => {
    expect(marqueeShift(100, 100)).toBe(0)
    expect(marqueeShift(80, 100)).toBe(0)
  })

  it('is how far the text has to move left to show its end', () => {
    expect(marqueeShift(260, 100)).toBe(-160)
  })
})

// jsdom has no layout: the sizes are set by hand, and put back after each test.
function sized(text: number, box: number) {
  // The box is the element with the class `marquee`, the text the one inside.
  const width = (element: Element) =>
    element.classList.contains('marquee') ? box : text
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(
    function (this: HTMLElement) {
      return width(this)
    },
  )
  vi.spyOn(Element.prototype, 'clientWidth', 'get').mockImplementation(
    function (this: Element) {
      return width(this)
    },
  )
}

afterEach(() => vi.restoreAllMocks())

describe('MarqueeText', () => {
  it('shows the whole name in its title', () => {
    render(<MarqueeText text="a-very-long-service-name" />)

    expect(screen.getByText('a-very-long-service-name')).toBeTruthy()
    expect(
      screen
        .getByTitle('a-very-long-service-name')
        .classList.contains('marquee'),
    ).toBe(true)
  })

  it('stands still when the name fits in its box', () => {
    sized(80, 100)
    render(<MarqueeText text="short" />)

    const inner = screen.getByText('short')
    expect(inner.classList.contains('scrolling')).toBe(false)
  })

  it('scrolls to its end and back when the name does not fit', () => {
    sized(260, 100)
    render(<MarqueeText text="a-very-long-service-name" />)

    const inner = screen.getByText('a-very-long-service-name')
    expect(inner.classList.contains('scrolling')).toBe(true)
    expect(inner.style.getPropertyValue('--marquee-shift')).toBe('-160px')
    expect(inner.style.getPropertyValue('--marquee-duration')).not.toBe('')
  })

  it('takes longer to scroll a longer way', () => {
    const duration = (text: number) => {
      sized(text, 100)
      const { unmount } = render(<MarqueeText text="name" />)
      const value = screen
        .getByText('name')
        .style.getPropertyValue('--marquee-duration')
      unmount()
      return parseFloat(value)
    }

    expect(duration(600)).toBeGreaterThan(duration(200))
  })
})
