import { useMemo, useState } from 'react'
import { addDays, parseISO, toISO } from '../../lib/filters'
import type { CompareMode, DateRange } from '../../lib/filters'
import { usePopover } from './usePopover'

export interface DateRangePickerProps {
  value: DateRange
  onChange: (r: DateRange) => void
  min: string
  max: string
  /** Dates that actually have data; others render dimmed. */
  availableDates?: string[]
  presets?: boolean
  compare?: CompareMode
  onCompareChange?: (c: CompareMode) => void
  /** Only used when compare === 'custom'. */
  compareRange?: DateRange
  onCompareRangeChange?: (r: DateRange) => void
  /** Human-readable window the comparison resolves to, e.g. "02 Mar - 31 Mar". */
  comparePreview?: string
  className?: string
}

const COMPARE_OPTIONS: { id: CompareMode; label: string }[] = [
  { id: 'none', label: 'No comparison' },
  { id: 'prev-period', label: 'Previous period' },
  { id: 'prev-year', label: 'Same dates last year' },
  { id: 'custom', label: 'Custom dates' },
]

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const firstOfMonth = (iso: string): string => `${iso.slice(0, 7)}-01`

function addMonths(iso: string, n: number): string {
  const d = new Date(parseISO(firstOfMonth(iso)))
  d.setUTCMonth(d.getUTCMonth() + n)
  return toISO(d.getTime())
}

function monthGrid(monthStart: string): (string | null)[] {
  const start = new Date(parseISO(monthStart))
  const lead = start.getUTCDay()
  const daysInMonth = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate()
  const cells: (string | null)[] = Array.from({ length: lead }, () => null)
  for (let d = 0; d < daysInMonth; d++) cells.push(addDays(monthStart, d))
  return cells
}

const dayLabel = (iso: string): string => {
  const d = new Date(parseISO(iso))
  return `${String(d.getUTCDate()).padStart(2, '0')} ${MONTH_NAMES[d.getUTCMonth()]}`
}

/** "01 Apr - 30 Apr 2026 (30 days)" reads faster than two ISO strings. */
const rangeLabel = (r: DateRange): string => {
  if (!r.start || !r.end) return 'Select dates'
  const days = Math.round((parseISO(r.end) - parseISO(r.start)) / 86400000) + 1
  const year = new Date(parseISO(r.end)).getUTCFullYear()
  return `${dayLabel(r.start)} \u2013 ${dayLabel(r.end)} ${year} (${days} ${days === 1 ? 'day' : 'days'})`
}

