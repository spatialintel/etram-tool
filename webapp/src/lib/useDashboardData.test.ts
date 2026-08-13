import { afterEach, describe, expect, it, vi } from 'vitest'
import { readSession, writeSession } from './useDashboardData'
import type { DashboardData } from '../types'

function fakeStorage(opts?: { throwOnSetItem?: boolean }) {
  const store = new Map<string, string>()
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (opts?.throwOnSetItem) throw new DOMException('QuotaExceededError')
      store.set(k, v)
    },
    removeItem: (k: string) => store.delete(k),
    store,
  }
}

const sample = { meta: { schema_version: 2 } } as unknown as DashboardData

describe('writeSession / readSession', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('returns true and round-trips through a working sessionStorage', () => {
    const storage = fakeStorage()
    vi.stubGlobal('sessionStorage', storage)
    expect(writeSession(sample)).toBe(true)
    expect(readSession()).toEqual(sample)
  })

  it('returns false when sessionStorage throws (quota exceeded / private mode)', () => {
    vi.stubGlobal('sessionStorage', fakeStorage({ throwOnSetItem: true }))
    expect(writeSession(sample)).toBe(false)
  })

  it('clearing (null) still succeeds even when writes are blocked — removeItem never hits quota', () => {
    vi.stubGlobal('sessionStorage', fakeStorage({ throwOnSetItem: true }))
    expect(writeSession(null)).toBe(true)
  })

  it('readSession tolerates corrupted/malformed stored JSON rather than throwing', () => {
    const storage = fakeStorage()
    storage.store.set('etram.dashboard.session', '{not valid json')
    vi.stubGlobal('sessionStorage', storage)
    expect(readSession()).toBeNull()
  })
})
