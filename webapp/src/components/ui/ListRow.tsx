import type { KeyboardEvent, ReactNode } from 'react'

export interface ListRowProps {
  title: string
  meta?: string
  badge?: ReactNode
  leading?: ReactNode
  className?: string
  onClick?: () => void
}

export function ListRow({ title, meta, badge, leading, className, onClick }: ListRowProps) {
  const interactive = Boolean(onClick)
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!onClick) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onClick()
    }
  }
  return (
    <div
      className={['ui-list-row', interactive ? 'ui-list-row-clickable' : '', className].filter(Boolean).join(' ')}
      onClick={onClick}
      onKeyDown={onKeyDown}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
    >
      {leading && <div className="ui-list-row-leading">{leading}</div>}
      <div className="ui-list-row-content">
        <div className="ui-list-row-title">{title}</div>
        {meta && <div className="ui-list-row-meta">{meta}</div>}
      </div>
      {badge && <div className="ui-list-row-badge">{badge}</div>}
    </div>
  )
}