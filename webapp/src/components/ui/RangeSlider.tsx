export interface RangeSliderProps {
  label?: string
  value: [number, number]
  min: number
  max: number
  step?: number
  onChange: (v: [number, number]) => void
  /** Formats the endpoint readout, e.g. hour 6 as "06:00". */
  format?: (n: number) => string
  className?: string
}

/**
 * Dual-thumb slider built from two native range inputs so keyboard and screen
 * reader behaviour comes for free. The thumbs cannot cross.
 */
export function RangeSlider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  format = (n) => String(n),
  className,
}: RangeSliderProps) {
  const [lo, hi] = value
  const span = max - min || 1
  const leftPct = ((lo - min) / span) * 100
  const rightPct = ((hi - min) / span) * 100

  return (
    <div className={['ui-field', className].filter(Boolean).join(' ')}>
      {label && (
        <span className="ui-field-label">
          {label}
          <span className="ui-range-readout">{format(lo)} - {format(hi)}</span>
        </span>
      )}
      <div className="ui-range">
        <div className="ui-range-track" aria-hidden="true">
          <div className="ui-range-fill" style={{ left: `${leftPct}%`, right: `${100 - rightPct}%` }} />
        </div>
        <input
          type="range"
          className="ui-range-input"
          min={min}
          max={max}
          step={step}
          value={lo}
          aria-label={label ? `${label} from` : 'Range start'}
          aria-valuetext={format(lo)}
          onChange={(e) => onChange([Math.min(Number(e.target.value), hi), hi])}
        />
        <input
          type="range"
          className="ui-range-input"
          min={min}
          max={max}
          step={step}
          value={hi}
          aria-label={label ? `${label} to` : 'Range end'}
          aria-valuetext={format(hi)}
          onChange={(e) => onChange([lo, Math.max(Number(e.target.value), lo)])}
        />
      </div>
    </div>
  )
}
