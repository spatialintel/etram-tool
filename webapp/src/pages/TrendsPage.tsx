import { useCallback, useMemo, useState } from 'react'
import type { EChartsOption } from 'echarts'
import {
  Chart,
  COLORS,
  brushDefaults,
  categoryAxis,
  markAvg,
  markExtremes,
  toolboxDefaults,
  tooltipUnits,
  trendSeries,
  valueAxis,
  zoomDefaults,
} from '../components/Chart'
import { Card, SegmentedControl, Switch } from '../components/ui'
import { fmtInt, fmtMoney } from '../lib/format'
import { bucketKey, bucketLabel } from '../lib/aggregate'
import { applyFilters, weekdayOf } from '../lib/filters'
import type { FilterState, MetricKey } from '../lib/filters'
import { movingAverage } from '../lib/stats'
import type { DashboardData, RouteTrendRow } from '../types'

type TrendField = 'ridership' | 'revenue' | 'load_factor_route'

const METRIC_OPTIONS: { value: MetricKey; label: string }[] = [
  { value: 'ridership', label: 'Ridership' },
  { value: 'revenue', label: 'Revenue' },
  { value: 'lf', label: 'Load factor' },
]

function fieldOf(metric: MetricKey): { field: TrendField; yName: string; unit: string; scale: number } {
  if (metric === 'revenue') return { field: 'revenue', yName: 'Revenue (\u20B9)', unit: '\u20B9', scale: 1 }
  if (metric === 'lf') return { field: 'load_factor_route', yName: 'Load factor %', unit: '%', scale: 100 }
  return { field: 'ridership', yName: 'Ridership (pax)', unit: 'pax', scale: 1 }
}

/** MarkArea pairs for Sat/Sun category indices (daily buckets only). */
function weekendAreas(bucketDates: string[]): { xAxis: number }[][] {
  const areas: { xAxis: number }[][] = []
  let start: number | null = null
  for (let i = 0; i < bucketDates.length; i++) {
    const wd = weekdayOf(bucketDates[i])
    const weekend = wd === 0 || wd === 6
    if (weekend && start == null) start = i
    if ((!weekend || i === bucketDates.length - 1) && start != null) {
      const end = weekend && i === bucketDates.length - 1 ? i : i - 1
      if (end >= start) areas.push([{ xAxis: start }, { xAxis: end }])
      start = null
    }
  }
  return areas
}

