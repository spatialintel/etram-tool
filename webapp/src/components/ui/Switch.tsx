import { useId } from 'react'

export interface SwitchProps {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  /** Hide the visible label but keep it for screen readers. */
  hideLabel?: boolean
  disabled?: boolean
  className?: string
}

export function Switch({ checked, onChange, label, hideLabel, disabled, className }: SwitchProps) {
  const id = useId()

  return (
    <div className={['ui-switch-row', className].filter(Boolean).join(' ')}>
      <button
        type="button"
        id={id}
        role="switch"
        aria-checked={checked}
        aria-label={hideLabel ? label : undefined}
        disabled={disabled}
        className={`ui-switch${checked ? ' is-on' : ''}`}
        onClick={() => onChange(!checked)}
      >
        <span className="ui-switch-thumb" aria-hidden="true" />
      </button>
      {!hideLabel && (
        <label className="ui-switch-label" htmlFor={id}>
          {label}
        </label>
      )}
    </div>
  )
}
