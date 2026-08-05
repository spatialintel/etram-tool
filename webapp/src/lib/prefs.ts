import { useCallback, useEffect, useState } from 'react'

export type SavedView = { id: string; name: string; url: string }

export type Prefs = {
  theme: 'light' | 'dark'
  density: 'comfortable' | 'compact'
  compactNumbers: boolean
  targets: { lf: number; fareYield: number; tripsPerBus: number; headwayMins: number }
  savedViews: SavedView[]
}

export const DEFAULT_PREFS: Prefs = {
  theme: 'light',
  density: 'comfortable',
  compactNumbers: false,
  targets: { lf: 0.6, fareYield: 12, tripsPerBus: 6, headwayMins: 20 },
  savedViews: [],
}

const KEY = 'etram.prefs.v1'

export function readPrefs(): Prefs {
  if (typeof localStorage === 'undefined') return DEFAULT_PREFS
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return DEFAULT_PREFS
    const parsed = JSON.parse(raw) as Partial<Prefs>
    // Shallow merge keeps older stored objects usable when new prefs are added.
    return {
      ...DEFAULT_PREFS,
      ...parsed,
      targets: { ...DEFAULT_PREFS.targets, ...(parsed.targets ?? {}) },
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
  const [prefs, setPrefs] = useState<Prefs>(readPrefs)

  useEffect(() => {
    writePrefs(prefs)
  }, [prefs])

  const update = useCallback((patch: Partial<Prefs>) => {
    setPrefs((prev) => ({ ...prev, ...patch }))
  }, [])

  return [prefs, update]
}
