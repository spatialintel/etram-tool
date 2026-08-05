import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

export type ToastTone = 'info' | 'success' | 'warn' | 'danger'

export type ToastItem = {
  id: string
  message: string
  tone: ToastTone
}

type ToastApi = {
  push: (message: string, tone?: ToastTone) => void
  dismiss: (id: string) => void
}

const ToastContext = createContext<ToastApi | null>(null)

let toastSeq = 0

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])

  const dismiss = useCallback((id: string) => {
    setItems((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const push = useCallback((message: string, tone: ToastTone = 'info') => {
    const id = `toast-${++toastSeq}`
    setItems((prev) => [...prev, { id, message, tone }])
    window.setTimeout(() => dismiss(id), 4000)
  }, [dismiss])

  const api = useMemo(() => ({ push, dismiss }), [push, dismiss])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="ui-toast-region" aria-live="polite" aria-relevant="additions">
        {items.map((t) => (
          <div key={t.id} className={`ui-toast ui-toast-${t.tone}`} role="status">
            <span>{t.message}</span>
            <button type="button" className="ui-toast-close" aria-label="Dismiss" onClick={() => dismiss(t.id)}>
              {'\u00D7'}
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    return {
      push: (message) => { console.info('[toast]', message) },
      dismiss: () => {},
    }
  }
  return ctx
}
