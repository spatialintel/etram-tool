import { useCallback, useEffect, useState } from 'react'
import type { DashboardData, DashboardMeta } from '../types'

const STATIC_URL = '/data/bhavnagar-dashboard.json'

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
}

export function useDashboardData(url: string = STATIC_URL): UseDashboardData {
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((json: DashboardData) => {
        if (cancelled) return
        setData(json)
        setError(null)
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [url, nonce])

  const reload = useCallback(() => setNonce((n) => n + 1), [])

  const replace = useCallback((d: DashboardData) => {
    setData(d)
    setError(null)
    setLoading(false)
  }, [])

  const meta = data?.meta ?? null
  const schemaVersion = meta?.schema_version ?? 1

  return { data, meta, schemaVersion, isV2: schemaVersion >= 2, loading, error, reload, replace }
}
