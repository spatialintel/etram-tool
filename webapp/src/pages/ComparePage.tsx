import { useMemo, useState } from 'react'
import type { EChartsOption } from 'echarts'
import {
  Chart,
  categoryAxis,
  toolboxDefaults,
  tooltipUnits,
  valueAxis,
  varianceBarOption,
} from '../components/Chart'
import {
  BreakdownDrawer,
  BreakdownTable,
  Card,
  DataTable,
  ListRow,
  SegmentedControl,
  StatCard,
  StatusBadge,
  type Column,
} from '../components/ui'
import { aggregateRoutes, periodTotals } from '../lib/aggregate'
import { applyFilters, getComparisonRange, inRange } from '../lib/filters'
import type { FilterState } from '../lib/filters'
import { fmtDelta, fmtInt, fmtMoney, fmtPct } from '../lib/format'
import type { DashboardData, RouteTrendRow } from '../types'

type Mode = 'period' | 'route'
type Metric = 'ridership' | 'revenue' | 'lf'

type DeltaRow = {
  key: string
  label: string
  a: number
  b: number
  abs: number
  pct: number | null
  up: boolean
}

function delta(a: number, b: number): Omit<DeltaRow, 'key' | 'label'> {
  const abs = a - b
  const pct = b === 0 ? null : (abs / Math.abs(b)) * 100
  return { a, b, abs, pct, up: abs >= 0 }
}

function formatCell(mode: Mode, metric: Metric, key: string, v: number): string {
  if (key === 'lf' || (mode === 'route' && metric === 'lf')) return fmtPct(v)
  if (key === 'revenue' || (mode === 'route' && metric === 'revenue')) return fmtMoney(v)
  return fmtInt(v)
}