export function TrendsPage({
  data,
  filters,
  onFilterChange,
}: {
  data: DashboardData
  filters: FilterState
  onFilterChange: (patch: Partial<FilterState>) => void
}) {
  const [sharedScale, setSharedScale] = useState(true)
  const [showMa, setShowMa] = useState(true)
  const [showTrend, setShowTrend] = useState(true)

  const rows = useMemo(() => applyFilters(data.route_trend, filters), [data.route_trend, filters])
  const { field, yName, unit, scale } = fieldOf(filters.metric)

  const targets = useMemo(() => {
    if (filters.routes.length > 0) return filters.routes.slice(0, 12)
    const totals = new Map<string, number>()
    for (const r of rows) totals.set(r.route_code, (totals.get(r.route_code) || 0) + r.ridership)
    return [...totals.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([c]) => c)
  }, [rows, filters.routes])

  const buckets = useMemo(() => {
    const keys = new Set<string>()
    for (const r of rows) keys.add(bucketKey(r.service_date, filters.granularity))
    return [...keys].sort()
  }, [rows, filters.granularity])

  /** For daily granularity, bucket key IS the ISO date (used for weekends + brush). */
  const bucketDates = buckets

  const seriesFor = useCallback(
    (fld: TrendField, sc: number): Record<string, (number | null)[]> => {
      const out: Record<string, (number | null)[]> = {}
      for (const rc of targets) {
        const acc = new Map<string, { sum: number; n: number }>()
        for (const r of rows as RouteTrendRow[]) {
          if (r.route_code !== rc) continue
          const key = bucketKey(r.service_date, filters.granularity)
          const e = acc.get(key) || { sum: 0, n: 0 }
          e.sum += (r[fld] || 0) * sc
          e.n += 1
          acc.set(key, e)
        }
        out[rc] = buckets.map((k) => {
          const e = acc.get(k)
          if (!e) return null
          return fld === 'load_factor_route' ? e.sum / e.n : e.sum
        })
      }
      return out
    },
    [targets, rows, buckets, filters.granularity],
  )

  const byRoute = useMemo(() => seriesFor(field, scale), [seriesFor, field, scale])

  const lead = useMemo(() => {
    const s = byRoute[targets[0]] ?? []
    return s.map((v) => (v == null ? 0 : v))
  }, [byRoute, targets])

  const maSeries = useMemo(() => {
    if (!showMa || filters.granularity !== 'daily' || lead.length < 7) return null
    return movingAverage(lead, 7)
  }, [showMa, filters.granularity, lead])

  const weekendMark = useMemo(() => {
    if (filters.granularity !== 'daily') return null
    const areas = weekendAreas(bucketDates)
    if (areas.length === 0) return null
    return {
      markArea: {
        silent: true,
        itemStyle: { color: 'rgba(107, 114, 128, 0.08)' },
        data: areas as unknown as [{ xAxis: number }, { xAxis: number }][],
      },
    }
  }, [filters.granularity, bucketDates])

  const mainOpt = useMemo(() => {
    const units: Record<string, string> = Object.fromEntries(targets.map((t) => [t, unit]))
    units['7-day MA'] = unit
    units.Trend = unit
    return {
      ...toolboxDefaults(`trends-${field}`),
      ...zoomDefaults(),
      ...brushDefaults(),
      legend: { data: [...targets, ...(maSeries ? ['7-day MA'] : []), ...(showTrend ? ['Trend'] : [])] },
      tooltip: tooltipUnits(units),
      grid: { left: 56, right: 24, top: 48, bottom: 72, containLabel: true },
      xAxis: {
        ...categoryAxis(),
        data: buckets.map((k) => bucketLabel(k, filters.granularity)),
        axisLabel: {
          color: '#6b7280',
          rotate: filters.granularity === 'daily' ? 30 : 0,
          hideOverlap: true,
        },
      },
      yAxis: valueAxis(yName),
      series: [
        ...targets.map((rc, i) => ({
          name: rc,
          type: 'line' as const,
          data: byRoute[rc],
          connectNulls: false,
          showSymbol: true,
          symbolSize: 5,
          itemStyle: { color: COLORS[i % COLORS.length] },
          lineStyle: { width: 2 },
          smooth: true,
          ...(i === 0 ? { ...(filters.showAverage ? markAvg() : {}), ...markExtremes(), ...(weekendMark ?? {}) } : {}),
        })),
        ...(maSeries
          ? [
              {
                name: '7-day MA',
                type: 'line' as const,
                data: maSeries,
                showSymbol: false,
                lineStyle: { width: 2, type: 'solid' as const, color: '#111827' },
                z: 3,
              },
            ]
          : []),
        ...(showTrend && targets.length > 0 && lead.length >= 2 ? [trendSeries(lead, 'Trend')] : []),
      ],
    } as EChartsOption
  }, [
    field, unit, yName, targets, buckets, byRoute, filters.granularity, filters.showAverage,
    maSeries, showTrend, lead, weekendMark,
  ])

  const onBrush = useCallback(
    (params: unknown) => {
      if (filters.granularity !== 'daily') return
      const p = params as {
        batch?: Array<{ areas?: Array<{ coordRange?: number[] }> }>
      }
      const area = p.batch?.[0]?.areas?.[0]
      const range = area?.coordRange
      if (!range || range.length < 2) return
      const i0 = Math.max(0, Math.floor(Math.min(range[0], range[1])))
      const i1 = Math.min(bucketDates.length - 1, Math.ceil(Math.max(range[0], range[1])))
      if (i0 > i1 || !bucketDates[i0] || !bucketDates[i1]) return
      onFilterChange({ range: { start: bucketDates[i0], end: bucketDates[i1] } })
    },
    [filters.granularity, bucketDates, onFilterChange],
  )

  const multiOpts = useMemo(() => {
    const codes = targets.slice(0, 12)
    let yMax = 0
    if (sharedScale) {
      for (const rc of codes) {
        for (const v of byRoute[rc] ?? []) {
          if (v != null && v > yMax) yMax = v
        }
      }
    }
    return codes.map((rc) => {
      const dataPts = byRoute[rc] ?? []
      const present = dataPts.filter((v): v is number => v != null)
      const mean = present.length ? present.reduce((a, b) => a + b, 0) / present.length : null
      return {
        code: rc,
        mean,
        option: {
          // One colour across every panel: the panels are compared to each
          // other, so a per-panel hue only adds a legend to decode. Pale tints
          // in the old palette also washed out at this size.
          tooltip: tooltipUnits({ [rc]: unit }),
          grid: { left: 44, right: 14, top: 14, bottom: 22, containLabel: true },
          xAxis: {
            ...categoryAxis(),
            data: buckets.map((k) => bucketLabel(k, filters.granularity)),
            axisLabel: { show: false },
            axisLine: { show: false },
          },
          yAxis: {
            ...valueAxis(),
            ...(sharedScale && yMax > 0 ? { max: yMax } : {}),
            splitNumber: 3,
            axisLabel: { color: '#6b7280', fontSize: 10 },
          },
          series: [
            {
              name: rc,
              type: 'line' as const,
              data: dataPts,
              showSymbol: false,
              smooth: true,
              lineStyle: { width: 2, color: '#1B7A4E' },
              itemStyle: { color: '#1B7A4E' },
              areaStyle: { color: 'rgba(27,122,78,0.10)' },
              ...(mean != null
                ? {
                    markLine: {
                      silent: true,
                      symbol: 'none',
                      data: [{ yAxis: mean, label: { show: false } }],
                      lineStyle: { color: '#9CA3AF', type: 'dashed' as const, width: 1 },
                    },
                  }
                : {}),
            },
          ],
        } as EChartsOption,
      }
    })
  }, [targets, byRoute, buckets, filters.granularity, sharedScale, unit])

  if (buckets.length === 0 || targets.length === 0) {
    return (
      <div className="page">
        <div className="empty-state">No route trend data for the selected filters.</div>
      </div>
    )
  }

  const subtitle =
    filters.routes.length > 0
      ? `${targets.length} selected route${targets.length > 1 ? 's' : ''}`
      : 'Top 4 routes by ridership in this period'

  return (
    <div className="page">
      <div className="routes-toolbar">
        <SegmentedControl
          value={filters.metric}
          options={METRIC_OPTIONS}
          onChange={(metric) => onFilterChange({ metric })}
          ariaLabel="Trend metric"
        />
        <div className="filter-toggles">
          <Switch label="7-day MA" checked={showMa} onChange={setShowMa} />
          <Switch label="Trend line" checked={showTrend} onChange={setShowTrend} />
          <Switch label="Shared Y" checked={sharedScale} onChange={setSharedScale} />
        </div>
      </div>

      <Card
        title={`${METRIC_OPTIONS.find((m) => m.value === filters.metric)?.label} over time`}
        subtitle={`${subtitle} \u00B7 ${filters.granularity} \u00B7 brush to set date range`}
      >
        <Chart
          option={mainOpt}
          height={400}
          group="trends"
          onEvent={{ brushselected: onBrush }}
        />
      </Card>

      {multiOpts.length > 1 && (
        <Card
          title="One panel per route"
          subtitle={`${yName} \u2014 ${sharedScale ? 'shared Y scale, so panel heights are comparable' : 'independent Y scales, so shapes are comparable but heights are not'}. Dashed line is the panel average.`}
        >
          <div className="trends-multiples">
            {multiOpts.map((m) => (
              <div key={m.code} className="trends-multi-cell">
                <div className="trends-multi-head">
                  <span className="trends-multi-label">{m.code}</span>
                  <span className="trends-multi-value">
                    {m.mean == null
                      ? '\u2014'
                      : `avg ${unit === '\u20B9' ? fmtMoney(m.mean) : unit === '%' ? `${m.mean.toFixed(1)}%` : fmtInt(m.mean)}`}
                  </span>
                </div>
                <Chart option={m.option} height={190} />
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}