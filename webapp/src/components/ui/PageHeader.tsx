import type { ReactNode } from 'react'

export interface PageHeaderProps {
  title: string
  subtitle?: string
  actions?: ReactNode
  className?: string
}

export function PageHeader({ title, subtitle, actions, className }: PageHeaderProps) {
  return (
    <header className={['ui-page-header', className].filter(Boolean).join(' ')}>
      <div className="ui-page-header-text">
        <h1 className="ui-page-header-title">{title}</h1>
        {subtitle && <span className="ui-page-header-subtitle">{subtitle}</span>}
      </div>
      {actions && <div className="ui-page-header-actions">{actions}</div>}
    </header>
  )
}
