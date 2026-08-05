import type { ReactNode } from 'react'
import { Button } from './Button'

export interface CalloutProps {
  tone?: 'info' | 'warn' | 'danger' | 'success'
  title?: string
  children: ReactNode
  action?: { label: string; onClick: () => void }
  className?: string
}

export function Callout({ tone = 'info', title, children, action, className }: CalloutProps) {
  return (
    <div className={['ui-callout', `ui-callout-${tone}`, className].filter(Boolean).join(' ')} role="status">
      <div className="ui-callout-body">
        {title && <div className="ui-callout-title">{title}</div>}
        <div className="ui-callout-text">{children}</div>
      </div>
      {action && (
        <Button variant="ghost" size="sm" onClick={action.onClick}>{action.label}</Button>
      )}
    </div>
  )
}
