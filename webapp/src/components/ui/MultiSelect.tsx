import { useMemo, useState } from 'react'
import { usePopover } from './usePopover'

export interface MultiSelectOption {
  value: string
  label: string
}

export interface MultiSelectProps {
  label?: string
  /** Empty array means "all", which is what the trigger reports. */
  values: string[]
  options: MultiSelectOption[]
  onChange: (v: string[]) => void
  maxTagCount?: number
  searchable?: boolean
  allLabel?: string
  className?: string
}

export function MultiSelect({
  label,
  values,
  options,
  onChange,
  maxTagCount = 2,
  searchable = true,
  allLabel = 'All',
  className,
}: MultiSelectProps) {
  const { open, setOpen, rootRef, triggerRef } = usePopover()
  const [query, setQuery] = useState('')

  const visible = useMemo(() => {
    if (!query.trim()) return options
    const q = query.trim().toLowerCase()
    return options.filter((o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q))
  }, [options, query])

  const summary =
    values.length === 0
      ? allLabel
      : values.length <= maxTagCount
        ? values.join(', ')
        : `${values.length} of ${options.length} selected`

  const toggle = (v: string) => {
    onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v])
  }

  return (
    <div className={['ui-field', className].filter(Boolean).join(' ')} ref={rootRef}>
      {label && <span className="ui-field-label">{label}</span>}
      <div className="ui-popover-anchor">
        <button
          type="button"
          ref={triggerRef}
          className={`ui-select ui-select-trigger${open ? ' is-open' : ''}`}
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <span className="ui-select-value">{summary}</span>
          <span className="ui-select-caret" aria-hidden="true" />
        </button>

        {open && (
          <div className="ui-popover ui-multiselect-panel" role="listbox" aria-multiselectable="true">
            {searchable && (
              <input
                className="ui-input ui-multiselect-search"
                type="search"
                placeholder="Search"
                aria-label={label ? `Search ${label}` : 'Search options'}
                value={query}
                autoFocus
                onChange={(e) => setQuery(e.target.value)}
              />
            )}

            <div className="ui-multiselect-actions">
              <button type="button" className="ui-link-btn" onClick={() => onChange(options.map((o) => o.value))}>
                Select all
              </button>
              <button type="button" className="ui-link-btn" onClick={() => onChange([])}>
                Clear
              </button>
            </div>

            <div className="ui-multiselect-list">
              {visible.length === 0 && <div className="ui-popover-empty">No matches</div>}
              {visible.map((o) => {
                const checked = values.includes(o.value)
                return (
                  <label key={o.value} className="ui-check-row" role="option" aria-selected={checked}>
                    <input type="checkbox" checked={checked} onChange={() => toggle(o.value)} />
                    <span>{o.label}</span>
                  </label>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
