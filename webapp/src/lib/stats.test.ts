import { describe, expect, it } from 'vitest'
import { linearRegression, mean, movingAverage, percentile, periodDelta, sum, topN, topNWithOther } from './stats'

describe('sum and mean', () => {
  it('handles empty input without NaN', () => {
    expect(sum([])).toBe(0)
    expect(mean([])).toBe(0)
  })

  it('aggregates values', () => {
    expect(sum([1, 2, 3])).toBe(6)
    expect(mean([2, 4, 6])).toBe(4)
  })
})

describe('movingAverage', () => {
  it('leaves the leading window undefined', () => {
    expect(movingAverage([1, 2, 3, 4], 3)).toEqual([null, null, 2, 3])
  })

  it('returns all nulls when the window exceeds the series length', () => {
    expect(movingAverage([1, 2], 5)).toEqual([null, null])
  })

  it('is an identity for a window of one', () => {
    expect(movingAverage([5, 7, 9], 1)).toEqual([5, 7, 9])
  })

  it('handles an empty series and rejects a non-positive window', () => {
    expect(movingAverage([], 7)).toEqual([])
    expect(() => movingAverage([1, 2, 3], 0)).toThrow()
  })
})

describe('linearRegression', () => {
  it('recovers the slope of a perfect line', () => {
    const r = linearRegression([0, 2, 4, 6, 8])
    expect(r.slope).toBeCloseTo(2, 10)
    expect(r.intercept).toBeCloseTo(0, 10)
    expect(r.r2).toBeCloseTo(1, 10)
    expect(r.fitted).toHaveLength(5)
  })

  it('returns a zero slope for a flat series', () => {
    const r = linearRegression([5, 5, 5, 5])
    expect(r.slope).toBe(0)
    expect(r.intercept).toBe(5)
    expect(r.r2).toBe(0)
  })

  it('detects a negative trend', () => {
    expect(linearRegression([10, 8, 6, 4]).slope).toBeCloseTo(-2, 10)
  })

  it('degrades safely on one or zero points', () => {
    const one = linearRegression([42])
    expect(one.slope).toBe(0)
    expect(one.intercept).toBe(42)
    expect(Number.isNaN(one.r2)).toBe(false)

    const none = linearRegression([])
    expect(none.slope).toBe(0)
    expect(none.fitted).toEqual([])
  })
})

describe('percentile', () => {
  const values = [1, 2, 3, 4, 5]

  it('returns the bounds at p0 and p100', () => {
    expect(percentile(values, 0)).toBe(1)
    expect(percentile(values, 100)).toBe(5)
  })

  it('interpolates between neighbours', () => {
    expect(percentile(values, 50)).toBe(3)
    expect(percentile([1, 2, 3, 4], 50)).toBeCloseTo(2.5, 10)
    expect(percentile([0, 10], 25)).toBeCloseTo(2.5, 10)
  })

  it('sorts the input and clamps out-of-range percentiles', () => {
    expect(percentile([5, 1, 3], 50)).toBe(3)
    expect(percentile(values, -10)).toBe(1)
    expect(percentile(values, 150)).toBe(5)
    expect(percentile([], 50)).toBe(0)
  })
})

describe('periodDelta', () => {
  it('compares totals', () => {
    const d = periodDelta([10, 10], [8, 8])
    expect(d.current).toBe(20)
    expect(d.previous).toBe(16)
    expect(d.abs).toBe(4)
    expect(d.pct).toBeCloseTo(25, 10)
    expect(d.up).toBe(true)
  })

  it('reports null percent when there is no baseline', () => {
    expect(periodDelta([10], []).pct).toBeNull()
    expect(periodDelta([10], [0, 0]).pct).toBeNull()
  })

  it('flags a decline', () => {
    const d = periodDelta([5], [10])
    expect(d.up).toBe(false)
    expect(d.pct).toBeCloseTo(-50, 10)
  })
})

describe('topN', () => {
  const rows = [
    { route: 'A', ridership: 10 },
    { route: 'B', ridership: 30 },
    { route: 'C', ridership: 20 },
  ]

  it('sorts descending and truncates', () => {
    expect(topN(rows, 'ridership', 2).map((r) => r.route)).toEqual(['B', 'C'])
  })

  it('returns every row when n is zero or negative', () => {
    expect(topN(rows, 'ridership', 0)).toHaveLength(3)
  })

  it('does not mutate the input', () => {
    topN(rows, 'ridership', 2)
    expect(rows[0].route).toBe('A')
  })

  it('buckets the tail into Other so shares still total', () => {
    const out = topNWithOther(rows, 'route', 'ridership', 2)
    expect(out).toEqual([
      { label: 'B', value: 30 },
      { label: 'C', value: 20 },
      { label: 'Other', value: 10 },
    ])
    expect(topNWithOther(rows, 'route', 'ridership', 5)).toHaveLength(3)
  })
})
