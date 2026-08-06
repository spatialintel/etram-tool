import { useMemo, useState } from 'react'
import type { EChartsOption } from 'echarts'
import {
  Chart,
  bulletOption,
  categoryAxis,
  markAvg,
  markTarget,
  normalizedMatrixOption,
  toolboxDefaults,
  tooltipUnits,
  valueAxis,
} from '../components/Chart'
import { BreakdownDrawer, BreakdownTable, Card, EmptyState, StatCard } from '../components/ui'
import { aggregateRoutes, periodTotals } from '../lib/aggregate'
import type { RouteAgg } from '../lib/aggregate'
import { applyFilters, splitByComparison } from '../lib/filters'
import type { FilterState } from '../lib/filters'
import { fmtDateWithWeekday, fmtDelta, fmtInt, fmtKm, fmtMoney, fmtPct } from '../lib/format'
import { usePrefs } from '../lib/prefs'
import type { DashboardData, KpiDailyRow, TripDistributionBin } from '../types'

function meanKpi(rows: KpiDailyRow[], key: keyof KpiDailyRow): number | null {
  const vals = rows
    .map((r) => r[key])
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
  if (!vals.length) return null
  return vals.reduce((a, b) => a + b, 0) / vals.length
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

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
 * A daily KPI panel: the line plus the three readings an operator asks for
 * next — where it sits against target, and which days were best and worst.
 */
function trendOpt(opts: {
  dates: string[]
  values: (number | null)[]
  name: string
  color: string
  unit: string
  format: (v: number) => string
  showAvg: boolean
  target?: number
  targetLabel?: string
}): EChartsOption {
  const { dates, values, name, color, unit, format, showAvg, target } = opts
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
        ...(target != null ? markTarget(target, opts.targetLabel ?? 'Target') : {}),
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
  const [prefs] = usePrefs()
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

  const kpiAvg = useMemo(
    () => ({
      EPKM: meanKpi(kpiRows, 'EPKM'),
      EPB: meanKpi(kpiRows, 'EPB'),
      vehicle_km: meanKpi(kpiRows, 'vehicle_km'),
      vehicle_km_per_bus: meanKpi(kpiRows, 'vehicle_km_per_bus'),
      headway_mins: meanKpi(kpiRows, 'headway_mins'),
      LF: meanKpi(kpiRows, 'LF'),
    }),
    [kpiRows],
  )

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
    const target = prefs.targets.lf * 100
    const ceil = Math.max(target * 1.25, ...routeRows.map((r) => r.lf * 100), 1)
    return routeRows.slice(0, 6).map((r) => ({
      code: r.route_code,
      gap: r.lf * 100 - target,
      option: bulletOption(Number((r.lf * 100).toFixed(1)), target, ceil, {
        format: (v) => `${v.toFixed(1)}%`,
      }) as EChartsOption,
    }))
  }, [routeRows, prefs.targets.lf])

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
        target: undefined as number | undefined,
        targetLabel: undefined as string | undefined,
      },
      {
        key: 'headway',
        title: 'Average headway',
        subtitle: 'Minutes between consecutive trips, by day',
        values: kpiSeries.headway_mins,
        name: 'Headway',
        color: '#374151',
        unit: 'min',
        format: (v: number) => `${v.toFixed(1)} min`,
        lowerIsBetter: true,
        target: prefs.targets.headwayMins,
        targetLabel: `Target at most ${prefs.targets.headwayMins} min`,
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
        target: undefined as number | undefined,
        targetLabel: undefined as string | undefined,
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
        target: undefined as number | undefined,
        targetLabel: undefined as string | undefined,
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
          target: d.target,
          targetLabel: d.targetLabel,
        }),
      }
    })
  }, [kpiSeries, filters.showAverage, prefs.targets.headwayMins])

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
          value={dash(kpiAvg.EPKM, (v) => fmtMoney(v, { dp: 2 }))}
          sub="Revenue per vehicle-km operated"
          definitionKey="epkm"
          spark={kpiSeries.EPKM.filter((v): v is number => v != null)}
          onClick={() => setDrill('epkm')}
          drillLabel="Route earnings"
        />
        <StatCard
          label="Earnings per bus (EPB)"
          value={dash(kpiAvg.EPB, (v) => fmtMoney(v, { compact: v >= 1e5 }))}
          sub="Revenue produced by one bus per day"
          definitionKey="epb"
          spark={kpiSeries.EPB.filter((v): v is number => v != null)}
        />
        <StatCard
          label="Vehicle km"
          value={dash(kpiAvg.vehicle_km, (v) => fmtInt(Math.round(v)))}
          definitionKey="vehicle_km"
          sub={
            kpiAvg.vehicle_km_per_bus != null
              ? `${fmtInt(Math.round(kpiAvg.vehicle_km_per_bus))} km/bus`
              : 'Daily average — re-export for per-bus value'
          }
          spark={kpiSeries.vehicle_km.filter((v): v is number => v != null)}
        />
        <StatCard
          label="Average headway"
          value={dash(kpiAvg.headway_mins, (v) => `${v.toFixed(1)} min`)}
          sub="Gap between consecutive trips"
          definitionKey="headway"
          target={
            kpiAvg.headway_mins != null
              ? {
                  value: prefs.targets.headwayMins,
                  current: kpiAvg.headway_mins,
                  label: `Target at most ${prefs.targets.headwayMins} min`,
                  direction: 'lower',
                }
              : undefined
          }
          spark={kpiSeries.headway_mins.filter((v): v is number => v != null)}
        />
        <StatCard
          label="Load factor (LF)"
          value={fmtPct(isV2 && kpiAvg.LF != null ? kpiAvg.LF : totals.lf)}
          sub="Passenger-km as a share of capacity-km"
          definitionKey="lf"
          onClick={() => setDrill('lf')}
          drillLabel="Route load factors"
          trend={trendOf(totals.lf, prev?.lf)}
          target={{ value: prefs.targets.lf, current: totals.lf, label: `Target ${(prefs.targets.lf * 100).toFixed(0)}%` }}
          spark={kpiSeries.LF.filter((v): v is number => v != null)}
        />
        <StatCard
          label="Trips per bus"
          value={totals.tripsPerBus.toFixed(1)}
          sub="Daily scheduled trips delivered by each bus"
          definitionKey="trips_per_bus"
          target={{
            value: prefs.targets.tripsPerBus,
            current: totals.tripsPerBus,
            label: `Target ${prefs.targets.tripsPerBus} daily trips/bus`,
          }}
          spark={kpiSeries.trips_per_bus.filter((v): v is number => v != null)}
        />
      </div>

      {!isV2 && (
        <EmptyState title="Python KPIs need schema v2">
          Re-run the export for EPKM, EPB, vehicle-km, headway, and trip distribution.
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
          title="Load factor against target, by route"
          subtitle={`Bar is the route average, the black tick is the ${(prefs.targets.lf * 100).toFixed(0)}% target. Top routes by fare yield.`}
        >
          <div className="efficiency-bullets">
            {bullets.map((b) => (
              <div key={b.code} className="efficiency-bullet-cell">
                <div className="efficiency-bullet-head">
                  <span className="trends-multi-label">{b.code}</span>
                  <span className={`efficiency-bullet-gap is-${b.gap >= 0 ? 'good' : 'bad'}`}>
                    {`${b.gap >= 0 ? '+' : ''}${b.gap.toFixed(1)} pts`}
                  </span>
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
          { label: 'Network load factor', value: fmtPct(totals.lf), hint: `Target ${fmtPct(prefs.targets.lf)}` },
          {
            label: 'Earnings per km',
            value: dash(kpiAvg.EPKM, (v) => fmtMoney(v, { dp: 2 })),
            hint: 'Network average',
          },
          { label: 'Fare yield', value: fmtMoney(totals.fareYield, { dp: 2 }), hint: 'Per passenger' },
          { label: 'Trips per bus', value: totals.tripsPerBus.toFixed(1) },
        ]}
        note="Routes weak on load factor but strong on earnings per km are carrying short, high-turnover trips: they do not need more capacity, they need tighter headways."
      >
        <BreakdownTable
          columns={[
            { key: 'route', label: 'Route' },
            { key: 'lf', label: 'Load factor', align: 'right' },
            { key: 'epkm', label: 'Earnings/km', align: 'right' },
            { key: 'yield', label: 'Fare yield', align: 'right' },
            { key: 'tpb', label: 'Trips/bus', align: 'right' },
            { key: 'ridership', label: 'Passengers', align: 'right' },
          ]}
          rows={matrix.rows.map((r) => ({
            __key: r.route_code,
            route: r.route_code,
            lf: fmtPct(r.lf),
            epkm: fmtMoney(r.epkm, { dp: 1 }),
            yield: fmtMoney(r.fareYield, { dp: 1 }),
            tpb: r.tripsPerBus.toFixed(1),
            ridership: fmtInt(r.ridership),
          }))}
        />
      </BreakdownDrawer>
    </div>
  )
}