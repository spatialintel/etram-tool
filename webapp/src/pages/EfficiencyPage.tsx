import { useMemo, useState } from 'react'
import type { EChartsOption } from 'echarts'
import {
  Chart,
  bulletOption,
  categoryAxis,
  markAvg,
  normalizedMatrixOption,
  toolboxDefaults,
  tooltipUnits,
  valueAxis,
} from '../components/Chart'
import { BreakdownDrawer, Card, DataTable, EmptyState, StatCard } from '../components/ui'
import type { ThresholdTone } from '../components/ui'
import { aggregateRoutes, periodKpisFromDaily, periodTotals } from '../lib/aggregate'
import type { RouteAgg } from '../lib/aggregate'
import { applyFilters, splitByComparison } from '../lib/filters'
import type { FilterState } from '../lib/filters'
import { fmtDateWithWeekday, fmtDelta, fmtInt, fmtKm, fmtMoney, fmtPct } from '../lib/format'
import type { DashboardData, KpiDailyRow, TripDistributionBin } from '../types'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// MoHUA ESCBS city-bus planning (CEPT): 0.7 cited as the utilisation standard
// for urban services. MoHUA SLB 2012 comfort is passengers/seat, a different
// measure, so those LoS bands are not applied to this LF.
const LF_TARGET_PCT = 70
const LF_BANDS_PCT: { to: number; color: string }[] = [
  { to: 30, color: '#FEE2E2' }, // poor  (< 0.30)
  { to: 70, color: '#FEF3C7' }, // fair  (0.30 - 0.70)
  { to: 100, color: '#E8F7EF' }, // good (>= 0.70)
]

function lfTone(lf: number): ThresholdTone {
  if (lf < 0.3) return 'bad'
  if (lf < 0.7) return 'warn'
  return 'good'
}

/** "2026-04-07" reads as "07 Apr" on a dense daily axis. */
function shortDate(iso: string): string {
  if (!iso || iso.length < 10) return iso
  return `${iso.slice(8, 10)} ${MONTHS[Number(iso.slice(5, 7)) - 1] ?? ''}`.trim()
}

type SeriesStats = {
  avg: number
  min: { value: number; date: string }
  max: { value: number; date: string }
  last: { value: number; date: string }
  n: number
} | null

function seriesStats(dates: string[], values: (number | null)[]): SeriesStats {
  const pairs = values
    .map((v, i) => ({ value: v, date: dates[i] ?? '' }))
    .filter((p): p is { value: number; date: string } => typeof p.value === 'number' && Number.isFinite(p.value))
  if (pairs.length === 0) return null
  const avg = pairs.reduce((a, p) => a + p.value, 0) / pairs.length
  const min = pairs.reduce((m, p) => (p.value < m.value ? p : m), pairs[0])
  const max = pairs.reduce((m, p) => (p.value > m.value ? p : m), pairs[0])
  return { avg, min, max, last: pairs[pairs.length - 1], n: pairs.length }
}

/**
 * A daily KPI panel: the line, period average, and best/worst days.
 */
function trendOpt(opts: {
  dates: string[]
  values: (number | null)[]
  name: string
  color: string
  unit: string
  format: (v: number) => string
  showAvg: boolean
}): EChartsOption {
  const { dates, values, name, color, unit, format, showAvg } = opts
  return {
    legend: { show: false },
    tooltip: tooltipUnits({ [name]: unit }),
    grid: { left: 52, right: 20, top: 26, bottom: 34, containLabel: true },
    xAxis: {
      ...categoryAxis(),
      data: dates.map(shortDate),
      axisLabel: { color: '#6b7280', fontSize: 10, hideOverlap: true, interval: 'auto' },
      axisLine: { lineStyle: { color: '#dde1ea' } },
    },
    yAxis: {
      ...valueAxis(),
      axisLabel: { color: '#6b7280', fontSize: 10, formatter: (v: number) => format(v) },
      splitNumber: 3,
    },
    series: [
      {
        name,
        type: 'line',
        data: values,
        connectNulls: false,
        areaStyle: { color: `${color}1F` },
        itemStyle: { color },
        lineStyle: { width: 2 },
        showSymbol: false,
        smooth: true,
        markPoint: {
          symbol: 'circle',
          symbolSize: 7,
          itemStyle: { color },
          data: [
            { type: 'max', name: 'Best day' },
            { type: 'min', name: 'Worst day' },
          ],
          label: {
            show: true,
            position: 'top',
            distance: 6,
            fontSize: 10,
            color: '#374151',
            formatter: (p: { value?: unknown }) => format(Number(p.value ?? 0)),
          },
        },
        ...(showAvg ? markAvg() : {}),
      },
    ],
  }
}

