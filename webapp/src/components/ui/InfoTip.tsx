import { DEFINITIONS, type DefinitionKey, type MetricDefinition } from '../../lib/definitions'
import { UNIT_LABEL } from '../../lib/format'
import { usePopover } from './usePopover'

export interface InfoTipProps {
  definitionKey: DefinitionKey
  className?: string
}

export function InfoTip({ definitionKey, className }: InfoTipProps) {
  const def = DEFINITIONS[definitionKey] as MetricDefinition
  const { open, setOpen, rootRef, triggerRef } = usePopover()

  if (!def) return null

  return (
    <span className={['ui-infotip', className].filter(Boolean).join(' ')} ref={rootRef}>
      <button
        type="button"
        ref={triggerRef}
        className="ui-infotip-btn"
        aria-label={`About ${def.label}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={(e) => {
          // The card behind this may itself be clickable.
          e.stopPropagation()
          setOpen(!open)
        }}
      >
        i
      </button>
      {open && (
        <div className="ui-popover ui-infotip-panel" role="dialog">
          <div className="ui-infotip-title">{def.label}</div>
          <div className="ui-infotip-formula">{def.formula}</div>
          <div className="ui-infotip-meta">
            Unit: {UNIT_LABEL[def.unit] || def.unit}
            {def.target != null ? ` \u00B7 Target: ${def.unit === 'pct' ? `${(def.target * 100).toFixed(0)}%` : def.target}` : ''}
          </div>
        </div>
      )}
    </span>
  )
}
