export interface SegmentedControlProps<T extends string> {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  size?: 'md' | 'sm'
  ariaLabel?: string
  className?: string
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  size = 'md',
  ariaLabel,
  className,
}: SegmentedControlProps<T>) {
  const classes = ['ui-segmented', size === 'sm' ? 'ui-segmented-sm' : '', className].filter(Boolean).join(' ')

  return (
    <div className={classes} role="group" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={`ui-segmented-item${o.value === value ? ' is-active' : ''}`}
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
