import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export interface DrawerProps {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  children: ReactNode
  width?: number
}

export function Drawer({ open, onClose, title, subtitle, children, width = 420 }: DrawerProps) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const prev = document.activeElement as HTMLElement | null
    panelRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    // The page scrolls in its own container, so the panel would drift away from
    // the card that opened it unless that container is pinned while it is open.
    document.documentElement.classList.add('has-drawer')
    return () => {
      document.removeEventListener('keydown', onKey)
      document.documentElement.classList.remove('has-drawer')
      prev?.focus()
    }
  }, [open, onClose])

  if (!open) return null

  // Rendered at the document root: inside the scroll container it would sit
  // below the sticky header in paint order and get cut off at the top.
  return createPortal(
    <div className="ui-drawer-root" role="presentation">
      <div className="ui-drawer-backdrop" onClick={onClose} />
      <aside
        ref={panelRef}
        className="ui-drawer"
        style={{ width }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="ui-drawer-header">
          <div>
            <h2 id={titleId} className="ui-drawer-title">{title}</h2>
            {subtitle && <div className="ui-drawer-sub">{subtitle}</div>}
          </div>
          <button type="button" className="ui-icon-btn" aria-label="Close" onClick={onClose}>{'\u00D7'}</button>
        </div>
        <div className="ui-drawer-body">{children}</div>
      </aside>
    </div>,
    document.body,
  )
}