export function ComparePage({ data, filters }: { data: DashboardData; filters: FilterState }) {
  const [mode, setMode] = useState<Mode>('period')
  const [metric, setMetric] = useState<Metric>('ridership')
  const [drill, setDrill] = useState(false)
  const minDate = data.agency.date_min

  const comparisonRange = useMemo(
    () => getComparisonRange(filters, { min: minDate }),
    [filters, minDate],
  )

  const periodA = useMemo(
    () => data.daily.filter((r) => inRange(r.service_date, filters.range)),
    [data.daily, filters.range],
  )
  const periodB = useMemo(() => {
    if (!comparisonRange) return []
    return data.daily.filter((r) => inRange(r.service_date, comparisonRange))
  }, [data.daily, comparisonRange])

  const totA = useMemo(() => periodTotals(periodA), [periodA])
  const totB = useMemo(() => periodTotals(periodB), [periodB])

  const routeA = useMemo(
    () => aggregateRoutes(applyFilters(data.route_trend, filters)),
    [data.route_trend, filters],
  )

  const routeB = useMemo(() => {
    if (!comparisonRange) return []
    const rows = data.route_trend.filter((r: RouteTrendRow) => inRange(r.service_date, comparisonRange))
    const f = { ...filters, range: { start: comparisonRange.start, end: comparisonRange.end } }
    return aggregateRoutes(applyFilters(rows, f))
  }, [data.route_trend, filters, comparisonRange])

  const routeDeltas = useMemo(() => {
    const mapB = new Map(routeB.map((r) => [r.route_code, r]))
    return routeA
      .map((r) => {
        const prev = mapB.get(r.route_code)
        const a = metric === 'revenue' ? r.revenue : metric === 'lf' ? r.lf : r.ridership
        const b = prev
          ? metric === 'revenue'
            ? prev.revenue
            : metric === 'lf'
              ? prev.lf
              : prev.ridership
          : 0
        return { key: r.route_code, label: r.route_code, ...delta(a, b) }
      })
      .sort((x, y) => Math.abs(y.abs) - Math.abs(x.abs))
  }, [routeA, routeB, metric])

  const kpiDeltas = useMemo(
    () => [
      { key: 'ridership', label: 'Ridership', ...delta(totA.ridership, totB.ridership) },
      { key: 'revenue', label: 'Revenue', ...delta(totA.revenue, totB.revenue) },
      { key: 'lf', label: 'Load factor', ...delta(totA.lf, totB.lf) },
      { key: 'trips', label: 'Trips', ...delta(totA.trips, totB.trips) },
    ],
    [totA, totB],
  )

  const barOpt = useMemo((): EChartsOption => {
    if (mode === 'period') {
      // Ridership, revenue, load factor and trips share no common unit, so the
      // comparison is expressed as percentage change rather than raw height.
      return {
        ...toolboxDefaults('compare-period'),
        ...varianceBarOption(
          kpiDeltas.map((d) => ({
            label: d.label,
            pct: d.pct ?? 0,
            detail: `${formatCell('period', metric, d.key, d.b)} \u2192 ${formatCell('period', metric, d.key, d.a)}`,
          })),
        ),
      }
    }
    const top = routeDeltas.slice(0, 10)
    const unit = metric === 'lf' ? '%' : metric === 'revenue' ? '\u20B9' : 'pax'
    return {
      ...toolboxDefaults('compare-routes'),
      legend: { data: ['Period A', 'Period B'] },
      tooltip: tooltipUnits({ 'Period A': unit, 'Period B': unit }),
      grid: { left: 48, right: 24, top: 48, bottom: 64, containLabel: true },
      xAxis: {
        ...categoryAxis('Route'),
        data: top.map((r) => r.label),
        axisLabel: { color: '#6b7280', rotate: 40, hideOverlap: true },
      },
      yAxis: valueAxis(metric === 'lf' ? 'Load factor' : metric === 'revenue' ? 'Revenue' : 'Ridership'),
      series: [
        {
          name: 'Period A',
          type: 'bar',
          data: top.map((r) => (metric === 'lf' ? r.a * 100 : r.a)),
          itemStyle: { color: '#1B7A4E' },
          barMaxWidth: 28,
        },
        {
          name: 'Period B',
          type: 'bar',
          data: top.map((r) => (metric === 'lf' ? r.b * 100 : r.b)),
          itemStyle: { color: '#9CA3AF' },
          barMaxWidth: 28,
        },
      ],
    }
  }, [mode, kpiDeltas, routeDeltas, metric])

  const tableRows = mode === 'period' ? kpiDeltas : routeDeltas
  const tableColumns: Column<DeltaRow>[] = [
    { key: 'label', header: mode === 'period' ? 'Metric' : 'Route', numeric: false },
    {
      key: 'a',
      header: 'Period A',
      align: 'right',
      format: (v, row) => formatCell(mode, metric, row.key, v as number),
    },
    {
      key: 'b',
      header: 'Period B',
      align: 'right',
      format: (v, row) => formatCell(mode, metric, row.key, v as number),
    },
    {
      key: 'abs',
      header: 'Change',
      align: 'right',
      format: (_v, row) => {
        const d = fmtDelta(row.a, row.b)
        return d ? <StatusBadge tone={d.up ? 'up' : 'down'}>{d.label}</StatusBadge> : '\u2014'
      },
    },
  ]

  if (!comparisonRange) {
    return (
      <div className="page">
        <div className="empty-state">
          Enable Compare in the date picker (or move the range off the dataset start) to build Period B.
        </div>
      </div>
    )
  }

  const ridershipDelta = fmtDelta(totA.ridership, totB.ridership)
  const revenueDelta = fmtDelta(totA.revenue, totB.revenue)
  const movers = routeDeltas.slice(0, 5)

  return (
    <div className="page">
      <div className="routes-toolbar">
        <SegmentedControl
          value={mode}
          options={[
            { value: 'period', label: 'Period totals' },
            { value: 'route', label: 'By route' },
          ]}
          onChange={setMode}
          ariaLabel="Compare mode"
        />
        {mode === 'route' && (
          <SegmentedControl
            value={metric}
            options={[
              { value: 'ridership', label: 'Ridership' },
              { value: 'revenue', label: 'Revenue' },
              { value: 'lf', label: 'Load factor' },
            ]}
            onChange={setMetric}
            ariaLabel="Compare metric"
          />
        )}
      </div>

      <div className="kpi-grid">
        <StatCard
          label="Period A ridership"
          value={fmtInt(totA.ridership)}
          sub={`${filters.range.start} \u2013 ${filters.range.end}`}
        />
        <StatCard
          label="Period B ridership"
          value={fmtInt(totB.ridership)}
          sub={`${comparisonRange.start} \u2013 ${comparisonRange.end}${comparisonRange.partial ? ' (partial)' : ''}`}
        />
        <StatCard
          label="Ridership change"
          value={ridershipDelta?.label ?? '\u2014'}
          trend={ridershipDelta ? { up: ridershipDelta.up, label: 'vs Period B' } : undefined}
        />
        <StatCard
          label="Revenue change"
          value={revenueDelta?.label ?? '\u2014'}
          trend={revenueDelta ? { up: revenueDelta.up, label: 'vs Period B' } : undefined}
        />
      </div>

      <Card
        title={mode === 'period' ? 'Change by metric' : 'Route comparison'}
        subtitle={
          mode === 'period'
            ? 'Percentage change from Period B to Period A \u00B7 hover for the underlying values'
            : 'Period A (current) vs Period B (previous window)'
        }
        onDrill={() => setDrill(true)}
        drillLabel="Detail"
      >
        <Chart option={barOpt} height={mode === 'period' ? 260 : 360} group="compare" />
      </Card>

      <div className="bento-footer">
        <Card title="Delta table" subtitle="Sorted by absolute change when viewing routes">
          <DataTable
            rows={tableRows}
            columns={tableColumns}
            initialSort={mode === 'route' ? { key: 'abs', dir: 'desc' } : undefined}
            searchable={mode === 'route'}
            exportName="compare-deltas"
            rowKey={(r) => r.key}
            pageSize={15}
          />
        </Card>
        <Card title="Biggest movers" subtitle="Routes by absolute change">
          {movers.length === 0 ? (
            <div className="empty-state">No route deltas in this window.</div>
          ) : (
            movers.map((m) => {
              const d = fmtDelta(m.a, m.b)
              return (
                <ListRow
                  key={m.key}
                  title={m.label}
                  meta={`${fmtInt(m.a)} vs ${fmtInt(m.b)}`}
                  badge={d ? <StatusBadge tone={d.up ? 'up' : 'down'}>{d.label}</StatusBadge> : undefined}
                />
              )
            })
          )}
        </Card>
      </div>

      <BreakdownDrawer
        open={drill}
        onClose={() => setDrill(false)}
        title="Period comparison detail"
        subtitle={`A: ${filters.range.start} to ${filters.range.end} \u00B7 B: ${comparisonRange.start} to ${comparisonRange.end}`}
        width={620}
        note="Percentage change is the only fair way to put ridership, revenue, load factor and trips on one axis. Absolute values are in the table below."
      >
        <BreakdownTable
          caption="Network metrics"
          columns={[
            { key: 'metric', label: 'Metric' },
            { key: 'b', label: 'Period B', align: 'right' },
            { key: 'a', label: 'Period A', align: 'right' },
            { key: 'change', label: 'Change', align: 'right' },
          ]}
          rows={kpiDeltas.map((d) => ({
            __key: d.key,
            metric: d.label,
            b: formatCell('period', metric, d.key, d.b),
            a: formatCell('period', metric, d.key, d.a),
            change: d.pct == null ? '\u2014' : `${d.pct > 0 ? '+' : ''}${d.pct.toFixed(1)}%`,
          }))}
        />
        <BreakdownTable
          caption="Routes with the largest movement"
          columns={[
            { key: 'route', label: 'Route' },
            { key: 'b', label: 'Period B', align: 'right' },
            { key: 'a', label: 'Period A', align: 'right' },
            { key: 'change', label: 'Change', align: 'right' },
          ]}
          rows={routeDeltas.slice(0, 12).map((d) => ({
            __key: d.key,
            route: d.label,
            b: formatCell('route', metric, d.key, d.b),
            a: formatCell('route', metric, d.key, d.a),
            change: d.pct == null ? '\u2014' : `${d.pct > 0 ? '+' : ''}${d.pct.toFixed(1)}%`,
          }))}
        />
      </BreakdownDrawer>
    </div>
  )
}