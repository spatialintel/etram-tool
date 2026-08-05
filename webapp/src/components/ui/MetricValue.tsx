import { DEFINITIONS, type DefinitionKey } from '../../lib/definitions'
import { fmtInt, fmtKm, fmtMin, fmtMoney, fmtPct, type Unit } from '../../lib/format'
import { InfoTip } from './InfoTip'

export interface MetricValueProps {
  value: number | null | undefined
  unit: Unit
  definitionKey?: DefinitionKey
  compact?: boolean
  className?: string
}

function format(value: number, unit: Unit, compact?: boolean): string {
  switch (unit) {
    case 'pax':
    case 'count':
      return fmtInt(value)
    case 'inr':
      return fmtMoney(value, { compact, dp: compact ? 2 : 0 })
    case 'km':
      return fmtKm(value)
    case 'pct':
      return fmtPct(value)
    case 'min':
      return fmtMin(value)
    default:
      return fmtInt(value)
  }
}

export function MetricValue({ value, unit, definitionKey, compact, className }: MetricValueProps) {
  const text = value == null || !Number.isFinite(value) ? '\u2014' : format(value, unit, compact)
  const def = definitionKey ? DEFINITIONS[definitionKey] : null

  return (
    <span className={['ui-metric', className].filter(Boolean).join(' ')}>
      <span className="ui-metric-value">{text}</span>
      {def && <InfoTip definitionKey={definitionKey!} />}
    </span>
  )
}
