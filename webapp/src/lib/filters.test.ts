import { describe, expect, it } from 'vitest'
import {
  DEFAULT_FILTERS,
  activeChips,
  addDays,
  applyFilters,
  buildHash,
  clearChip,
  getComparisonRange,
  parseFilters,
  parseHash,
  rangeLength,
  serializeFilters,
  weekdayOf,
} from './filters'
import type { FilterState } from './filters'

const f = (patch: Partial<FilterState> = {}): FilterState => ({
  ...DEFAULT_FILTERS,
  range: { start: '2026-04-01', end: '2026-04-30' },
  ...patch,
})

describe('date helpers', () => {
  it('counts an inclusive range', () => {
    expect(rangeLength({ start: '2026-04-01', end: '2026-04-01' })).toBe(1)
    expect(rangeLength({ start: '2026-04-01', end: '2026-04-30' })).toBe(30)
    expect(rangeLength({ start: '', end: '' })).toBe(0)
  })

  it('adds days across month and year boundaries', () => {
    expect(addDays('2026-04-30', 1)).toBe('2026-05-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
  })

  it('reads weekday in UTC so local time never shifts the day', () => {
    expect(weekdayOf('2026-04-01')).toBe(3)
    expect(weekdayOf('2026-04-05')).toBe(0)
  })
})

describe('applyFilters', () => {
  const rows = [
    { service_date: '2026-04-01', route_code: 'R1', start_hour: 8 },
    { service_date: '2026-04-05', route_code: 'R2', start_hour: 18 },
    { service_date: '2026-04-30', route_code: 'R1', start_hour: 22 },
    { service_date: '2026-05-01', route_code: 'R3', start_hour: 9 },
  ]

  it('includes both ends of the range', () => {
    const out = applyFilters(rows, f({ range: { start: '2026-04-01', end: '2026-04-30' } }))
    expect(out.map((r) => r.service_date)).toEqual(['2026-04-01', '2026-04-05', '2026-04-30'])
  })

  it('treats an empty route list as all routes', () => {
    expect(applyFilters(rows, f())).toHaveLength(3)
    expect(applyFilters(rows, f({ routes: ['R1'] })).map((r) => r.route_code)).toEqual(['R1', 'R1'])
    expect(applyFilters(rows, f({ routes: ['R1', 'R2'] }))).toHaveLength(3)
  })

  it('filters by hour window inclusively', () => {
    expect(applyFilters(rows, f({ hours: [8, 18] })).map((r) => r.start_hour)).toEqual([8, 18])
    expect(applyFilters(rows, f({ hours: [0, 23] }))).toHaveLength(3)
  })

  it('filters by day of week', () => {
    expect(applyFilters(rows, f({ days: [0] })).map((r) => r.service_date)).toEqual(['2026-04-05'])
    expect(applyFilters(rows, f({ days: [] }))).toHaveLength(3)
  })

  it('ignores a field the row does not carry', () => {
    const daily = [{ service_date: '2026-04-02' }, { service_date: '2026-04-03' }]
    expect(applyFilters(daily, f({ routes: ['R9'], hours: [6, 7] }))).toHaveLength(2)
  })
})

describe('getComparisonRange', () => {
  it('returns null when comparison is off', () => {
    expect(getComparisonRange(f({ compare: 'none' }))).toBeNull()
  })

  it('returns the immediately preceding window of equal length', () => {
    const r = getComparisonRange(f({ compare: 'prev-period', range: { start: '2026-04-15', end: '2026-04-30' } }))
    expect(r).toEqual({ start: '2026-03-30', end: '2026-04-14', partial: false })
    expect(rangeLength(r!)).toBe(16)
  })

  it('crosses month and year boundaries', () => {
    expect(getComparisonRange(f({ compare: 'prev-period', range: { start: '2026-01-01', end: '2026-01-31' } })))
      .toEqual({ start: '2025-12-01', end: '2025-12-31', partial: false })
  })

  it('truncates at the dataset start and flags it partial', () => {
    const r = getComparisonRange(
      f({ compare: 'prev-period', range: { start: '2026-04-10', end: '2026-04-30' } }),
      { min: '2026-04-01' },
    )
    expect(r).toEqual({ start: '2026-04-01', end: '2026-04-09', partial: true })
  })

  it('returns null when the whole window predates the dataset', () => {
    expect(
      getComparisonRange(
        f({ compare: 'prev-period', range: { start: '2026-04-01', end: '2026-04-30' } }),
        { min: '2026-04-01' },
      ),
    ).toBeNull()
  })

  it('handles a single-day range', () => {
    expect(getComparisonRange(f({ compare: 'prev-period', range: { start: '2026-04-02', end: '2026-04-02' } })))
      .toEqual({ start: '2026-04-01', end: '2026-04-01', partial: false })
  })

  it('shifts the same calendar dates back a year', () => {
    expect(getComparisonRange(f({ compare: 'prev-year', range: { start: '2026-04-01', end: '2026-04-30' } })))
      .toEqual({ start: '2025-04-01', end: '2025-04-30', partial: false })
  })

  it('uses the explicit window in custom mode, ordering the dates', () => {
    expect(
      getComparisonRange(f({ compare: 'custom', compareRange: { start: '2026-02-10', end: '2026-02-01' } })),
    ).toEqual({ start: '2026-02-01', end: '2026-02-10', partial: false })
  })

  it('returns null in custom mode until both dates are set', () => {
    expect(getComparisonRange(f({ compare: 'custom', compareRange: { start: '2026-02-01', end: '' } }))).toBeNull()
  })

  it('round-trips a custom comparison window through the URL', () => {
    const state = f({ compare: 'custom', compareRange: { start: '2026-02-01', end: '2026-02-10' } })
    const parsed = parseFilters(serializeFilters(state))
    expect(parsed.compare).toBe('custom')
    expect(parsed.compareRange).toEqual({ start: '2026-02-01', end: '2026-02-10' })
  })
})

describe('activeChips', () => {
  it('shows only the range when nothing else is narrowed', () => {
    expect(activeChips(f()).map((c) => c.id)).toEqual(['range'])
  })

  it('summarises long selections by count', () => {
    const chips = activeChips(f({ routes: ['R1', 'R2', 'R3'] }))
    expect(chips.find((c) => c.id === 'routes')?.value).toBe('3 selected')
    expect(activeChips(f({ routes: ['R1'] })).find((c) => c.id === 'routes')?.value).toBe('R1')
  })

  it('reports narrowed hours and days, and only shows compare when it differs from the default', () => {
    const chips = activeChips(f({ hours: [6, 10], days: [1, 2] }))
    const byId = Object.fromEntries(chips.map((c) => [c.id, c.value]))
    expect(byId.hours).toBe('06:00-10:59')
    expect(byId.days).toBe('Mon, Tue')
    expect(byId.compare).toBeUndefined()
    expect(activeChips(f({ compare: 'none' })).find((c) => c.id === 'compare')?.value).toBe('Off')
  })

  it('clears a chip back to its default', () => {
    expect(clearChip('routes', DEFAULT_FILTERS.range)).toEqual({ routes: [] })
    expect(clearChip('hours', DEFAULT_FILTERS.range)).toEqual({ hours: [0, 23] })
    expect(clearChip('unknown', DEFAULT_FILTERS.range)).toEqual({})
  })
})

describe('URL round-trip', () => {
  it('restores every field it serialises', () => {
    const original = f({
      compare: 'none',
      routes: ['R1', 'R7'],
      directions: ['R1-UP'],
      hours: [6, 22],
      days: [1, 3, 5],
      granularity: 'weekly',
      topN: 20,
      metric: 'revenue',
      showValues: true,
      showAverage: false,
    })
    expect(parseFilters(serializeFilters(original))).toEqual(original)
  })

  it('keeps defaults out of the URL', () => {
    expect(serializeFilters(f())).toBe('start=2026-04-01&end=2026-04-30')
  })

  it('ignores unknown keys and malformed values', () => {
    const parsed = parseFilters('start=2026-04-01&end=2026-04-30&bogus=1&hours=abc&days=9,x&top=-5&metric=nope', DEFAULT_FILTERS)
    expect(parsed.hours).toEqual([0, 23])
    expect(parsed.days).toEqual([])
    expect(parsed.topN).toBe(DEFAULT_FILTERS.topN)
    expect(parsed.metric).toBe('ridership')
    expect(parsed.range).toEqual({ start: '2026-04-01', end: '2026-04-30' })
  })

  it('repairs an inverted range and an inverted hour window', () => {
    expect(parseFilters('start=2026-04-30&end=2026-04-01').range).toEqual({ start: '2026-04-01', end: '2026-04-30' })
    expect(parseFilters('hours=22-6').hours).toEqual([6, 22])
    expect(parseFilters('hours=-4-99').hours).toEqual([0, 23])
  })

  it('round-trips through the hash including the page', () => {
    const state = f({ routes: ['R1'] })
    const hash = buildHash('routes', state)
    expect(hash).toContain('#/routes?')
    const parsed = parseHash(hash)
    expect(parsed.page).toBe('routes')
    expect(parsed.filters.routes).toEqual(['R1'])
  })

  it('falls back to the default page for an empty hash', () => {
    expect(parseHash('').page).toBe('overview')
    expect(parseHash('#/').page).toBe('overview')
  })
})
