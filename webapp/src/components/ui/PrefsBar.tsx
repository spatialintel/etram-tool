import { useState } from 'react'
import { Button } from './Button'
import { Select } from './Select'
import { Switch } from './Switch'
import { usePopover } from './usePopover'
import type { Prefs, SavedView } from '../../lib/prefs'

function uid(): string {
  return `v_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

export function PrefsBar({
  prefs,
  onChange,
  currentUrl,
}: {
  prefs: Prefs
  onChange: (patch: Partial<Prefs>) => void
  currentUrl: string
}) {
  const { open, setOpen, rootRef, triggerRef } = usePopover()
  const [name, setName] = useState('')

  function saveView() {
    const label = name.trim() || `View ${prefs.savedViews.length + 1}`
    const next: SavedView = { id: uid(), name: label, url: currentUrl }
    onChange({ savedViews: [...prefs.savedViews, next] })
    setName('')
  }

  function applyView(id: string) {
    const view = prefs.savedViews.find((v) => v.id === id)
    if (!view) return
    const hash = view.url.startsWith('#') ? view.url : `#${view.url}`
    window.location.hash = hash.replace(/^#/, '')
    setOpen(false)
  }

  function removeView(id: string) {
    onChange({ savedViews: prefs.savedViews.filter((v) => v.id !== id) })
  }

  return (
    <div className="prefs-menu" ref={rootRef}>
      <button
        type="button"
        ref={triggerRef}
        className="ui-btn ui-btn-ghost ui-btn-sm"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen(!open)}
      >
        Settings
      </button>
      {open && (
        <div className="ui-popover prefs-menu-panel" role="dialog" aria-label="Display settings">
          <div className="prefs-menu-section">
            <div className="prefs-menu-heading">Display</div>
            <Switch
              label="Dark mode"
              checked={prefs.theme === 'dark'}
              onChange={(on) => onChange({ theme: on ? 'dark' : 'light' })}
            />
            <Switch
              label="Compact density"
              checked={prefs.density === 'compact'}
              onChange={(on) => onChange({ density: on ? 'compact' : 'comfortable' })}
            />
            <Button variant="secondary" size="sm" onClick={() => window.print()}>
              Print / PDF
            </Button>
          </div>

          <div className="prefs-menu-section">
            <div className="prefs-menu-heading">Saved views</div>
            <div className="prefs-save">
              <input
                className="prefs-save-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Name this view"
                aria-label="Saved view name"
              />
              <Button variant="primary" size="sm" onClick={saveView}>Save</Button>
            </div>
            {prefs.savedViews.length > 0 ? (
              <>
                <Select
                  label="Apply"
                  value=""
                  options={[
                    { value: '', label: 'Choose…' },
                    ...prefs.savedViews.map((v) => ({ value: v.id, label: v.name })),
                  ]}
                  onChange={(id) => {
                    if (id) applyView(id)
                  }}
                />
                <Select
                  label="Remove"
                  value=""
                  options={[
                    { value: '', label: 'Choose…' },
                    ...prefs.savedViews.map((v) => ({ value: v.id, label: v.name })),
                  ]}
                  onChange={(id) => {
                    if (id) removeView(id)
                  }}
                />
              </>
            ) : (
              <p className="prefs-menu-hint">Save the current filters and page as a reusable view.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}