const monthLabel = (iso: string): string => {
  const d = new Date(parseISO(iso))
  return `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

/**
 * Presets are anchored to the dataset end, not to today: this dashboard shows
 * historical months, so "Last 7 days" must mean the last 7 days of data.
 */
function buildPresets(min: string, max: string): { id: string; label: string; range: DateRange }[] {
  const monthStart = firstOfMonth(max)
  const prevMonthStart = addMonths(monthStart, -1)
  const prevMonthEnd = addDays(monthStart, -1)
  const clamp = (iso: string) => (iso < min ? min : iso)

  return [
    { id: 'last7', label: 'Last 7 days', range: { start: clamp(addDays(max, -6)), end: max } },
    { id: 'last14', label: 'Last 14 days', range: { start: clamp(addDays(max, -13)), end: max } },
    { id: 'last30', label: 'Last 30 days', range: { start: clamp(addDays(max, -29)), end: max } },
    { id: 'thisMonth', label: monthLabel(max), range: { start: clamp(monthStart), end: max } },
    ...(prevMonthEnd >= min
      ? [{ id: 'prevMonth', label: monthLabel(prevMonthStart), range: { start: clamp(prevMonthStart), end: prevMonthEnd } }]
      : []),
    { id: 'all', label: 'All data', range: { start: min, end: max } },
  ]
}

export function DateRangePicker({
  value,
  onChange,
  min,
  max,
  availableDates,
  presets = true,
  compare,
  onCompareChange,
  compareRange,
  onCompareRangeChange,
  comparePreview,
  className,
}: DateRangePickerProps) {
  const { open, setOpen, rootRef, triggerRef } = usePopover()
  const [viewMonth, setViewMonth] = useState(() => firstOfMonth(value.start || max))
  const [draftStart, setDraftStart] = useState<string | null>(null)

  const available = useMemo(() => (availableDates ? new Set(availableDates) : null), [availableDates])
  const presetList = useMemo(() => (presets ? buildPresets(min, max) : []), [presets, min, max])
  const months = useMemo(() => [viewMonth, addMonths(viewMonth, 1)], [viewMonth])

  const pick = (iso: string) => {
    if (draftStart == null) {
      setDraftStart(iso)
      return
    }
    const range = iso < draftStart ? { start: iso, end: draftStart } : { start: draftStart, end: iso }
    setDraftStart(null)
    onChange(range)
    setOpen(false)
  }

  const inSelection = (iso: string) => {
    if (draftStart != null) return iso === draftStart
    return iso >= value.start && iso <= value.end
  }

  const canPrev = viewMonth > firstOfMonth(min)
  const canNext = addMonths(viewMonth, 1) < firstOfMonth(max)

  return (
    <div className={['ui-field', className].filter(Boolean).join(' ')} ref={rootRef}>
      <span className="ui-field-label">Date range</span>
      <div className="ui-popover-anchor">
        <button
          type="button"
          ref={triggerRef}
          className={`ui-select ui-select-trigger${open ? ' is-open' : ''}`}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <span className="ui-select-value">{rangeLabel(value)}</span>
          {compare === 'prev-period' && <span className="ui-compare-flag">vs prev</span>}
          {compare === 'prev-year' && <span className="ui-compare-flag">vs last year</span>}
          {compare === 'custom' && <span className="ui-compare-flag">vs custom</span>}
          <span className="ui-select-caret" aria-hidden="true" />
        </button>

        {open && (
          <div className="ui-popover ui-daterange" role="dialog" aria-label="Choose a date range">
            {presetList.length > 0 && (
              <div className="ui-daterange-presets">
                {presetList.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`ui-preset${value.start === p.range.start && value.end === p.range.end ? ' is-active' : ''}`}
                    onClick={() => {
                      setDraftStart(null)
                      onChange(p.range)
                      setViewMonth(firstOfMonth(p.range.start))
                      setOpen(false)
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            )}

            <div className="ui-daterange-body">
              <div className="ui-daterange-nav">
                <button
                  type="button"
                  className="ui-icon-btn"
                  aria-label="Previous month"
                  disabled={!canPrev}
                  onClick={() => setViewMonth(addMonths(viewMonth, -1))}
                >
                  {'\u2039'}
                </button>
                <span className="ui-daterange-hint">
                  {draftStart ? `Start ${draftStart} \u2014 pick the end date` : 'Pick a start date'}
                </span>
                <button
                  type="button"
                  className="ui-icon-btn"
                  aria-label="Next month"
                  disabled={!canNext}
                  onClick={() => setViewMonth(addMonths(viewMonth, 1))}
                >
                  {'\u203A'}
                </button>
              </div>

              <div className="ui-daterange-months">
                {months.map((m) => (
                  <div key={m} className="ui-month">
                    <div className="ui-month-title">{monthLabel(m)}</div>
                    <div className="ui-month-grid">
                      {WEEKDAYS.map((w, i) => (
                        <span key={`${w}${i}`} className="ui-month-weekday">{w}</span>
                      ))}
                      {monthGrid(m).map((iso, i) => {
                        if (!iso) return <span key={`pad${i}`} className="ui-day is-pad" />
                        const disabled = iso < min || iso > max
                        const hasData = !available || available.has(iso)
                        const selected = inSelection(iso)
                        const isEdge = iso === value.start || iso === value.end || iso === draftStart
                        return (
                          <button
                            key={iso}
                            type="button"
                            disabled={disabled}
                            aria-pressed={selected}
                            title={hasData ? iso : `${iso} (no data)`}
                            className={[
                              'ui-day',
                              selected ? 'is-selected' : '',
                              isEdge ? 'is-edge' : '',
                              !hasData ? 'is-nodata' : '',
                            ].filter(Boolean).join(' ')}
                            onClick={() => pick(iso)}
                          >
                            {Number(iso.slice(8, 10))}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {onCompareChange && (
                <div className="ui-daterange-compare">
                  <div className="ui-daterange-compare-head">
                    <span className="ui-field-label">Compare against</span>
                    <div className="ui-compare-options" role="group" aria-label="Comparison period">
                      {COMPARE_OPTIONS.map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          className={`ui-preset${compare === opt.id ? ' is-active' : ''}`}
                          aria-pressed={compare === opt.id}
                          onClick={() => {
                            if (opt.id === 'custom' && onCompareRangeChange && !compareRange?.start) {
                              // Seed the fields with the window immediately before
                              // the selection so they are never empty on open.
                              const len = Math.round((parseISO(value.end) - parseISO(value.start)) / 86400000)
                              const end = addDays(value.start, -1)
                              onCompareRangeChange({ start: addDays(end, -len), end })
                            }
                            onCompareChange(opt.id)
                          }}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {compare === 'custom' && onCompareRangeChange && (
                    <div className="ui-compare-custom">
                      <label className="ui-compare-field">
                        <span className="ui-field-label">Comparison start</span>
                        <input
                          type="date"
                          className="ui-input"
                          value={compareRange?.start ?? ''}
                          min={min}
                          max={max}
                          onChange={(e) =>
                            onCompareRangeChange({
                              start: e.target.value,
                              end: compareRange?.end ?? e.target.value,
                            })
                          }
                        />
                      </label>
                      <label className="ui-compare-field">
                        <span className="ui-field-label">Comparison end</span>
                        <input
                          type="date"
                          className="ui-input"
                          value={compareRange?.end ?? ''}
                          min={min}
                          max={max}
                          onChange={(e) =>
                            onCompareRangeChange({
                              start: compareRange?.start ?? e.target.value,
                              end: e.target.value,
                            })
                          }
                        />
                      </label>
                    </div>
                  )}

                  <p className="ui-daterange-compare-note">
                    {compare === 'none'
                      ? 'Turn on to show change against an earlier window.'
                      : comparePreview
                        ? `Deltas measured against ${comparePreview}.`
                        : compare === 'custom'
                          ? 'Pick both comparison dates to show deltas.'
                          : 'No comparable window exists in this dataset.'}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
