import { useCallback, useEffect, useState } from 'react'

/* Types */

export type DateRange = { start: string; end: string }
export type Granularity = 'daily' | 'weekly' | 'monthly'
export type CompareMode = 'none' | 'prev-period' | 'prev-year' | 'custom'
export type MetricKey = 'ridership' | 'revenue' | 'lf'

export type FilterState = {
  range: DateRange
  compare: CompareMode
  /** Only read when compare === 'custom'. */
  compareRange: DateRange
  /** [] means "all" for every multi-select below. */
  routes: string[]
  directions: string[]
  hours: [number, number]
  /** 0 = Sunday .. 6 = Saturday */
  days: number[]
  granularity: Granularity
  /** 0 = show all */
  topN: number
  metric: MetricKey
  showValues: boolean
  showAverage: boolean
}

export const DEFAULT_FILTERS: FilterState = {
  range: { start: '', end: '' },
  // On by default so KPI deltas exist without configuration; getComparisonRange
  // returns null at the start of the dataset, so no misleading zero appears.
  compare: 'prev-period',
  compareRange: { start: '', end: '' },
  routes: [],
  directions: [],
  hours: [0, 23],
  days: [],
  granularity: 'daily',
  topN: 10,
  metric: 'ridership',
  showValues: false,
  showAverage: true,
}

/* Date helpers. service_date is a calendar date, so everything is UTC-based. */

const DAY_MS = 86_400_000

export function parseISO(iso: string): number {
  return Date.parse(`${iso}T00:00:00Z`)
}

