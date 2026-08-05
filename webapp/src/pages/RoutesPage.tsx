import { useMemo, useState } from 'react'
import type { EChartsOption } from 'echarts'
import {
  Chart,
  categoryAxis,
  horizontalBarOption,
  markAvg,
  quadrantScatterOption,
  toolboxDefaults,
  tooltipUnits,
  valueAxis,
} from '../components/Chart'
import {
  Card,
  DataTable,
  Drawer,
  SegmentedControl,
  Select,
  Sparkline,
  StatCard,
  Tabs,
  type Column,
} from '../components/ui'
import { aggregateRoutes, type RouteAgg } from '../lib/aggregate'
import { splitByComparison } from '../lib/filters'
import type { FilterState, MetricKey } from '../lib/filters'
import { fmtDelta, fmtInt, fmtMoney, fmtPct } from '../lib/format'
import { usePrefs } from '../lib/prefs'
import type { DashboardData } from '../types'

type TabId = 'chart' | 'table' | 'compare'
type ScatterMode = 'lf-ridership' | 'epkm-lf'

const METRIC_OPTIONS: { value: MetricKey; label: string }[] = [
  { value: 'ridership', label: 'Ridership' },
  { value: 'revenue', label: 'Revenue' },
  { value: 'lf', label: 'Load factor' },
]

const TOP_N_OPTIONS = [
  { value: '5', label: 'Top 5' },
  { value: '10', label: 'Top 10' },
  { value: '0', label: 'All' },
]

const SCATTER_OPTIONS: { value: ScatterMode; label: string }[] = [
  { value: 'lf-ridership', label: 'Load factor vs ridership' },
  { value: 'epkm-lf', label: 'Earnings per km vs load factor' },
]

function metricValue(r: RouteAgg, metric: MetricKey): number {
  if (metric === 'revenue') return r.revenue
  if (metric === 'lf') return r.lf * 100
  return r.ridership
}

function metricUnit(metric: MetricKey): string {
  if (metric === 'revenue') return '\u20B9'
  if (metric === 'lf') return '%'
  return 'pax'
}

function formatMetric(metric: MetricKey, v: number): string {
  if (metric === 'revenue') return fmtMoney(v)
  if (metric === 'lf') return `${v.toFixed(1)}%`
  return fmtInt(v)
}

