import type { MouseEvent, ReactNode } from 'react'
import type { DefinitionKey } from '../../lib/definitions'
import { InfoTip } from './InfoTip'
import { Sparkline } from './Sparkline'
import { StatusBadge } from './StatusBadge'

export type StatCardVariant = 'default' | 'primary'

export interface StatCardProps {
  label: string
  value: string
  sub?: ReactNode
  trend?: { up: boolean; label: string }
  variant?: StatCardVariant
  className?: string
  spark?: number[]
  target?: {
    value: number
    current: number
    label?: string
    direction?: 'higher' | 'lower'
    statusLabel?: string
  }
  definitionKey?: DefinitionKey
  /** What the sparkline plots. Defaults to a day count. */
  sparkLabel?: string
  onClick?: () => void
  drillLabel?: string
}

/**
 * A sparkline only earns its space when it has enough points and enough
 * movement to read. Flat or near-flat series are noise, so they are dropped.
 */
function hasReadableTrend(values?: number[]): values is number[] {
  if (!values || values.length < 4) return false
  const clean = values.filter((v) => typeof v === 'number' && Number.isFinite(v))
  if (clean.length < 4) return false
  const min = Math.min(...clean)
  const max = Math.max(...clean)
  if (max === min) return false
  const scale = Math.max(Math.abs(max), Math.abs(min))
  return scale > 0 && (max - min) / scale >= 0.05
}

export function StatCard({
  label,
  value,
  sub,
  trend,
  variant = 'default',
  className,
  spark,
  target,
  definitionKey,
  sparkLabel,
  onClick,
  drillLabel = 'Explore',
}: StatCardProps) {
  const achievement = target && target.value > 0
    ? target.direction === 'lower'
      ? target.current <= 0
        ? 1
        : target.value / target.current
      : target.current / target.value
    : null
  const progress = achievement == null ? null : Math.max(0, Math.min(100, achievement * 100))
  const targetTone =
    achievement == null ? null : achievement >= 1 ? 'good' : achievement >= 0.75 ? 'warn' : 'bad'
  const targetStatus =
    target?.statusLabel ??
    (targetTone === 'good'
      ? 'On target'
      : targetTone === 'warn'
        ? 'Near target'
        : target?.direction === 'lower'
          ? 'Above target'
          : 'Below target')
  const showSpark = hasReadableTrend(spark)

  const classes = [
    'ui-stat',
    variant === 'primary' ? 'ui-stat-primary' : '',
    onClick ? 'is-clickable' : '',
    className,
  ].filter(Boolean).join(' ')

  const onExplore = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    onClick?.()
  }

  return (
    <div
      className={classes}
      onClick={onClick}
    >
      <div className="ui-stat-label">
        <span>{label}</span>
        {definitionKey && <InfoTip definitionKey={definitionKey} />}
      </div>
      <div className="ui-stat-value-row">
        <div className="ui-stat-value">{value}</div>
      </div>
      {showSpark && (
        // On its own row rather than beside the value: a long figure and a
        // fixed-width chart cannot share a narrow card without one spilling out.
        <div className="ui-stat-spark">
          <Sparkline
            values={spark}
            tone={trend ? (trend.up ? 'up' : 'down') : 'brand'}
            height={26}
            fluid
          />
          <span className="ui-stat-spark-caption">
            {sparkLabel ?? `Daily ${label.replace(/\s*\([^)]*\)\s*$/, '').toLowerCase()}, ${spark.length} days`}
          </span>
        </div>
      )}
      {trend && (
        <StatusBadge tone={trend.up ? 'up' : 'down'}>{trend.label}</StatusBadge>
      )}
      {progress != null && (
        <div className="ui-stat-target" title={target?.label ?? 'Target'}>
          <div className="ui-stat-target-track">
            <div
              className={`ui-stat-target-fill is-${targetTone}`}
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="ui-stat-target-label">
            <span>{target?.label ?? 'Target'}</span>
            <strong className={`is-${targetTone}`}>{targetStatus}</strong>
          </span>
        </div>
      )}
      {sub && <div className="ui-stat-sub">{sub}</div>}
      {onClick && (
        <button
          type="button"
          className="ui-stat-drill"
          aria-label={`${label} — open breakdown`}
          onClick={onExplore}
        >
          <span aria-hidden="true">{drillLabel} {'\u203A'}</span>
        </button>
      )}
    </div>
  )
}
