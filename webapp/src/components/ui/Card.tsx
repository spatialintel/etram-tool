import { useId, type MouseEvent, type ReactNode } from 'react'

export interface CardProps {
  title?: string
  subtitle?: string
  action?: ReactNode
  children: ReactNode
  className?: string
  /** Opens the card's breakdown. Adds a header button and makes the card body clickable. */
  onDrill?: () => void
  drillLabel?: string
}

/** Clicks that land on these belong to the widget, not to the card. */
const INTERACTIVE = 'canvas, button, a, input, select, textarea, [role="button"], [role="dialog"], .ui-datatable, .stop-map-wrap'

export function Card({
  title,
  subtitle,
  action,
  children,
  className,
  onDrill,
  drillLabel = 'Explore',
}: CardProps) {
  const titleId = useId()
  const hasHeader = title || subtitle || action || onDrill

  const onBodyClick = (e: MouseEvent<HTMLElement>) => {
    if (!onDrill) return
    if ((e.target as HTMLElement).closest(INTERACTIVE)) return
    if (window.getSelection()?.toString()) return
    onDrill()
  }

  return (
    <section
      className={['ui-card', onDrill ? 'is-drillable' : '', className].filter(Boolean).join(' ')}
      onClick={onBodyClick}
      aria-labelledby={title ? titleId : undefined}
    >
      {hasHeader && (
        <header className="ui-card-header">
          <div>
            {title && <h2 id={titleId} className="ui-card-title">{title}</h2>}
            {subtitle && <p className="ui-card-subtitle">{subtitle}</p>}
          </div>
          <div className="ui-card-actions">
            {action}
            {onDrill && (
              <button type="button" className="ui-card-drill" onClick={onDrill}>
                {drillLabel}
                <span aria-hidden="true">{'\u203A'}</span>
              </button>
            )}
          </div>
        </header>
      )}
      <div className="ui-card-body">{children}</div>
    </section>
  )
}
