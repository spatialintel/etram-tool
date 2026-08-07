import { useCallback, useEffect, useState } from 'react'

export type SavedView = { id: string; name: string; url: string }

export type Prefs = {
  theme: 'light' | 'dark'
  density: 'comfortable' | 'compact'
  compactNumbers: boolean
  savedViews: SavedView[]
}

export const DEFAULT_PREFS: Prefs = {
  theme: 'light',
  density: 'comfortable',
  compactNumbers: false,
  savedViews: [],
}

const KEY = 'etram.prefs.v1'

export function readPrefs(): Prefs {
  if (typeof localStorage === 'undefined') return DEFAULT_PREFS
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return DEFAULT_PREFS
    const parsed = JSON.parse(raw) as Partial<Prefs> & { targets?: unknown }
    // Drop legacy `targets` from older prefs blobs.
    const { targets: _ignored, ...rest } = parsed
    void _ignored
    return {
      ...DEFAULT_PREFS,
      ...rest,
      savedViews: parsed.savedViews ?? [],
    }
  } catch {
    return DEFAULT_PREFS
  }
}

export function writePrefs(p: Prefs): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(KEY, JSON.stringify(p))
  } catch {
    // Quota or private-mode failure is not worth breaking the UI over.
  }
}

export function usePrefs(): [Prefs, (patch: Partial<Prefs>) => void] {
  const [prefs, setPrefs] = useState<Prefs>(() => readPrefs())

  useEffect(() => {
    writePrefs(prefs)
  }, [prefs])

  const patch = useCallback((next: Partial<Prefs>) => {
    setPrefs((prev) => ({ ...prev, ...next }))
  }, [])

  return [prefs, patch]
}
