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
        aria-label={`How ${def.label} is calculated`}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={(e) => {
          e.stopPropagation()
          setOpen(!open)
        }}
      >
        i
      </button>
      {open && (
        <div className="ui-popover ui-infotip-panel" role="dialog">
          <div className="ui-infotip-title">{def.label}</div>
          <div className="ui-infotip-section">
            <div className="ui-infotip-label">Formula</div>
            <div className="ui-infotip-formula">{def.formula}</div>
          </div>
          <div className="ui-infotip-section">
            <div className="ui-infotip-label">How calculated</div>
            <div className="ui-infotip-how">{def.how}</div>
          </div>
          <div className="ui-infotip-meta">
            Unit: {UNIT_LABEL[def.unit] || def.unit || 'count'}
            {' \u00B7 '}
            Source: {def.source}
          </div>
          {def.note ? <div className="ui-infotip-note">{def.note}</div> : null}
        </div>
      )}
    </span>
  )
}
