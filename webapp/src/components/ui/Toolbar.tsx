import type { ReactNode } from 'react'

export interface ToolbarProps {
  children: ReactNode
  className?: string
}

export function Toolbar({ children, className }: ToolbarProps) {
  return <div className={['ui-toolbar', className].filter(Boolean).join(' ')}>{children}</div>
}

export interface BreadcrumbItem {
  label: string
  onClick?: () => void
}

export interface BreadcrumbsProps {
  items: BreadcrumbItem[]
  className?: string
}

export function Breadcrumbs({ items, className }: BreadcrumbsProps) {
  return (
    <nav className={['ui-breadcrumbs', className].filter(Boolean).join(' ')} aria-label="Breadcrumb">
      <ol>
        {items.map((item, i) => {
          const last = i === items.length - 1
          return (
            <li key={`${item.label}-${i}`}>
              {item.onClick && !last ? (
                <button type="button" className="ui-link-btn" onClick={item.onClick}>{item.label}</button>
              ) : (
                <span aria-current={last ? 'page' : undefined}>{item.label}</span>
              )}
              {!last && <span className="ui-breadcrumbs-sep" aria-hidden="true">/</span>}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