function histOpt(bins: TripDistributionBin[], metric: string, unit: string): EChartsOption {
  const rows = bins.filter((b) => b.metric === metric)
  const labels = rows.map((b) => `${b.bin_lo.toFixed(1)}\u2013${b.bin_hi.toFixed(1)}`)
  return {
    ...toolboxDefaults(`efficiency-hist-${metric}`),
    legend: { show: false },
    tooltip: tooltipUnits({ Count: 'trips' }),
    grid: { left: 48, right: 16, top: 24, bottom: 64, containLabel: true },
    xAxis: {
      ...categoryAxis(unit),
      data: labels,
      axisLabel: { color: '#6b7280', rotate: 40, hideOverlap: true, fontSize: 10 },
    },
    yAxis: valueAxis('Trips'),
    series: [
      {
        name: 'Count',
        type: 'bar',
        data: rows.map((b) => b.count),
        itemStyle: { color: '#1B7A4E' },
        barMaxWidth: 28,
        ...markAvg(),
      },
    ],
  }
}

export function EfficiencyPage({ data, filters }: { data: DashboardData; filters: FilterState }) {
  const [drill, setDrill] = useState<'matrix' | 'epkm' | 'lf' | null>(null)
  const minDate = data.agency.date_min
  const isV2 = (data.meta?.schema_version ?? 1) >= 2

  const { current, comparison } = useMemo(
    () => splitByComparison(data.daily, filters, { min: minDate }),
    [data.daily, filters, minDate],
  )

  const totals = useMemo(() => periodTotals(current), [current])
  const prev = useMemo(() => (comparison ? periodTotals(comparison) : null), [comparison])

  const kpiRows = useMemo(() => {
    if (!data.kpi_daily?.length) return [] as KpiDailyRow[]
    const { start, end } = filters.range
    return data.kpi_daily.filter((r) => {
      const d = r.service_date
      return d != null && d >= start && d <= end
    })
  }, [data.kpi_daily, filters.range])

  const kpiPeriod = useMemo(() => periodKpisFromDaily(kpiRows), [kpiRows])

  const kpiSeries = useMemo(() => {
    const dates = kpiRows.map((r) => r.service_date!).filter(Boolean)
    const pick = (key: keyof KpiDailyRow) =>
      kpiRows.map((r) => {
        const v = r[key]
        return typeof v === 'number' && Number.isFinite(v) ? Number(v.toFixed(2)) : null
      })
    return {
      dates,
      EPKM: pick('EPKM'),
      EPB: pick('EPB'),
      vehicle_km: pick('vehicle_km'),
      headway_mins: pick('headway_mins'),
      trips_per_bus: pick('trips_per_bus'),
      LF: pick('LF'),
    }
  }, [kpiRows])

  const dailyDerived = useMemo(
    () =>
      current.map((d) => ({
        date: d.service_date,
        atl: d.ridership > 0 ? d.pax_km / d.ridership : 0,
        fareYield: d.ridership > 0 ? d.revenue / d.ridership : 0,
      })),
    [current],
  )

  const allRoutes = useMemo(
    () => aggregateRoutes(applyFilters(data.route_trend, filters)),
    [data.route_trend, filters],
  )

  const routeRows = useMemo(
    () => [...allRoutes].sort((a, b) => b.fareYield - a.fareYield).slice(0, 8),
    [allRoutes],
  )

  /**
   * Each column is scaled to the best route in it, so a row reads as a
   * profile: strong on yield, weak on load, and so on.
   */
  const matrix = useMemo(() => {
    const metrics = [
      { label: 'Load factor', pick: (r: RouteAgg) => r.lf, format: (v: number) => fmtPct(v) },
      { label: 'Earnings / km', pick: (r: RouteAgg) => r.epkm, format: (v: number) => fmtMoney(v, { dp: 1 }) },
      { label: 'Fare yield', pick: (r: RouteAgg) => r.fareYield, format: (v: number) => fmtMoney(v, { dp: 1 }) },
      { label: 'Trips / bus', pick: (r: RouteAgg) => r.tripsPerBus, format: (v: number) => v.toFixed(1) },
      { label: 'Ridership', pick: (r: RouteAgg) => r.ridership, format: (v: number) => fmtInt(v) },
    ]
    const rows = [...allRoutes].sort((a, b) => b.ridership - a.ridership)
    const cells = metrics.flatMap((m, x) => {
      const max = Math.max(...rows.map((r) => m.pick(r)), Number.EPSILON)
      return rows.map((r, y) => ({
        x,
        y,
        norm: (m.pick(r) / max) * 100,
        display: m.format(m.pick(r)),
      }))
    })
    return {
      metrics: metrics.map((m) => m.label),
      routes: rows.map((r) => r.route_code),
      rows,
      option: normalizedMatrixOption(rows.map((r) => r.route_code), metrics.map((m) => m.label), cells),
    }
  }, [allRoutes])

  const bullets = useMemo(() => {
    return routeRows.slice(0, 6).map((r) => ({
      code: r.route_code,
      option: bulletOption(Number((r.lf * 100).toFixed(1)), LF_TARGET_PCT, {
        format: (v) => `${v.toFixed(1)}%`,
        target: LF_TARGET_PCT,
        bands: LF_BANDS_PCT,
      }) as EChartsOption,
    }))
  }, [routeRows])

  const trendPanels = useMemo(() => {
    const defs = [
      {
        key: 'epkm',
        title: 'Earnings per km (EPKM)',
        subtitle: 'Revenue per vehicle-km operated, by day',
        values: kpiSeries.EPKM,
        name: 'EPKM',
        color: '#1B7A4E',
        unit: '\u20B9',
        format: (v: number) => fmtMoney(v, { dp: 1 }),
        lowerIsBetter: false,
      },
      {
        key: 'headway',
        title: 'Average headway',
        subtitle: 'Average interval between trips, by day',
        values: kpiSeries.headway_mins,
        name: 'Headway',
        color: '#374151',
        unit: 'min',
        format: (v: number) => `${v.toFixed(1)} min`,
        lowerIsBetter: true,
      },
      {
        key: 'epb',
        title: 'Earnings per bus (EPB)',
        subtitle: 'Revenue produced by one bus, by day',
        values: kpiSeries.EPB,
        name: 'Earnings per bus',
        color: '#D97706',
        unit: '\u20B9',
        format: (v: number) => fmtMoney(v, { compact: v >= 1e5 }),
        lowerIsBetter: false,
      },
      {
        key: 'vkm',
        title: 'Vehicle kilometres',
        subtitle: 'Distance operated across the fleet, by day',
        values: kpiSeries.vehicle_km,
        name: 'Vehicle km',
        color: '#DC2626',
        unit: 'km',
        format: (v: number) => `${fmtInt(Math.round(v))} km`,
        lowerIsBetter: false,
      },
    ]
    return defs.map((d) => {
      const stats = seriesStats(kpiSeries.dates, d.values)
      const best = d.lowerIsBetter ? stats?.min : stats?.max
      const worst = d.lowerIsBetter ? stats?.max : stats?.min
      return {
        ...d,
        stats,
        best: best ?? { value: 0, date: '' },
        worst: worst ?? { value: 0, date: '' },
        option: trendOpt({
          dates: kpiSeries.dates,
          values: d.values,
          name: d.name,
          color: d.color,
          unit: d.unit,
          format: d.format,
          showAvg: filters.showAverage,
        }),
      }
    })
  }, [kpiSeries, filters.showAverage])

  const tripDist = data.trip_distribution ?? []

  if (current.length === 0) {
    return (
      <div className="page">
        <div className="empty-state">No service days in the selected period.</div>
      </div>
    )
  }

  const trendOf = (cur: number, previous: number | undefined) => {
    const d = prev ? fmtDelta(cur, previous) : null
    return d ? { up: d.up, label: `${d.label} vs previous period` } : undefined
  }

  const dash = (n: number | null, fmt: (v: number) => string) => (n == null ? '\u2014' : fmt(n))

  return (
    <div className="page">
      <div className="kpi-grid">
        <StatCard
          label="Average trip length (ATL)"
          value={fmtKm(totals.atl)}
          sub="Distance covered by an average passenger"
          trend={trendOf(totals.atl, prev?.atl)}
          definitionKey="atl"
          spark={dailyDerived.map((d) => d.atl)}
        />
        <StatCard
          label="Fare yield"
          value={fmtMoney(totals.fareYield, { dp: 2 })}
          sub="Revenue per passenger"
          trend={trendOf(totals.fareYield, prev?.fareYield)}
          definitionKey="fare_yield"
          spark={dailyDerived.map((d) => d.fareYield)}
        />
        <StatCard
          label="Earnings per km (EPKM)"
          value={dash(kpiPeriod.epkm, (v) => fmtMoney(v, { dp: 2 }))}
          sub="Revenue per vehicle-km operated"
          definitionKey="epkm"
          spark={kpiSeries.EPKM.filter((v): v is number => v != null)}
          onClick={() => setDrill('epkm')}
          drillLabel="Route earnings"
        />
        <StatCard
          label="Earnings per bus (EPB)"
          value={dash(kpiPeriod.epb, (v) => fmtMoney(v, { compact: v >= 1e5 }))}
          sub="Revenue produced by one bus per day"
          definitionKey="epb"
          spark={kpiSeries.EPB.filter((v): v is number => v != null)}
        />
        <StatCard
          label="Vehicle km"
          value={dash(kpiPeriod.vehicle_km, (v) => fmtInt(Math.round(v)))}
          definitionKey="vehicle_km"
          sub={
            kpiPeriod.vehicle_km_per_bus != null
              ? `${fmtInt(Math.round(kpiPeriod.vehicle_km_per_bus))} km/bus`
              : 'Vehicle-km in the selected period'
          }
          spark={kpiSeries.vehicle_km.filter((v): v is number => v != null)}
        />
        <StatCard
          label="Average headway"
          value={dash(kpiPeriod.headway_mins, (v) => `${v.toFixed(1)} min`)}
          sub="Average interval between trips"
          definitionKey="headway"
          spark={kpiSeries.headway_mins.filter((v): v is number => v != null)}
        />
        <StatCard
          label="Load factor (LF)"
          value={fmtPct(isV2 && kpiPeriod.lf != null ? kpiPeriod.lf : totals.lf)}
          sub="Passenger-km as a share of capacity-km"
          definitionKey="lf"
          onClick={() => setDrill('lf')}
          drillLabel="Route load factors"
          trend={trendOf(totals.lf, prev?.lf)}
          spark={kpiSeries.LF.filter((v): v is number => v != null)}
        />
        <StatCard
          label="Trips per bus"
          value={totals.tripsPerBus.toFixed(1)}
          sub="Trips delivered per bus-day"
          definitionKey="trips_per_bus"
          spark={kpiSeries.trips_per_bus.filter((v): v is number => v != null)}
        />
      </div>

      {!isV2 && (
        <EmptyState title="Some efficiency measures are unavailable">
          Upload the full file set again to compute earnings, vehicle-km, headway, and trip distribution.
        </EmptyState>
      )}

      <div className="charts-row">
        {trendPanels.map((p) => (
          <Card key={p.key} title={p.title} subtitle={p.subtitle}>
            {p.stats && (
              <dl className="panel-stats">
                <div>
                  <dt>Period average</dt>
                  <dd>{p.format(p.stats.avg)}</dd>
                </div>
                <div>
                  <dt>Best day</dt>
                  <dd>
                    {p.format(p.best.value)}
                    <span>{fmtDateWithWeekday(p.best.date)}</span>
                  </dd>
                </div>
                <div>
                  <dt>Worst day</dt>
                  <dd>
                    {p.format(p.worst.value)}
                    <span>{fmtDateWithWeekday(p.worst.date)}</span>
                  </dd>
                </div>
                <div>
                  <dt>Spread</dt>
                  <dd>
                    {`${((Math.abs(p.stats.max.value - p.stats.min.value) / Math.abs(p.stats.avg || 1)) * 100).toFixed(0)}%`}
                    <span>of the average</span>
                  </dd>
                </div>
              </dl>
            )}
            <Chart
              option={p.option}
              height={240}
              group="efficiency"
              empty={p.stats == null}
            />
          </Card>
        ))}
      </div>

      <Card
        title="Route efficiency matrix"
        subtitle="Each column scaled to the best route in it. Green is strong, red is weak"
        onDrill={() => setDrill('matrix')}
        drillLabel="Route table"
      >
        {matrix.routes.length > 0 ? (
          <Chart
            option={matrix.option}
            height={Math.max(220, 96 + matrix.routes.length * 30)}
            group="efficiency"
          />
        ) : (
          <div className="empty-state">No route data for the selected filters.</div>
        )}
      </Card>

      {bullets.length > 0 && (
        <Card
          title="Load factor by route"
          subtitle="Marker at 70% — service planning benchmark"
        >
          <div className="efficiency-bullets">
            {bullets.map((b) => (
              <div key={b.code} className="efficiency-bullet-cell">
                <div className="efficiency-bullet-head">
                  <span className="trends-multi-label">{b.code}</span>
                </div>
                <Chart option={b.option} height={44} />
              </div>
            ))}
          </div>
        </Card>
      )}

      {isV2 && tripDist.length > 0 && (
        <div className="charts-row">
          <Card title="Trip ridership distribution" subtitle="How many trips carry how many passengers">
            <Chart option={histOpt(tripDist, 'ridership_trip', 'pax / trip')} height={280} group="efficiency" />
          </Card>
          <Card title="Trip load-factor distribution" subtitle="Spread of load factor across individual trips">
            <Chart option={histOpt(tripDist, 'trip_lf', 'Load factor')} height={280} group="efficiency" />
          </Card>
        </div>
      )}

      <BreakdownDrawer
        open={drill === 'matrix' || drill === 'lf' || drill === 'epkm'}
        onClose={() => setDrill(null)}
        title="Route efficiency detail"
        subtitle={`${matrix.routes.length} routes \u00B7 ${filters.range.start} to ${filters.range.end}`}
        width={640}
        stats={[
          { label: 'Network load factor', value: fmtPct(totals.lf) },
          {
            label: 'Earnings per km',
            value: dash(kpiPeriod.epkm, (v) => fmtMoney(v, { dp: 2 })),
            hint: 'Network average',
          },
          { label: 'Fare yield', value: fmtMoney(totals.fareYield, { dp: 2 }), hint: 'Per passenger' },
          { label: 'Trips per bus', value: totals.tripsPerBus.toFixed(1) },
        ]}
        note="Routes weak on load factor but strong on earnings per km are carrying short, high-turnover trips: they do not need more capacity, they need tighter headways."
      >
        <DataTable
          rows={matrix.rows}
          rowKey={(r) => r.route_code}
          searchable
          exportName="route_efficiency"
          initialSort={{ key: 'lf', dir: 'desc' }}
          columns={[
            { key: 'route_code', header: 'Route', sortable: true },
            {
              key: 'lf',
              header: 'Load factor',
              align: 'right',
              sortable: true,
              bar: true,
              threshold: lfTone,
              format: (v) => fmtPct(v as number),
            },
            { key: 'epkm', header: 'Earnings/km', align: 'right', sortable: true, format: (v) => fmtMoney(v as number, { dp: 1 }) },
            { key: 'fareYield', header: 'Fare yield', align: 'right', sortable: true, format: (v) => fmtMoney(v as number, { dp: 1 }) },
            { key: 'tripsPerBus', header: 'Trips/bus', align: 'right', sortable: true, format: (v) => (v as number).toFixed(1) },
            { key: 'ridership', header: 'Passengers', align: 'right', sortable: true, format: (v) => fmtInt(v as number) },
          ]}
        />
      </BreakdownDrawer>
    </div>
  )
}