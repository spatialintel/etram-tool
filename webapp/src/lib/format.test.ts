import { describe, expect, it } from 'vitest'
import { EM_DASH, fmtBytes, fmtDelta, fmtInt, fmtKm, fmtMin, fmtMoney, fmtNum, fmtPct } from './format'

describe('fmtInt', () => {
  it('uses Indian digit grouping', () => {
    expect(fmtInt(1234567)).toBe('12,34,567')
    expect(fmtInt(1000)).toBe('1,000')
    expect(fmtInt(100000)).toBe('1,00,000')
  })

  it('rounds and handles zero and negatives', () => {
    expect(fmtInt(0)).toBe('0')
    expect(fmtInt(1234.6)).toBe('1,235')
    expect(fmtInt(-45000)).toBe('-45,000')
  })

  it('returns an em dash for missing or non-finite values', () => {
    expect(fmtInt(null)).toBe(EM_DASH)
    expect(fmtInt(undefined)).toBe(EM_DASH)
    expect(fmtInt(NaN)).toBe(EM_DASH)
    expect(fmtInt(Infinity)).toBe(EM_DASH)
  })
})

describe('fmtMoney', () => {
  it('defaults to whole rupees with grouping', () => {
    expect(fmtMoney(1234567)).toBe('\u20B912,34,567')
    expect(fmtMoney(0)).toBe('\u20B90')
  })

  it('honours decimal places for per-unit values', () => {
    expect(fmtMoney(12.345, { dp: 2 })).toBe('\u20B912.35')
  })

  it('switches to lakh and crore only at the boundaries', () => {
    expect(fmtMoney(99999, { compact: true })).toBe('\u20B999,999')
    expect(fmtMoney(100000, { compact: true })).toBe('\u20B91.00 L')
    expect(fmtMoney(9999999, { compact: true })).toBe('\u20B9100.00 L')
    expect(fmtMoney(10000000, { compact: true })).toBe('\u20B91.00 Cr')
  })

  it('scales negatives the same way', () => {
    expect(fmtMoney(-250000, { compact: true })).toBe('\u20B9-2.50 L')
  })

  it('returns an em dash for missing values', () => {
    expect(fmtMoney(null)).toBe(EM_DASH)
  })
})

describe('fmtPct', () => {
  it('converts a ratio to a percentage string', () => {
    expect(fmtPct(0.62)).toBe('62.0%')
    expect(fmtPct(0)).toBe('0.0%')
    expect(fmtPct(1)).toBe('100.0%')
  })

  it('respects the decimal-place argument', () => {
    expect(fmtPct(0.6249, 2)).toBe('62.49%')
    expect(fmtPct(0.6249, 0)).toBe('62%')
  })

  it('returns an em dash for missing values', () => {
    expect(fmtPct(null)).toBe(EM_DASH)
  })
})

describe('unit formatters', () => {
  it('formats km and minutes', () => {
    expect(fmtKm(3.4149)).toBe('3.41 km')
    expect(fmtKm(3.4149, 1)).toBe('3.4 km')
    expect(fmtMin(12.4)).toBe('12 min')
    expect(fmtKm(null)).toBe(EM_DASH)
    expect(fmtMin(null)).toBe(EM_DASH)
  })

  it('formats grouped decimals', () => {
    expect(fmtNum(123456.789, 1)).toBe('1,23,456.8')
    expect(fmtNum(null)).toBe(EM_DASH)
  })

  it('formats byte sizes', () => {
    expect(fmtBytes(512)).toBe('512 B')
    expect(fmtBytes(2048)).toBe('2.0 KB')
    expect(fmtBytes(5 * 1024 * 1024)).toBe('5.0 MB')
  })
})

describe('fmtDelta', () => {
  it('computes signed percentage change', () => {
    expect(fmtDelta(110, 100)).toEqual({ pct: 10, up: true, label: '10.0%' })
    expect(fmtDelta(90, 100)).toEqual({ pct: -10, up: false, label: '10.0%' })
  })

  it('treats an unchanged value as up', () => {
    expect(fmtDelta(100, 100)).toEqual({ pct: 0, up: true, label: '0.0%' })
  })

  it('returns null instead of Infinity when the baseline is zero or missing', () => {
    expect(fmtDelta(100, 0)).toBeNull()
    expect(fmtDelta(100, null)).toBeNull()
    expect(fmtDelta(100, undefined)).toBeNull()
  })

  it('uses the magnitude of a negative baseline', () => {
    expect(fmtDelta(-50, -100)).toEqual({ pct: 50, up: true, label: '50.0%' })
  })
})
