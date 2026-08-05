import { useId } from 'react'

export interface SelectOption {
  value: string
  label: string
  hint?: string
}

export interface SelectProps {
  label?: string
  value: string
  options: SelectOption[]
  onChange: (v: string) => void
  disabled?: boolean
  size?: 'md' | 'sm'
  className?: string
}

export function Select({ label, value, options, onChange, disabled, size = 'md', className }: SelectProps) {
  const id = useId()
  const classes = ['ui-select', size === 'sm' ? 'ui-select-sm' : '', className].filter(Boolean).join(' ')

  return (
    <div className="ui-field">
      {label && <label className="ui-field-label" htmlFor={id}>{label}</label>}
      <select
        id={id}
        className={classes}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.hint ? `${o.label} (${o.hint})` : o.label}
          </option>
        ))}
      </select>
    </div>
  )
}
