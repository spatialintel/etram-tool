export interface FilterChipItem {
  id: string
  label: string
  value: string
}

export interface FilterChipsProps {
  chips: FilterChipItem[]
  onRemove: (id: string) => void
  onClearAll: () => void
  /** Chips that describe the base view rather than a narrowing, e.g. the date range. */
  pinned?: string[]
  className?: string
}

export function FilterChips({ chips, onRemove, onClearAll, pinned = [], className }: FilterChipsProps) {
  if (chips.length === 0) return null
  const removable = chips.filter((c) => !pinned.includes(c.id))

  return (
    <div className={['ui-chips', className].filter(Boolean).join(' ')} aria-label="Active filters">
      {chips.map((c) => (
        <span key={c.id} className="ui-chip">
          <span className="ui-chip-label">{c.label}</span>
          <span className="ui-chip-value">{c.value}</span>
          {!pinned.includes(c.id) && (
            <button
              type="button"
              className="ui-chip-remove"
              aria-label={`Remove ${c.label} filter`}
              onClick={() => onRemove(c.id)}
            >
              {'\u00D7'}
            </button>
          )}
        </span>
      ))}
      {removable.length > 0 && (
        <button type="button" className="ui-link-btn ui-chips-clear" onClick={onClearAll}>
          Clear all
        </button>
      )}
    </div>
  )
}
