export interface CheckboxOption<T extends string | number> {
  value: T
  label: string
}

export interface CheckboxGroupProps<T extends string | number> {
  label?: string
  /** Empty array means "all", matching the filter convention. */
  values: T[]
  options: CheckboxOption<T>[]
  onChange: (v: T[]) => void
  /** Renders as compact toggle buttons instead of checkboxes (used for weekdays). */
  variant?: 'checkbox' | 'chips'
  className?: string
}

export function CheckboxGroup<T extends string | number>({
  label,
  values,
  options,
  onChange,
  variant = 'checkbox',
  className,
}: CheckboxGroupProps<T>) {
  const toggle = (v: T) => {
    onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v])
  }

  return (
    <fieldset className={['ui-checkgroup', className].filter(Boolean).join(' ')}>
      {label && <legend className="ui-field-label">{label}</legend>}
      <div className={variant === 'chips' ? 'ui-checkgroup-chips' : 'ui-checkgroup-list'}>
        {options.map((o) => {
          const checked = values.includes(o.value)
          if (variant === 'chips') {
            return (
              <button
                key={String(o.value)}
                type="button"
                className={`ui-toggle-chip${checked ? ' is-on' : ''}`}
                aria-pressed={checked}
                onClick={() => toggle(o.value)}
              >
                {o.label}
              </button>
            )
          }
          return (
            <label key={String(o.value)} className="ui-check-row">
              <input type="checkbox" checked={checked} onChange={() => toggle(o.value)} />
              <span>{o.label}</span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
