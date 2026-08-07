/**
 * Single formatting authority for the dashboard.
 * No component may call `Intl.NumberFormat` directly.
 */

const EM_DASH = '\u2014'
const RUPEE = '\u20B9'

const intFmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })
const dpFmt = new Map<number, Intl.NumberFormat>()

function grouped(n: number, dp: number): string {
  let f = dpFmt.get(dp)
  if (!f) {
    f = new Intl.NumberFormat('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp })
    dpFmt.set(dp, f)
  }
  return f.format(n)
}

type Num = number | null | undefined

const isNum = (n: Num): n is number => n != null && Number.isFinite(n)

export const UNIT_LABEL = {
  pax: 'passengers',
  inr: RUPEE,
  km: 'km',
  pct: '%',
  min: 'min',
  count: '',
  ratio: 'ratio (unitless)',
} as const

export type Unit = keyof typeof UNIT_LABEL

export const fmtInt = (n: Num): string => (isNum(n) ? intFmt.format(Math.round(n)) : EM_DASH)

export const fmtNum = (n: Num, dp = 2): string => (isNum(n) ? grouped(n, dp) : EM_DASH)

const LAKH = 1e5
const CRORE = 1e7

/**
 * `{ compact: true }` switches to the Indian lakh/crore scale, which is what
 * agency staff read in reports. Thresholds are absolute so negatives scale too.
 */
export function fmtMoney(n: Num, opts?: { compact?: boolean; dp?: number }): string {
  if (!isNum(n)) return EM_DASH
  if (opts?.compact) {
    const dp = opts.dp ?? 2
    const abs = Math.abs(n)
    if (abs >= CRORE) return `${RUPEE}${grouped(n / CRORE, dp)} Cr`
    if (abs >= LAKH) return `${RUPEE}${grouped(n / LAKH, dp)} L`
  }
  const dp = opts?.dp ?? 0
  return RUPEE + (dp === 0 ? intFmt.format(Math.round(n)) : grouped(n, dp))
}

/** 0.62 -> "62.0%" */
export const fmtPct = (ratio: Num, dp = 1): string =>
  isNum(ratio) ? `${(ratio * 100).toFixed(dp)}%` : EM_DASH

export const fmtKm = (n: Num, dp = 2): string => (isNum(n) ? `${n.toFixed(dp)} km` : EM_DASH)

export const fmtMin = (n: Num): string => (isNum(n) ? `${Math.round(n)} min` : EM_DASH)

export type Delta = { pct: number; up: boolean; label: string }

/**
 * Returns null when there is no meaningful comparison (missing or zero
 * baseline). Callers must hide the delta rather than render a misleading 0%.
 */
export function fmtDelta(cur: Num, prev: Num, dp = 1): Delta | null {
  if (!isNum(cur) || !isNum(prev) || prev === 0) return null
  const pct = ((cur - prev) / Math.abs(prev)) * 100
  return { pct, up: pct >= 0, label: `${Math.abs(pct).toFixed(dp)}%` }
}

export function fmtBytes(n: Num): string {
  if (!isNum(n)) return EM_DASH
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

/** "2026-04-12" -> "12 Apr" (short axis / chip label). */
export function fmtDateShort(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return `${d.getDate()} ${d.toLocaleString('en-IN', { month: 'short' })}`
}

/** "2026-04-12" -> "Sunday" using the calendar date, not the local timezone. */
export function fmtWeekday(iso: string): string {
  const d = new Date(`${iso}T12:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('en-IN', { weekday: 'long' })
}

/** "2026-04-12" -> "Sunday, 12 Apr". */
export function fmtDateWithWeekday(iso: string): string {
  return `${fmtWeekday(iso)}, ${fmtDateShort(iso)}`
}

export { EM_DASH, RUPEE }
