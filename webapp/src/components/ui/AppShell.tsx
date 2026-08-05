import type { ReactNode } from 'react'

export interface AppShellProps {
  sidebar: ReactNode
  header: ReactNode
  children: ReactNode
}

export function AppShell({ sidebar, header, children }: AppShellProps) {
  return (
    <div className="ui-shell">
      {sidebar}
      <div className="ui-shell-main">
        <div className="ui-shell-header">{header}</div>
        <div className="ui-shell-content">{children}</div>
      </div>
    </div>
  )
}
