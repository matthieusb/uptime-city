import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { marqueeDuration, marqueeShift } from './marquee'

// A name on one line. When it is too long for its box, it slides to its end and back, so that it
// can be read whole (a quarter of each way is a pause); the browser's tooltip shows it whole too.
export default function MarqueeText({ text }: { text: string }) {
  const box = useRef<HTMLSpanElement>(null)
  const inner = useRef<HTMLSpanElement>(null)
  const [shift, setShift] = useState(0)

  useLayoutEffect(() => {
    const measure = () => {
      if (box.current && inner.current)
        setShift(
          marqueeShift(inner.current.offsetWidth, box.current.clientWidth),
        )
    }
    measure()
    if (typeof ResizeObserver === 'undefined' || !box.current) return
    const observer = new ResizeObserver(measure)
    observer.observe(box.current)
    return () => observer.disconnect()
  }, [text])

  const style =
    shift === 0
      ? undefined
      : ({
          '--marquee-shift': `${shift}px`,
          '--marquee-duration': `${marqueeDuration(shift).toFixed(1)}s`,
        } as CSSProperties)
  return (
    <span ref={box} className="marquee" title={text}>
      <span
        ref={inner}
        className={shift === 0 ? 'marquee-text' : 'marquee-text scrolling'}
        style={style}
      >
        {text}
      </span>
    </span>
  )
}
