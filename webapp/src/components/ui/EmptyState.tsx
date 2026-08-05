import type { ReactNode } from 'react'
import { Button } from './Button'

export interface EmptyStateProps {
  children: ReactNode
  title?: string
  action?: { label: string; onClick: () => void }
  className?: string
}

export function EmptyState({ children, title, action, className }: EmptyStateProps) {
  return (
    <div className={['ui-empty', className].filter(Boolean).join(' ')}>
      {title && <div className="ui-empty-title">{title}</div>}
      <div className="ui-empty-body">{children}</div>
      {action && (
        <div className="ui-empty-action">
          <Button variant="primary" size="sm" onClick={action.onClick}>{action.label}</Button>
        </div>
      )}
    </div>
  )
}
