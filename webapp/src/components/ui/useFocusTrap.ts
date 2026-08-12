import { useEffect, useRef } from 'react'

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Pure decision logic for one keydown: given the trap's focusable elements
 * (in DOM order), what's currently focused, and whether Shift is held,
 * returns the element Tab should land on — or `null` to mean "focus is
 * already inside the trap and not at an edge, let the browser's default Tab
 * behavior run." Exported separately from the hook below so it's testable
 * without a DOM environment (this repo's vitest runs with `environment:
 * 'node'` — no `document` at all).
 */
export function nextTabFocusTarget(
  focusable: readonly HTMLElement[],
  active: Element | null,
  shiftKey: boolean,
  panelContains: (el: Element | null) => boolean,
): HTMLElement | null {
  if (focusable.length === 0) return null
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  const atEdge = shiftKey ? active === first || !panelContains(active) : active === last || !panelContains(active)
  return atEdge ? (shiftKey ? last : first) : null
}

/**
 * Dialog accessibility for Modal/Drawer: focuses the panel on open, restores
 * focus to whatever triggered it on close, closes on Escape, and — the part
 * that was missing before — traps Tab/Shift+Tab inside the panel so keyboard
 * users can't tab out into the page behind an open dialog.
 */
export function useFocusTrap<T extends HTMLElement = HTMLDivElement>(open: boolean, onClose: () => void) {
  const panelRef = useRef<T | null>(null)

  useEffect(() => {
    if (!open) return
    const panel = panelRef.current
    const prev = document.activeElement as HTMLElement | null
    panel?.focus()

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key !== 'Tab' || !panel) return

      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (el) => el.offsetParent !== null,
      )
      if (focusable.length === 0) {
        e.preventDefault()
        return
      }
      const target = nextTabFocusTarget(focusable, document.activeElement, e.shiftKey, (el) => panel.contains(el))
      if (target) {
        e.preventDefault()
        target.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      prev?.focus()
    }
  }, [open, onClose])

  return panelRef
}
