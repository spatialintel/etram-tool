import { useId, type ReactNode } from 'react'
import { useFocusTrap } from './useFocusTrap'

export interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
  size?: 'md' | 'lg'
}

export function Modal({ open, onClose, title, children, footer, size = 'md' }: ModalProps) {
  const titleId = useId()
  const panelRef = useFocusTrap<HTMLDivElement>(open, onClose)

  if (!open) return null

  return (
    <div className="ui-modal-root" role="presentation">
      <div className="ui-modal-backdrop" onClick={onClose} />
      <div
        ref={panelRef}
        className={`ui-modal ui-modal-${size}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="ui-modal-header">
          <h2 id={titleId} className="ui-modal-title">{title}</h2>
          <button type="button" className="ui-icon-btn" aria-label="Close" onClick={onClose}>{'\u00D7'}</button>
        </div>
        <div className="ui-modal-body">{children}</div>
        {footer && <div className="ui-modal-footer">{footer}</div>}
      </div>
    </div>
  )
}
