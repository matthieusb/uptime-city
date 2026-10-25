import { useLayoutEffect, useState, type RefObject } from 'react'
import { keepClearOf, placeBeside, type Placement } from '../domain/graph'

// The space between a panel and the graph opened from it, in pixels.
const GAP = 8
// The space kept between a graph and the edge of the view.
const MARGIN = 12

// Where a graph goes beside a panel: with the same top, filling the room to the edge of the view,
// or to the menus at the top right of it, and clear of the boxes at the top left (the title of
// the host in focus). Measured again when the panel, the view or the menus
// change size. Null until it is measured.
function useBeside(
  anchor: RefObject<HTMLElement | null>,
  side: 'left' | 'right',
  active: boolean,
): Placement | null {
  const [place, setPlace] = useState<Placement | null>(null)
  useLayoutEffect(() => {
    const panel = anchor.current
    if (!active || !panel) return
    const parent = panel.offsetParent ?? panel.parentElement
    const view = panel.closest('.city') ?? parent
    const menus = view?.querySelector('.city-menus')
    const measure = () => {
      if (!parent || !view) return
      const panelBox = panel.getBoundingClientRect()
      const viewBox = view.getBoundingClientRect()
      setPlace(
        placeBeside(
          {
            top: panel.offsetTop,
            left: panelBox.left,
            right: panelBox.right,
          },
          {
            left: keepClearOf(
              viewBox.left + MARGIN,
              // The boxes over the left of the view, which come and go with the focus.
              [
                ...view.querySelectorAll(
                  ':scope > .city-title, :scope > .status-ui',
                ),
              ].map((box) => box.getBoundingClientRect().right),
              GAP,
            ),
            // The menus have the right edge of the view; the graph stops short of them.
            right: menus
              ? menus.getBoundingClientRect().left - GAP
              : viewBox.right - MARGIN,
          },
          parent.getBoundingClientRect().left,
          side,
          GAP,
        ),
      )
    }
    measure()
    // jsdom has no ResizeObserver.
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    for (const element of [panel, parent, view, menus])
      if (element) observer?.observe(element)
    // The title and the list of services appear and go away without any resize.
    const children = new MutationObserver(measure)
    if (view) children.observe(view, { childList: true })
    return () => {
      observer?.disconnect()
      children.disconnect()
    }
  }, [anchor, side, active])
  return place
}

// The graph of one service of a panel at a time: `anchor` is the ref of the panel's element,
// `toggle` opens or closes the graph of a service, and `open` is the service whose graph shows. A
// service that leaves the panel's list takes its graph with it.
export function useServiceGraph<T extends { id: string }>(
  anchor: RefObject<HTMLElement | null>,
  services: T[],
  side: 'left' | 'right',
) {
  const [openId, setOpenId] = useState<string | null>(null)
  const open = services.find((s) => s.id === openId) ?? null
  const place = useBeside(anchor, side, open !== null)
  return {
    open,
    place,
    toggle: (id: string) => setOpenId((now) => (now === id ? null : id)),
    close: () => setOpenId(null),
  }
}
