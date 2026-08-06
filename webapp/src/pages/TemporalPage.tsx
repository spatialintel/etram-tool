import { useMemo, useState } from 'react'
import type { EChartsOption } from 'echarts'
import {
  Chart,
  bandLineOption,
  categoryAxis,
  demandSupplyOption,
  heatmapMatrixOption,
  markAvg,
  toolboxDefaults,
  tooltipUnits,
  valueAxis,
} from '../components/Chart'
import {
  BreakdownDrawer,
  BreakdownTable,
  Card,
  CheckboxGroup,
  EmptyState,
  RangeSlider,
  SegmentedControl,
  StatCard,
} from '../components/ui'
import { aggregateHours } from '../lib/aggregate'
import { applyFilters, weekdayOf } from '../lib/filters'
import type { FilterState } from '../lib/filters'
import { fmtInt, fmtMoney, fmtPct } from '../lib/format'
import { usePrefs } from '../lib/prefs'
import { percentile } from '../lib/stats'
import type { DashboardData, SlotSummaryRow, TemporalRow } from '../types'

type Gran = 'hourly' | 'slot'

const DAY_OPTIONS = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 0, label: 'Sun' },
]

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]
const DAY_LABEL: Record<number, string> = Object.fromEntries(DAY_OPTIONS.map((d) => [d.value, d.label]))

const hourLabel = (h: number) => `${String(h).padStart(2, '0')}:00`

function slotSortKey(label: string): number {
  const m = /^(\d{1,2}):(\d{2})/.exec(label)
  if (!m) return 0
  return Number(m[1]) * 60 + Number(m[2])
}

function headwayFrom(hours: number[], trips: number, days: number): number | null {
  if (hours.length < 2 || trips <= 0 || days <= 0) return null
  const span = (Math.max(...hours) - Math.min(...hours)) * 60
  const departuresPerDay = trips / days
  if (departuresPerDay < 2) return null
  return Math.round(span / (departuresPerDay - 1))
}

