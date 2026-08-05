import type { ReactNode } from 'react'

export type StatusBadgeTone = 'up' | 'down' | 'neutral' | 'warn'

export interface StatusBadgeProps {
  tone: StatusBadgeTone
  children: ReactNode
  className?: string
}

export function StatusBadge({ tone, children, className }: StatusBadgeProps) {
  const toneClass = {
    up: 'ui-badge-up',
    down: 'ui-badge-down',
    neutral: 'ui-badge-neutral',
    warn: 'ui-badge-warn',
  }[tone]

  return (
    <span className={['ui-badge', toneClass, className].filter(Boolean).join(' ')}>
      {children}
    </span>
  )
}
