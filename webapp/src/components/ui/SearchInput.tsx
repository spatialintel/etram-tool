import { useEffect, useRef, useState } from 'react'

export interface SearchInputProps {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  ariaLabel?: string
  /** Debounce before `onChange` fires; the input itself stays responsive. */
  debounceMs?: number
  className?: string
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search',
  ariaLabel = 'Search',
  debounceMs = 200,
  className,
}: SearchInputProps) {
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement | null>(null)

  // Follow external resets (Clear all, URL change) without fighting typing.
  useEffect(() => setDraft(value), [value])

  useEffect(() => {
    if (draft === value) return
    const t = setTimeout(() => onChange(draft), debounceMs)
    return () => clearTimeout(t)
  }, [draft, value, debounceMs, onChange])

  return (
    <div className={['ui-search', className].filter(Boolean).join(' ')}>
      <input
        ref={inputRef}
        type="search"
        className="ui-input ui-search-input"
        placeholder={placeholder}
        aria-label={ariaLabel}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
      />
      {draft && (
        <button
          type="button"
          className="ui-search-clear"
          aria-label="Clear search"
          onClick={() => {
            setDraft('')
            onChange('')
            inputRef.current?.focus()
          }}
        >
          {'\u00D7'}
        </button>
      )}
    </div>
  )
}