export function TemporalPage({
  data,
  filters,
  onFilterChange,
}: {
  data: DashboardData
  filters: FilterState
  onFilterChange: (patch: Partial<FilterState>) => void
}) {
  const [prefs] = usePrefs()
  const [gran, setGran] = useState<Gran>('hourly')
  const [drill, setDrill] = useState<'supply' | 'profile' | 'headway' | null>(null)
  const isV2 = (data.meta?.schema_version ?? 1) >= 2
  const headwayTarget = prefs.targets.headwayMins

  const temporalRows = useMemo(
    () => applyFilters(data.temporal, filters) as TemporalRow[],
    [data.temporal, filters],
  )
  const rows = useMemo(() => aggregateHours(temporalRows), [temporalRows])

  const totR = rows.reduce((s, r) => s + r.ridership, 0)
  const totRev = rows.reduce((s, r) => s + r.revenue, 0)
  const totTrips = rows.reduce((s, r) => s + r.trips, 0)
  const daysInView = rows.reduce((m, r) => Math.max(m, r.days), 0)
  const peak = rows.length > 0 ? rows.reduce((m, r) => (r.ridership > m.ridership ? r : m), rows[0]) : null

  const peakHours = useMemo(() => {
    if (rows.length === 0) return new Set<number>()
    const threshold = percentile(rows.map((r) => r.ridership), 75)
    return new Set(rows.filter((r) => r.ridership >= threshold).map((r) => r.hour))
  }, [rows])

  const peakShare = useMemo(() => {
    if (totR <= 0) return null
    const peakR = rows.filter((r) => peakHours.has(r.hour)).reduce((s, r) => s + r.ridership, 0)
    return peakR / totR
  }, [rows, peakHours, totR])

  const peakHeadway = useMemo(() => {
    const peakRows = rows.filter((r) => peakHours.has(r.hour))
    const offRows = rows.filter((r) => !peakHours.has(r.hour))
    return {
      peak: headwayFrom(
        peakRows.map((r) => r.hour),
        peakRows.reduce((s, r) => s + r.trips, 0),
        daysInView,
      ),
      off: headwayFrom(
        offRows.map((r) => r.hour),
        offRows.reduce((s, r) => s + r.trips, 0),
        daysInView,
      ),
    }
  }, [rows, peakHours, daysInView])

  /** CV of trips across peak hours — higher means more uneven frequency (bunching proxy). */
  const peakBunchingCv = useMemo(() => {
    const peakTrips = rows.filter((r) => peakHours.has(r.hour)).map((r) => r.trips)
    if (peakTrips.length < 2) return null
    const mean = peakTrips.reduce((a, b) => a + b, 0) / peakTrips.length
    if (mean <= 0) return null
    const sd = Math.sqrt(peakTrips.reduce((a, b) => a + (b - mean) ** 2, 0) / peakTrips.length)
    return sd / mean
  }, [rows, peakHours])

  const weekdayHeat = useMemo((): EChartsOption => {
    const [h0, h1] = filters.hours
    const hours = Array.from({ length: h1 - h0 + 1 }, (_, i) => h0 + i)
    const yDays = DAY_ORDER.filter((d) => filters.days.length === 0 || filters.days.includes(d))
    const grid = new Map<string, number>()
    for (const r of temporalRows) {
      const wd = weekdayOf(r.service_date)
      if (r.start_hour < h0 || r.start_hour > h1) continue
      if (filters.days.length > 0 && !filters.days.includes(wd)) continue
      const key = `${r.start_hour}|${wd}`
      grid.set(key, (grid.get(key) || 0) + (r.ridership || 0))
    }
    const cells: [number, number, number][] = []
    hours.forEach((h, xi) => {
      yDays.forEach((d, yi) => {
        cells.push([xi, yi, grid.get(`${h}|${d}`) || 0])
      })
    })
    return {
      ...toolboxDefaults('temporal-hour-weekday'),
      ...heatmapMatrixOption(hours.map(hourLabel), yDays.map((d) => DAY_LABEL[d]), cells),
    }
  }, [temporalRows, filters.hours, filters.days])

  const routeHeat = useMemo((): EChartsOption => {
    const [h0, h1] = filters.hours
    const hours = Array.from({ length: h1 - h0 + 1 }, (_, i) => h0 + i)
    const routeTotals = new Map<string, number>()
    for (const r of temporalRows) {
      routeTotals.set(r.route_code, (routeTotals.get(r.route_code) || 0) + (r.ridership || 0))
    }
    const routes = (filters.routes.length > 0
      ? filters.routes
      : [...routeTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([c]) => c)
    ).filter((c) => routeTotals.has(c) || filters.routes.includes(c))

    const grid = new Map<string, number>()
    for (const r of temporalRows) {
      if (r.start_hour < h0 || r.start_hour > h1) continue
      if (!routes.includes(r.route_code)) continue
      const key = `${r.start_hour}|${r.route_code}`
      grid.set(key, (grid.get(key) || 0) + (r.ridership || 0))
    }
    const cells: [number, number, number][] = []
    hours.forEach((h, xi) => {
      routes.forEach((rc, yi) => {
        cells.push([xi, yi, grid.get(`${h}|${rc}`) || 0])
      })
    })
    return {
      ...toolboxDefaults('temporal-hour-route'),
      ...heatmapMatrixOption(hours.map(hourLabel), routes, cells),
    }
  }, [temporalRows, filters.hours, filters.routes])

  const slotBars = useMemo(() => {
    if (!data.slot_summary?.length) return [] as { label: string; ridership: number; trips: number; revenue: number }[]
    const filtered = applyFilters(data.slot_summary as SlotSummaryRow[], filters)
    const map = new Map<string, { ridership: number; trips: number; revenue: number }>()
    for (const r of filtered) {
      const e = map.get(r.time_slot_label) || { ridership: 0, trips: 0, revenue: 0 }
      e.ridership += r.ridership || 0
      e.trips += r.trips || 0
      e.revenue += r.revenue || 0
      map.set(r.time_slot_label, e)
    }
    return [...map.entries()]
      .map(([label, v]) => ({ label, ...v }))
      .sort((a, b) => slotSortKey(a.label) - slotSortKey(b.label))
  }, [data.slot_summary, filters])

  const barOpt = (values: number[], labels: string[], name: string, color: string, yName: string, unit: string): EChartsOption => ({
    ...toolboxDefaults(`temporal-${name.toLowerCase()}`),
    legend: { show: false },
    tooltip: tooltipUnits({ [name]: unit }),
    xAxis: {
      ...categoryAxis(gran === 'slot' ? 'Time slot' : 'Hour of day'),
      data: labels,
      axisLabel: { color: '#6b7280', rotate: 45, hideOverlap: true },
    },
    yAxis: valueAxis(yName),
    series: [{
      name,
      type: 'bar',
      data: values,
      itemStyle: { color },
      barMaxWidth: 28,
      ...(filters.showAverage ? markAvg() : {}),
    }],
  })

  /**
   * Headway per hour on each individual day, then the median and the spread.
   * A single average hides the days when the gap doubles, which is exactly
   * what passengers notice.
   */
  const headwayOpt = useMemo((): EChartsOption => {
    const byHour = new Map<number, Map<string, number>>()
    for (const r of temporalRows) {
      const inner = byHour.get(r.start_hour) ?? new Map<string, number>()
      inner.set(r.service_date, (inner.get(r.service_date) ?? 0) + (r.trips || 0))
      byHour.set(r.start_hour, inner)
    }

    const median: (number | null)[] = []
    const low: (number | null)[] = []
    const high: (number | null)[] = []
    for (const r of rows) {
      const perDay = [...(byHour.get(r.hour)?.values() ?? [])]
        .filter((t) => t > 0)
        .map((t) => 60 / t)
      if (perDay.length === 0) {
        median.push(null)
        low.push(null)
        high.push(null)
        continue
      }
      median.push(Number(percentile(perDay, 50).toFixed(1)))
      low.push(Number(Math.min(...perDay).toFixed(1)))
      high.push(Number(Math.max(...perDay).toFixed(1)))
    }

    return {
      ...toolboxDefaults('temporal-headway'),
      ...bandLineOption({
        labels: rows.map((r) => r.label),
        median,
        low,
        high,
        target: headwayTarget,
        yName: 'Minutes between trips',
        unit: 'min',
        seriesName: 'Median headway',
      }),
    }
  }, [rows, temporalRows, headwayTarget])

  const demandSupplyOpt = useMemo(
    (): EChartsOption => ({
      ...toolboxDefaults('temporal-demand-supply'),
      ...demandSupplyOption({
        labels: gran === 'hourly' ? rows.map((r) => r.label) : slotBars.map((s) => s.label),
        demand: gran === 'hourly' ? rows.map((r) => r.ridership) : slotBars.map((s) => s.ridership),
        supply: gran === 'hourly' ? rows.map((r) => r.trips) : slotBars.map((s) => s.trips),
        demandName: 'Passengers',
        supplyName: 'Trips operated',
        supplyUnit: 'trips',
      }),
    }),
    [gran, rows, slotBars],
  )

  /** Hours where demand share clearly exceeds the share of trips laid on. */
  const supplyGaps = useMemo(() => {
    const totalR = rows.reduce((s, r) => s + r.ridership, 0)
    const totalT = rows.reduce((s, r) => s + r.trips, 0)
    if (totalR <= 0 || totalT <= 0) return []
    return rows
      .map((r) => ({
        label: r.label,
        ridership: r.ridership,
        trips: r.trips,
        demandShare: r.ridership / totalR,
        supplyShare: r.trips / totalT,
        gap: r.ridership / totalR - r.trips / totalT,
      }))
      .filter((r) => r.gap > 0.01)
      .sort((a, b) => b.gap - a.gap)
  }, [rows])

  const periodLabel = `${filters.range.start} to ${filters.range.end} \u00B7 ${daysInView} day${daysInView === 1 ? '' : 's'}`
  const chartLabels = gran === 'hourly' ? rows.map((r) => r.label) : slotBars.map((s) => s.label)
  const ridershipVals = gran === 'hourly' ? rows.map((r) => r.ridership) : slotBars.map((s) => s.ridership)
  const emptyHourly = rows.length === 0
  const emptySlot = gran === 'slot' && slotBars.length === 0

  return (
    <div className="page">
      <Card title="Time window" subtitle="Applies to every chart on this page">
        <div className="temporal-controls">
          <RangeSlider
            label="Hours"
            value={filters.hours}
            min={0}
            max={23}
            onChange={(hours) => onFilterChange({ hours })}
            format={hourLabel}
          />
          <CheckboxGroup
            label="Days of week"
            values={filters.days}
            options={DAY_OPTIONS}
            onChange={(days) => onFilterChange({ days })}
            variant="chips"
          />
          <div className="ui-field">
            <span className="ui-field-label">Granularity</span>
            <SegmentedControl
              value={gran}
              options={[
                { value: 'hourly', label: 'Hourly' },
                { value: 'slot', label: '30-min' },
              ]}
              onChange={setGran}
              ariaLabel="Temporal granularity"
            />
          </div>
        </div>
      </Card>

      <div className="temporal-kpi-groups">
        <section aria-labelledby="temporal-demand-kpis">
          <h2 id="temporal-demand-kpis" className="section-label">Demand summary</h2>
          <div className="kpi-grid">
            <StatCard
              label="Ridership"
              value={fmtInt(totR)}
              sub={periodLabel}
              definitionKey="ridership"
              onClick={() => setDrill('profile')}
              drillLabel="Hourly profile"
            />
            <StatCard
              label="Revenue"
              value={fmtMoney(totRev, { compact: totRev >= 1e5 })}
              sub={periodLabel}
              definitionKey="revenue"
              onClick={() => setDrill('profile')}
              drillLabel="Hourly profile"
            />
            <StatCard
              label="Peak hour"
              value={peak ? peak.label : '\u2014'}
              sub={peak ? `${fmtInt(peak.ridership)} passengers` : undefined}
              onClick={() => setDrill('profile')}
              drillLabel="Peak detail"
            />
            <StatCard
              label="Peak-period share"
              value={peakShare != null ? fmtPct(peakShare) : '\u2014'}
              sub={`Top-quartile demand hours (${peakHours.size})`}
              onClick={() => setDrill('profile')}
              drillLabel="Peak detail"
            />
          </div>
        </section>

        <section aria-labelledby="temporal-supply-kpis">
          <h2 id="temporal-supply-kpis" className="section-label">Service reliability summary</h2>
          <div className="kpi-grid kpi-grid--3">
            <StatCard
              label="Peak headway"
              value={peakHeadway.peak != null ? `${peakHeadway.peak} min` : '\u2014'}
              sub={peakHeadway.off != null ? `Off-peak ${peakHeadway.off} min` : undefined}
              definitionKey="headway"
              target={
                peakHeadway.peak != null
                  ? {
                      value: headwayTarget,
                      current: peakHeadway.peak,
                      label: `Target at most ${headwayTarget} min`,
                      direction: 'lower',
                    }
                  : undefined
              }
              onClick={() => setDrill('headway')}
              drillLabel="Reliability detail"
            />
            <StatCard
              label="Bunching proxy"
              value={peakBunchingCv != null ? peakBunchingCv.toFixed(2) : '\u2014'}
              sub="Peak trip variation · below 0.20 even; above 0.40 bunched"
              onClick={() => setDrill('headway')}
              drillLabel="Reliability detail"
            />
            <StatCard
              label="Trips operated"
              value={fmtInt(totTrips)}
              sub={`${rows.length} active hours · ${periodLabel}`}
              onClick={() => setDrill('supply')}
              drillLabel="Supply detail"
            />
          </div>
        </section>
      </div>

      {gran === 'slot' && !isV2 && (
        <EmptyState title="30-min slots need schema v2">
          Re-run the data export to enable slot_summary.
        </EmptyState>
      )}

      {emptyHourly && gran === 'hourly' ? (
        <div className="empty-state">No hourly data for the selected filters.</div>
      ) : emptySlot ? (
        <div className="empty-state">No 30-min slot data for the selected filters.</div>
      ) : (
        <>
          <Card
            title="Demand against service supplied"
            subtitle={`${periodLabel}. The green area is passengers carried and the dashed amber line is trips operated.`}
            onDrill={() => setDrill('supply')}
            drillLabel="Where supply lags"
          >
            <Chart option={demandSupplyOpt} height={360} group="temporal" />
          </Card>
          <Card
            title={gran === 'hourly' ? 'Passengers by hour' : 'Passengers by 30-min slot'}
            subtitle="Absolute volume, for sizing individual departures"
            onDrill={() => setDrill('profile')}
          >
            <Chart
              option={barOpt(ridershipVals, chartLabels, 'Ridership', '#1B7A4E', 'Ridership (pax)', 'pax')}
              height={300}
              group="temporal"
            />
          </Card>
        </>
      )}

      {gran === 'hourly' && !emptyHourly && (
        <>
          <Card title="Hour by weekday" subtitle="Ridership heatmap, darker means busier">
            <Chart option={weekdayHeat} height={320} group="temporal" />
          </Card>
          <Card
            title="Hour by route"
            subtitle={filters.routes.length > 0 ? 'Selected routes' : 'Top 8 routes by ridership'}
          >
            <Chart option={routeHeat} height={360} group="temporal" />
          </Card>
          <Card
            title="Headway reliability by hour"
            subtitle={`Median gap between trips with the day-to-day range \u00B7 target ${headwayTarget} min`}
            onDrill={() => setDrill('headway')}
          >
            <Chart option={headwayOpt} height={300} group="temporal" />
          </Card>
        </>
      )}

      <BreakdownDrawer
        open={drill === 'supply' || drill === 'profile'}
        onClose={() => setDrill(null)}
        title="Demand and supply by hour"
        subtitle={periodLabel}
        width={620}
        stats={[
          { label: 'Peak hour', value: peak?.label ?? '\u2014', hint: peak ? `${fmtInt(peak.ridership)} passengers` : undefined },
          { label: 'Peak share', value: peakShare != null ? fmtPct(peakShare) : '\u2014', hint: `${peakHours.size} top-quartile hours` },
          { label: 'Hours under-supplied', value: String(supplyGaps.length), hint: 'Demand share above trip share' },
        ]}
        note={
          supplyGaps.length > 0
            ? `${supplyGaps[0].label} carries ${fmtPct(supplyGaps[0].demandShare)} of the day's passengers on ${fmtPct(supplyGaps[0].supplyShare)} of its trips. Adding departures here costs less than adding a route.`
            : 'Trips track demand closely across the day; no hour stands out as under-supplied.'
        }
      >
        <BreakdownTable
          caption="Hours where demand outpaces supply"
          columns={[
            { key: 'hour', label: 'Hour' },
            { key: 'pax', label: 'Passengers', align: 'right' },
            { key: 'trips', label: 'Trips', align: 'right' },
            { key: 'demand', label: 'Demand share', align: 'right' },
            { key: 'supply', label: 'Trip share', align: 'right' },
          ]}
          rows={supplyGaps.slice(0, 10).map((r) => ({
            __key: r.label,
            hour: r.label,
            pax: fmtInt(r.ridership),
            trips: fmtInt(r.trips),
            demand: fmtPct(r.demandShare),
            supply: fmtPct(r.supplyShare),
          }))}
        />
      </BreakdownDrawer>

      <BreakdownDrawer
        open={drill === 'headway'}
        onClose={() => setDrill(null)}
        title="Headway reliability"
        subtitle="Median gap between trips, and how much it varies day to day"
        width={560}
        stats={[
          { label: 'Peak headway', value: peakHeadway.peak != null ? `${peakHeadway.peak} min` : '\u2014' },
          { label: 'Off-peak headway', value: peakHeadway.off != null ? `${peakHeadway.off} min` : '\u2014' },
          { label: 'Target', value: `${headwayTarget} min` },
          {
            label: 'Bunching proxy',
            value: peakBunchingCv != null ? peakBunchingCv.toFixed(2) : '\u2014',
            hint: 'Variation in trips across peak hours',
          },
        ]}
        note="A wide band means the same hour is served unevenly on different days. That is a rostering and dispatch problem, not a timetable problem: fix it before shortening the published headway."
      />
    </div>
  )
}