export function RoutesPage({
  data,
  filters,
  onFilterChange,
}: {
  data: DashboardData
  filters: FilterState
  onFilterChange: (patch: Partial<FilterState>) => void
}) {
  const [prefs] = usePrefs()
  const lfTarget = prefs.targets.lf
  const [tab, setTab] = useState<TabId>('chart')
  const [scatterMode, setScatterMode] = useState<ScatterMode>('epkm-lf')
  const [selected, setSelected] = useState<RouteAgg | null>(null)
  const minDate = data.agency.date_min

  const { current, comparison } = useMemo(
    () => splitByComparison(data.route_trend, filters, { min: minDate }),
    [data.route_trend, filters, minDate],
  )

  const all = useMemo(() => aggregateRoutes(current), [current])
  const rows = useMemo(
    () => (filters.topN > 0 ? all.slice(0, filters.topN) : all),
    [all, filters.topN],
  )

  const prevByRoute = useMemo(() => {
    const map = new Map<string, RouteAgg>()
    if (!comparison) return map
    for (const r of aggregateRoutes(comparison)) map.set(r.route_code, r)
    return map
  }, [comparison])

  const totalRidership = all.reduce((s, r) => s + r.ridership, 0)
  const totalRevenue = all.reduce((s, r) => s + r.revenue, 0)
  const totalTrips = all.reduce((s, r) => s + r.trips, 0)
  const prevTotals = useMemo(
    () =>
      comparison
        ? aggregateRoutes(comparison).reduce(
            (s, r) => ({
              ridership: s.ridership + r.ridership,
              revenue: s.revenue + r.revenue,
              trips: s.trips + r.trips,
            }),
            { ridership: 0, revenue: 0, trips: 0 },
          )
        : null,
    [comparison],
  )
  const ridershipDelta = prevTotals ? fmtDelta(totalRidership, prevTotals.ridership) : null
  const revenueDelta = prevTotals ? fmtDelta(totalRevenue, prevTotals.revenue) : null
  const tripsDelta = prevTotals ? fmtDelta(totalTrips, prevTotals.trips) : null

  const sparkByRoute = useMemo(() => {
    const map = new Map<string, number[]>()
    const sorted = [...current].sort((a, b) => a.service_date.localeCompare(b.service_date))
    for (const r of sorted) {
      const arr = map.get(r.route_code) ?? []
      arr.push(r.ridership)
      map.set(r.route_code, arr)
    }
    return map
  }, [current])

  const rankingOpt = useMemo((): EChartsOption => {
    const metric = filters.metric
    const unit = metricUnit(metric)
    const base = horizontalBarOption(
      rows.map((r) => ({ name: r.route_code, value: metricValue(r, metric) })),
      unit,
      { showAverage: filters.showAverage },
    )
    return { ...toolboxDefaults('routes-ranking'), ...base }
  }, [rows, filters.metric, filters.showAverage])

  const scatterOpt = useMemo((): EChartsOption => {
    const pts =
      scatterMode === 'epkm-lf'
        ? rows.map((r) => ({
            name: r.route_code,
            x: Number(r.epkm.toFixed(2)),
            y: Number((r.lf * 100).toFixed(1)),
            size: r.trips,
          }))
        : rows.map((r) => ({
            name: r.route_code,
            x: r.ridership,
            y: Number((r.lf * 100).toFixed(1)),
            size: r.trips,
          }))
    const isEpkm = scatterMode === 'epkm-lf'
    return {
      ...toolboxDefaults('routes-scatter'),
      ...quadrantScatterOption(pts, {
        xName: isEpkm ? 'Earnings per km (\u20B9/km)' : 'Ridership (pax)',
        yName: 'Load factor %',
        xFormat: (v) => (isEpkm ? fmtMoney(v, { dp: 2 }) : fmtInt(v)),
        yFormat: (v) => `${v.toFixed(1)}%`,
        quadrants: isEpkm
          ? {
              tr: 'Earning and full \u2014 protect',
              tl: 'Full but low earning \u2014 review fares',
              br: 'Earning but empty \u2014 add stops',
              bl: 'Weak on both \u2014 restructure',
            }
          : {
              tr: 'Busy and full \u2014 add capacity',
              tl: 'Full but small \u2014 lengthen trips',
              br: 'Busy but empty \u2014 retime',
              bl: 'Weak on both \u2014 restructure',
            },
      }),
    }
  }, [rows, scatterMode])

  const compareOpt = useMemo((): EChartsOption => {
    const metric = filters.metric
    const codes = rows.map((r) => r.route_code)
    return {
      ...toolboxDefaults('routes-compare'),
      legend: { data: ['Current', 'Previous'] },
      tooltip: tooltipUnits({
        Current: metricUnit(metric),
        Previous: metricUnit(metric),
      }),
      grid: { left: 48, right: 24, top: 48, bottom: 64, containLabel: true },
      xAxis: {
        ...categoryAxis('Route'),
        data: codes,
        axisLabel: { color: '#6b7280', rotate: 40, hideOverlap: true },
      },
      yAxis: valueAxis(metricUnit(metric)),
      series: [
        {
          name: 'Current',
          type: 'bar',
          data: rows.map((r) => metricValue(r, metric)),
          itemStyle: { color: '#1B7A4E' },
          barMaxWidth: 28,
          ...(filters.showAverage ? markAvg() : {}),
        },
        {
          name: 'Previous',
          type: 'bar',
          data: rows.map((r) => {
            const prev = prevByRoute.get(r.route_code)
            return prev ? metricValue(prev, metric) : 0
          }),
          itemStyle: { color: '#9CA3AF' },
          barMaxWidth: 28,
        },
      ],
    }
  }, [rows, filters.metric, filters.showAverage, prevByRoute])

  const columns: Column<RouteAgg>[] = useMemo(
    () => [
      { key: 'route_code', header: 'Route', numeric: false },
      { key: 'ridership', header: 'Ridership', align: 'right', bar: true, format: (v) => fmtInt(v as number) },
      { key: 'revenue', header: 'Revenue', align: 'right', format: (v) => fmtMoney(v as number) },
      {
        key: 'lf',
        header: 'Load factor',
        align: 'right',
        format: (v) => fmtPct(v as number),
        threshold: (v) => (v >= lfTarget ? 'good' : v >= lfTarget * 0.75 ? 'warn' : 'bad'),
      },
      { key: 'trips', header: 'Trips', align: 'right', format: (v) => fmtInt(v as number) },
      { key: 'busesPerDay', header: 'Buses / day', align: 'right', format: (v) => (v as number).toFixed(1) },
      { key: 'days', header: 'Days', align: 'right', format: (v) => fmtInt(v as number) },
    ],
    [lfTarget],
  )

  if (all.length === 0) {
    return (
      <div className="page">
        <div className="empty-state">No route data for the selected filters.</div>
      </div>
    )
  }

  const rangeLabel = `${filters.range.start} to ${filters.range.end}`
  const spark = selected ? sparkByRoute.get(selected.route_code) ?? [] : []

  return (
    <div className="page">
      <div className="kpi-grid">
        <StatCard
          label="Routes"
          value={String(all.length)}
          sub={filters.topN > 0 ? `Top ${Math.min(filters.topN, all.length)} shown` : undefined}
        />
        <StatCard
          label="Ridership"
          value={fmtInt(totalRidership)}
          sub="Across the selected period"
          definitionKey="ridership"
          trend={
            ridershipDelta
              ? { up: ridershipDelta.up, label: `${ridershipDelta.label} vs previous period` }
              : undefined
          }
        />
        <StatCard
          label="Revenue"
          value={fmtMoney(totalRevenue, { compact: totalRevenue >= 1e5 })}
          sub="Across the selected period"
          definitionKey="revenue"
          trend={
            revenueDelta
              ? { up: revenueDelta.up, label: `${revenueDelta.label} vs previous period` }
              : undefined
          }
        />
        <StatCard
          label="Trips"
          value={fmtInt(totalTrips)}
          sub="Across the selected period"
          trend={
            tripsDelta
              ? { up: tripsDelta.up, label: `${tripsDelta.label} vs previous period` }
              : undefined
          }
        />
      </div>

      <div className="routes-toolbar">
        <Tabs
          value={tab}
          onChange={(v) => setTab(v as TabId)}
          items={[
            { id: 'chart', label: 'Chart' },
            { id: 'table', label: 'Table' },
            { id: 'compare', label: 'Compare' },
          ]}
        />
        <div className="routes-toolbar-controls">
          <SegmentedControl
            value={filters.metric}
            options={METRIC_OPTIONS}
            onChange={(metric) => onFilterChange({ metric })}
            ariaLabel="Ranking metric"
          />
          <Select
            label="Show"
            value={String(filters.topN)}
            options={TOP_N_OPTIONS}
            onChange={(v) => onFilterChange({ topN: Number(v) })}
          />
        </div>
      </div>

      {tab === 'chart' && (
        <>
          <Card title={`Route ranking \u00B7 ${METRIC_OPTIONS.find((m) => m.value === filters.metric)?.label}`} subtitle={rangeLabel}>
            <Chart option={rankingOpt} height={Math.max(280, rows.length * 28)} group="routes" empty={rows.length === 0} />
          </Card>
          <Card
            title={scatterMode === 'epkm-lf' ? 'Earnings per km vs load factor' : 'Load factor vs ridership'}
            subtitle="Bubble size is trips. Dashed lines split the network at its medians"
          >
            <div className="routes-toolbar-controls" style={{ marginBottom: 12 }}>
              <SegmentedControl
                value={scatterMode}
                options={SCATTER_OPTIONS}
                onChange={setScatterMode}
                ariaLabel="Scatter axes"
              />
            </div>
            <Chart option={scatterOpt} height={340} group="routes" empty={rows.length === 0} />
          </Card>
        </>
      )}

      {tab === 'table' && (
        <Card title="Route detail" subtitle="Click a row for the route drawer">
          <DataTable
            rows={all}
            columns={columns}
            initialSort={{ key: 'ridership', dir: 'desc' }}
            searchable
            totalsRow
            exportName="route-performance"
            rowKey={(r) => r.route_code}
            onRowClick={setSelected}
          />
        </Card>
      )}

      {tab === 'compare' && (
        <Card
          title="Current vs previous period"
          subtitle={
            filters.compare === 'none'
              ? 'Enable Compare in the date picker to populate the previous series'
              : rangeLabel
          }
        >
          <Chart option={compareOpt} height={360} group="routes" empty={rows.length === 0} />
        </Card>
      )}

      <Drawer
        open={selected != null}
        onClose={() => setSelected(null)}
        title={selected?.route_code ?? ''}
        subtitle={rangeLabel}
      >
        {selected && (
          <div className="route-drawer">
            <dl className="ops-grid">
              <div>
                <dt className="ops-item-label">Ridership</dt>
                <dd className="ops-item-value">{fmtInt(selected.ridership)}</dd>
              </div>
              <div>
                <dt className="ops-item-label">Revenue</dt>
                <dd className="ops-item-value">{fmtMoney(selected.revenue)}</dd>
              </div>
              <div>
                <dt className="ops-item-label">Load factor</dt>
                <dd className="ops-item-value">{fmtPct(selected.lf)}</dd>
              </div>
              <div>
                <dt className="ops-item-label">Trips</dt>
                <dd className="ops-item-value">{fmtInt(selected.trips)}</dd>
              </div>
              <div>
                <dt className="ops-item-label">Buses / day</dt>
                <dd className="ops-item-value">{selected.busesPerDay.toFixed(1)}</dd>
              </div>
              <div>
                <dt className="ops-item-label">Fare yield</dt>
                <dd className="ops-item-value">{fmtMoney(selected.fareYield, { dp: 2 })}</dd>
              </div>
            </dl>
            <div className="route-drawer-spark">
              <div className="ops-item-label">Ridership spark</div>
              <Sparkline values={spark} width={280} height={48} />
            </div>
            {(() => {
              const prev = prevByRoute.get(selected.route_code)
              const d = prev ? fmtDelta(selected.ridership, prev.ridership) : null
              return d ? (
                <p className="ops-footnote">
                  Ridership {d.label} vs previous period ({formatMetric('ridership', prev!.ridership)}).
                </p>
              ) : null
            })()}
          </div>
        )}
      </Drawer>
    </div>
  )
}