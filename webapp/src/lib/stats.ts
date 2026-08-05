/**
 * Pure numeric helpers used by trend lines, average markers and delta badges.
 * Everything here is deliberately dependency-free and unit-tested.
 */

export const sum = (values: number[]): number => values.reduce((s, v) => s + (v || 0), 0)

export const mean = (values: number[]): number => (values.length ? sum(values) / values.length : 0)

/**
 * Trailing moving average. Positions before the window is full are `null` so
 * the series starts where the average is actually defined (charts skip nulls).
 */
export function movingAverage(values: number[], window = 7): (number | null)[] {
  if (window <= 0) throw new Error('movingAverage: window must be >= 1')
  const out: (number | null)[] = []
  let running = 0
  for (let i = 0; i < values.length; i++) {
    running += values[i] || 0
    if (i >= window) running -= values[i - window] || 0
    out.push(i >= window - 1 ? running / window : null)
  }
  return out
}

export type Regression = { slope: number; intercept: number; fitted: number[]; r2: number }

/** Least-squares fit against the index (0..n-1). Degenerate inputs give slope 0, never NaN. */
export function linearRegression(values: number[]): Regression {
  const n = values.length
  if (n === 0) return { slope: 0, intercept: 0, fitted: [], r2: 0 }
  if (n === 1) return { slope: 0, intercept: values[0], fitted: [values[0]], r2: 0 }

  const xBar = (n - 1) / 2
  const yBar = mean(values)
  let sxy = 0
  let sxx = 0
  for (let i = 0; i < n; i++) {
    sxy += (i - xBar) * (values[i] - yBar)
    sxx += (i - xBar) ** 2
  }
  const slope = sxx === 0 ? 0 : sxy / sxx
  const intercept = yBar - slope * xBar
  const fitted = values.map((_, i) => intercept + slope * i)

  let ssRes = 0
  let ssTot = 0
  for (let i = 0; i < n; i++) {
    ssRes += (values[i] - fitted[i]) ** 2
    ssTot += (values[i] - yBar) ** 2
  }
  return { slope, intercept, fitted, r2: ssTot === 0 ? 0 : 1 - ssRes / ssTot }
}

/** Linear-interpolated percentile. `p` in 0..100. Input need not be sorted. */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0
  const s = [...values].sort((a, b) => a - b)
  const clamped = Math.min(100, Math.max(0, p))
  const pos = ((s.length - 1) * clamped) / 100
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  if (lo === hi) return s[lo]
  return s[lo] + (s[hi] - s[lo]) * (pos - lo)
}

export type PeriodDelta = {
  current: number
  previous: number
  abs: number
  pct: number | null
  up: boolean
}

/** Totals-based comparison. `pct` is null when the baseline is empty or zero. */
export function periodDelta(cur: number[], prev: number[]): PeriodDelta {
  const current = sum(cur)
  const previous = sum(prev)
  const abs = current - previous
  const pct = prev.length === 0 || previous === 0 ? null : (abs / Math.abs(previous)) * 100
  return { current, previous, abs, pct, up: abs >= 0 }
}

/** Descending top-N by a numeric key. `n <= 0` returns every row. */
export function topN<T>(rows: T[], key: keyof T, n: number): T[] {
  const sorted = [...rows].sort((a, b) => Number(b[key] ?? 0) - Number(a[key] ?? 0))
  return n > 0 ? sorted.slice(0, n) : sorted
}

/**
 * Top-N plus an aggregated "Other" bucket, for donuts and share charts where
 * dropping the tail would misstate the total.
 */
export function topNWithOther<T extends Record<string, unknown>>(
  rows: T[],
  labelKey: keyof T,
  valueKey: keyof T,
  n: number,
  otherLabel = 'Other',
): Array<{ label: string; value: number }> {
  const mapped = rows.map((r) => ({ label: String(r[labelKey]), value: Number(r[valueKey] ?? 0) }))
  mapped.sort((a, b) => b.value - a.value)
  if (n <= 0 || mapped.length <= n) return mapped
  const head = mapped.slice(0, n)
  const rest = mapped.slice(n).reduce((s, r) => s + r.value, 0)
  return rest > 0 ? [...head, { label: otherLabel, value: rest }] : head
}