export function toISO(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

export function addDays(iso: string, n: number): string {
  return toISO(parseISO(iso) + n * DAY_MS)
}

/** Same calendar day, n years earlier or later. 29 Feb falls back to 28 Feb. */
export function shiftYear(iso: string, n: number): string {
  const d = new Date(parseISO(iso))
  const year = d.getUTCFullYear() + n
  const month = d.getUTCMonth()
  const day = Math.min(d.getUTCDate(), new Date(Date.UTC(year, month + 1, 0)).getUTCDate())
  return toISO(Date.UTC(year, month, day))
}

/** Inclusive day count: 2026-04-01..2026-04-01 is 1 day. */
export function rangeLength(r: DateRange): number {
  if (!r.start || !r.end) return 0
  return Math.round((parseISO(r.end) - parseISO(r.start)) / DAY_MS) + 1
}

/** 0 = Sunday .. 6 = Saturday */
export function weekdayOf(iso: string): number {
  return new Date(parseISO(iso)).getUTCDay()
}

export const inRange = (iso: string, r: DateRange): boolean =>
  (!r.start || iso >= r.start) && (!r.end || iso <= r.end)

/* Filtering */

export type FilterableRow = {
  service_date: string
  route_code?: string
  route_direction_key?: string
  start_hour?: number
}

/**
 * A filter only applies when the row actually carries the field, so the same
 * function works for `daily` (no route) and `temporal` (route + hour).
 */
export function applyFilters<T extends FilterableRow>(rows: T[], f: FilterState): T[] {
  const [h0, h1] = f.hours
  const hoursNarrowed = h0 > 0 || h1 < 23
  return rows.filter((r) => {
    if (!inRange(r.service_date, f.range)) return false
    if (f.routes.length > 0 && r.route_code != null && !f.routes.includes(r.route_code)) return false
    if (f.directions.length > 0 && r.route_direction_key != null && !f.directions.includes(r.route_direction_key)) return false
    if (hoursNarrowed && r.start_hour != null && (r.start_hour < h0 || r.start_hour > h1)) return false
    if (f.days.length > 0 && !f.days.includes(weekdayOf(r.service_date))) return false
    return true
  })
}

/* Comparison period */

/** `partial` means the window was truncated at the start of the dataset. */
export type ComparisonRange = DateRange & { partial: boolean }

/**
 * The window of equal length immediately preceding `f.range`, clamped to the
 * dataset start. Returns null when nothing comparable exists, so callers hide
 * the delta instead of rendering a misleading zero.
 */
export function getComparisonRange(f: FilterState, bounds?: { min?: string }): ComparisonRange | null {
  if (f.compare === 'none') return null
  const len = rangeLength(f.range)
  if (len <= 0) return null

  if (f.compare === 'custom') {
    const { start, end } = f.compareRange
    if (!start || !end) return null
    return start > end ? { start: end, end: start, partial: false } : { start, end, partial: false }
  }

  const end = f.compare === 'prev-year' ? shiftYear(f.range.end, -1) : addDays(f.range.start, -1)
  const start = f.compare === 'prev-year' ? shiftYear(f.range.start, -1) : addDays(end, -(len - 1))
  const min = bounds?.min

  if (!min) return { start, end, partial: false }
  if (end < min) return null
  return start < min ? { start: min, end, partial: true } : { start, end, partial: false }
}

export type SplitRows<T> = {
  current: T[]
  /** null when comparison is off or no comparable window exists. */
  comparison: T[] | null
  comparisonRange: ComparisonRange | null
}

/**
 * The standard way a page gets its data: the current window plus the matching
 * comparison window, filtered identically apart from the dates.
 */
export function splitByComparison<T extends FilterableRow>(
  rows: T[],
  f: FilterState,
  bounds?: { min?: string },
): SplitRows<T> {
  const comparisonRange = getComparisonRange(f, bounds)
  return {
    current: applyFilters(rows, f),
    comparison: comparisonRange
      ? applyFilters(rows, { ...f, range: { start: comparisonRange.start, end: comparisonRange.end } })
      : null,
    comparisonRange,
  }
}

/* Chips */

export type FilterChip = { id: string; label: string; value: string }

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function compareLabel(f: FilterState): string {
  switch (f.compare) {
    case 'prev-period': return 'Previous period'
    case 'prev-year': return 'Same dates last year'
    case 'custom':
      return f.compareRange.start && f.compareRange.end
        ? `${f.compareRange.start} to ${f.compareRange.end}`
        : 'Custom dates (not set)'
    default: return 'Off'
  }
}

/** Only non-default filters appear, so an empty chip row means "showing everything". */
export function activeChips(f: FilterState): FilterChip[] {
  const chips: FilterChip[] = []

  if (f.range.start && f.range.end) {
    chips.push({ id: 'range', label: 'Dates', value: `${f.range.start} to ${f.range.end}` })
  }
  if (f.compare !== DEFAULT_FILTERS.compare) {
    chips.push({ id: 'compare', label: 'Compare', value: compareLabel(f) })
  }
  if (f.routes.length > 0) {
    chips.push({
      id: 'routes',
      label: 'Routes',
      value: f.routes.length <= 2 ? f.routes.join(', ') : `${f.routes.length} selected`,
    })
  }
  if (f.directions.length > 0) {
    chips.push({
      id: 'directions',
      label: 'Directions',
      value: f.directions.length <= 1 ? f.directions[0] : `${f.directions.length} selected`,
    })
  }
  if (f.hours[0] > 0 || f.hours[1] < 23) {
    chips.push({
      id: 'hours',
      label: 'Hours',
      value: `${String(f.hours[0]).padStart(2, '0')}:00-${String(f.hours[1]).padStart(2, '0')}:59`,
    })
  }
  if (f.days.length > 0 && f.days.length < 7) {
    chips.push({ id: 'days', label: 'Days', value: [...f.days].sort().map((d) => DAY_NAMES[d]).join(', ') })
  }
  if (f.granularity !== DEFAULT_FILTERS.granularity) {
    chips.push({ id: 'granularity', label: 'Granularity', value: f.granularity })
  }
  if (f.topN !== DEFAULT_FILTERS.topN) {
    chips.push({ id: 'topN', label: 'Show', value: f.topN > 0 ? `Top ${f.topN}` : 'All routes' })
  }
  return chips
}

/** The patch that clears one chip. The date range resets rather than emptying. */
export function clearChip(id: string, fallbackRange: DateRange): Partial<FilterState> {
  switch (id) {
    case 'range': return { range: fallbackRange }
    case 'compare': return { compare: 'none' }
    case 'routes': return { routes: [] }
    case 'directions': return { directions: [] }
    case 'hours': return { hours: [0, 23] }
    case 'days': return { days: [] }
    case 'granularity': return { granularity: DEFAULT_FILTERS.granularity }
    case 'topN': return { topN: DEFAULT_FILTERS.topN }
    default: return {}
  }
}

/* URL serialisation */

const COMPARE_PARAM: Record<CompareMode, string> = {
  none: 'none',
  'prev-period': 'prev',
  'prev-year': 'year',
  custom: 'custom',
}
const COMPARE_MODE: Record<string, CompareMode> = {
  none: 'none',
  prev: 'prev-period',
  year: 'prev-year',
  custom: 'custom',
}

const GRANULARITIES: Granularity[] = ['daily', 'weekly', 'monthly']
const METRICS: MetricKey[] = ['ridership', 'revenue', 'lf']

export function serializeFilters(f: FilterState): string {
  const p = new URLSearchParams()
  if (f.range.start) p.set('start', f.range.start)
  if (f.range.end) p.set('end', f.range.end)
  if (f.compare !== DEFAULT_FILTERS.compare) p.set('cmp', COMPARE_PARAM[f.compare])
  if (f.compare === 'custom' && f.compareRange.start && f.compareRange.end) {
    p.set('cmpStart', f.compareRange.start)
    p.set('cmpEnd', f.compareRange.end)
  }
  if (f.routes.length) p.set('routes', f.routes.join(','))
  if (f.directions.length) p.set('dirs', f.directions.join(','))
  if (f.hours[0] > 0 || f.hours[1] < 23) p.set('hours', `${f.hours[0]}-${f.hours[1]}`)
  if (f.days.length) p.set('days', [...f.days].sort().join(','))
  if (f.granularity !== DEFAULT_FILTERS.granularity) p.set('gran', f.granularity)
  if (f.topN !== DEFAULT_FILTERS.topN) p.set('top', String(f.topN))
  if (f.metric !== DEFAULT_FILTERS.metric) p.set('metric', f.metric)
  if (f.showValues !== DEFAULT_FILTERS.showValues) p.set('vals', f.showValues ? '1' : '0')
  if (f.showAverage !== DEFAULT_FILTERS.showAverage) p.set('avg', f.showAverage ? '1' : '0')
  return p.toString()
}

const csv = (v: string | null): string[] =>
  v ? v.split(',').map((s) => s.trim()).filter(Boolean) : []

const clampHour = (n: number): number => Math.min(23, Math.max(0, n))

/** Unknown keys and malformed values fall back to `base` rather than throwing. */
export function parseFilters(search: string, base: FilterState = DEFAULT_FILTERS): FilterState {
  const p = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const next: FilterState = {
    ...base,
    range: { ...base.range },
    compareRange: { ...base.compareRange },
    routes: [...base.routes],
    directions: [...base.directions],
    hours: [...base.hours] as [number, number],
    days: [...base.days],
  }

  const start = p.get('start')
  const end = p.get('end')
  if (start) next.range.start = start
  if (end) next.range.end = end
  if (next.range.start && next.range.end && next.range.start > next.range.end) {
    next.range = { start: next.range.end, end: next.range.start }
  }

  if (p.has('cmp')) next.compare = COMPARE_MODE[p.get('cmp') ?? ''] ?? 'none'
  const cmpStart = p.get('cmpStart')
  const cmpEnd = p.get('cmpEnd')
  if (cmpStart && cmpEnd) {
    next.compareRange = cmpStart > cmpEnd
      ? { start: cmpEnd, end: cmpStart }
      : { start: cmpStart, end: cmpEnd }
  }
  if (p.has('routes')) next.routes = csv(p.get('routes'))
  if (p.has('dirs')) next.directions = csv(p.get('dirs'))

  const hours = p.get('hours')
  if (hours) {
    const [a, b] = hours.split('-').map((n) => Number.parseInt(n, 10))
    if (Number.isFinite(a) && Number.isFinite(b)) {
      next.hours = [clampHour(Math.min(a, b)), clampHour(Math.max(a, b))]
    }
  }

  if (p.has('days')) {
    next.days = csv(p.get('days'))
      .map((d) => Number.parseInt(d, 10))
      .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
  }

  const gran = p.get('gran') as Granularity | null
  if (gran && GRANULARITIES.includes(gran)) next.granularity = gran

  const top = p.get('top')
  if (top != null) {
    const n = Number.parseInt(top, 10)
    if (Number.isInteger(n) && n >= 0) next.topN = n
  }

  const metric = p.get('metric') as MetricKey | null
  if (metric && METRICS.includes(metric)) next.metric = metric

  if (p.has('vals')) next.showValues = p.get('vals') === '1'
  if (p.has('avg')) next.showAverage = p.get('avg') === '1'

  return next
}

/* Hash routing: page + filters in one shareable URL */

export type HashState = { page: string; filters: FilterState }

export function parseHash(hash: string, base: FilterState = DEFAULT_FILTERS, fallbackPage = 'overview'): HashState {
  const raw = hash.replace(/^#\/?/, '')
  const qIdx = raw.indexOf('?')
  const page = (qIdx === -1 ? raw : raw.slice(0, qIdx)) || fallbackPage
  const search = qIdx === -1 ? '' : raw.slice(qIdx + 1)
  return { page, filters: parseFilters(search, base) }
}

export function buildHash(page: string, f: FilterState): string {
  const qs = serializeFilters(f)
  return `#/${page}${qs ? `?${qs}` : ''}`
}

/**
 * Keeps page + filters in the URL hash so a view can be shared or refreshed.
 * Filter tweaks use replaceState so they do not flood the back button; page
 * changes push, so Back returns to the previous page.
 */
export function useUrlFilters(initial: FilterState, initialPage = 'overview') {
  const [state, setState] = useState<HashState>(() =>
    typeof window === 'undefined'
      ? { page: initialPage, filters: initial }
      : parseHash(window.location.hash, initial, initialPage),
  )

  useEffect(() => {
    if (typeof window === 'undefined') return
    const onHash = () => setState((prev) => parseHash(window.location.hash, prev.filters, prev.page))
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const write = useCallback((next: HashState, push: boolean) => {
    if (typeof window === 'undefined') return
    const url = `${window.location.pathname}${window.location.search}${buildHash(next.page, next.filters)}`
    if (push) window.history.pushState(null, '', url)
    else window.history.replaceState(null, '', url)
  }, [])

  const setFilters = useCallback(
    (patch: Partial<FilterState>) => {
      setState((prev) => {
        const next = { page: prev.page, filters: { ...prev.filters, ...patch } }
        write(next, false)
        return next
      })
    },
    [write],
  )

  const setPage = useCallback(
    (page: string) => {
      setState((prev) => {
        const next = { page, filters: prev.filters }
        write(next, true)
        return next
      })
    },
    [write],
  )

  const reset = useCallback(
    (range: DateRange) => {
      setState((prev) => {
        const next = { page: prev.page, filters: { ...DEFAULT_FILTERS, range } }
        write(next, false)
        return next
      })
    },
    [write],
  )

  return { page: state.page, filters: state.filters, setPage, setFilters, reset }
}
