import { useRef, type KeyboardEvent } from 'react'

export interface Tab<Id extends string> {
  id: Id
  label: string
}

// Tabs that switch between views. The arrow keys move to the next or
// previous tab, and wrap around.
export default function TabBar<Id extends string>({
  label,
  tabs,
  active,
  onChange,
}: {
  label: string
  tabs: Tab<Id>[]
  active: Id
  onChange: (id: Id) => void
}) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([])

  function onKeyDown(event: KeyboardEvent, index: number) {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key]
    if (step === undefined) return
    event.preventDefault()
    const next = (index + step + tabs.length) % tabs.length
    buttons.current[next]?.focus()
    onChange(tabs[next].id)
  }

  return (
    <div className="tab-bar" role="tablist" aria-label={label}>
      {tabs.map((tab, index) => (
        <button
          key={tab.id}
          ref={(button) => {
            buttons.current[index] = button
          }}
          type="button"
          role="tab"
          className="tab"
          aria-selected={tab.id === active}
          tabIndex={tab.id === active ? 0 : -1}
          onClick={() => onChange(tab.id)}
          onKeyDown={(event) => onKeyDown(event, index)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
