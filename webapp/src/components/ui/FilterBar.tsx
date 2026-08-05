import type { ReactNode } from 'react'

export interface FilterBarProps {
  children: ReactNode
  className?: string
}

export function FilterBar({ children, className }: FilterBarProps) {
  return (
    <div className={['ui-filter-bar', className].filter(Boolean).join(' ')}>
      {children}
    </div>
  )
}
