import { useRef, type KeyboardEvent } from 'react'

export interface TabsProps {
  value: string
  onChange: (v: string) => void
  items: { id: string; label: string; badge?: string }[]
  className?: string
}

export function Tabs({ value, onChange, items, className }: TabsProps) {
  const listRef = useRef<HTMLDivElement | null>(null)

  const onKeyDown = (e: KeyboardEvent) => {
    const idx = items.findIndex((i) => i.id === value)
    if (idx < 0) return
    let next = idx
    if (e.key === 'ArrowRight') next = (idx + 1) % items.length
    else if (e.key === 'ArrowLeft') next = (idx - 1 + items.length) % items.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = items.length - 1
    else return
    e.preventDefault()
    onChange(items[next].id)
    const btn = listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]
    btn?.focus()
  }

  return (
    <div
      className={['ui-tabs', className].filter(Boolean).join(' ')}
      role="tablist"
      ref={listRef}
      onKeyDown={onKeyDown}
    >
      {items.map((item) => {
        const selected = item.id === value
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`tab-${item.id}`}
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            className={`ui-tab${selected ? ' is-active' : ''}`}
            onClick={() => onChange(item.id)}
          >
            {item.label}
            {item.badge != null && <span className="ui-tab-badge">{item.badge}</span>}
          </button>
        )
      })}
    </div>
  )
}
