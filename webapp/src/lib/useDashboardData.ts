import { useCallback, useEffect, useState } from 'react'
import { useToast } from '../components/ui'
import type { DashboardData, DashboardMeta } from '../types'

const SESSION_KEY = 'etram.dashboard.session'

export type UseDashboardData = {
  data: DashboardData | null
  meta: DashboardMeta | null
  schemaVersion: number
  /** Gate every widget that depends on Phase E tables on this. */
  isV2: boolean
  loading: boolean
  error: string | null
  reload: () => void
  /** Swap in a payload produced by an upload job. */
  replace: (d: DashboardData) => void
  clear: () => void
}

export function readSession(): DashboardData | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return null
    return JSON.parse(raw) as DashboardData
  } catch {
    return null
  }
}

export function writeSession(d: DashboardData | null): boolean {
  try {
    if (!d) sessionStorage.removeItem(SESSION_KEY)
    else sessionStorage.setItem(SESSION_KEY, JSON.stringify(d))
    return true
  } catch {
    return false // quota exceeded, or private/incognito mode blocking storage entirely
  }
}

/**
 * Upload-first: no city dashboard is preloaded from static files.
 * Data appears only after a successful upload job (optionally restored
 * from this browser tab's sessionStorage).
 */
export function useDashboardData(): UseDashboardData {
  const [data, setData] = useState<DashboardData | null>(() => readSession())
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const toast = useToast()

  useEffect(() => {
    // Intentionally do not fetch /data/* — portal stays empty until upload.
  }, [])

  const reload = useCallback(() => {
    setData(readSession())
    setError(null)
  }, [])

  const replace = useCallback(
    (d: DashboardData) => {
      const persisted = writeSession(d)
      if (!persisted) {
        toast.push(
          "Loaded, but this load is too large to keep across a page refresh in this browser tab (storage limit). It's fully usable now — re-upload if you reload the page.",
          'warn',
        )
      }
      setData(d)
      setError(null)
      setLoading(false)
    },
    [toast],
  )

  const clear = useCallback(() => {
    writeSession(null)
    setData(null)
    setError(null)
  }, [])

  const meta = data?.meta ?? null
  const schemaVersion = meta?.schema_version ?? 1

  return {
    data,
    meta,
    schemaVersion,
    isV2: schemaVersion >= 2,
    loading,
    error,
    reload,
    replace,
    clear,
  }
}
