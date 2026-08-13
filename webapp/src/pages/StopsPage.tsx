import { useMemo, useState } from 'react'
import type { EChartsOption } from 'echarts'
import {
  Chart,
  categoryAxis,
  heatmapMatrixOption,
  horizontalBarOption,
  markTarget,
  toolboxDefaults,
  valueAxis,
} from '../components/Chart'
import { StopMap, type Basemap, type StopMetric } from '../components/StopMap'
import {
  BreakdownDrawer,
  BreakdownTable,
  Button,
  Callout,
  Card,
  DataTable,
  Drawer,
  EmptyState,
  SegmentedControl,
  Select,
  StatCard,
  Switch,
  type Column,
} from '../components/ui'
import { aggregateStops, type StopAgg } from '../lib/aggregate'
import { applyFilters } from '../lib/filters'
import type { FilterState } from '../lib/filters'
import { fmtDateShort, fmtInt, fmtMoney, fmtPct } from '../lib/format'
import type { DashboardData, StopSequenceGeoRow } from '../types'

type StopRow = StopAgg & { net: number }

const axisLabelSmall = { color: '#6b7280', fontSize: 10, hideOverlap: true }

const METRIC_OPTIONS: { value: StopMetric; label: string }[] = [
  { value: 'boarding', label: 'Boarding' },
  { value: 'alighting', label: 'Alighting' },
  { value: 'net', label: 'Net' },
  { value: 'peak_load', label: 'Peak load' },
]

export function StopsPage({ data, filters }: { data: DashboardData; filters: FilterState }) {
  const [metric, setMetric] = useState<StopMetric>('peak_load')
  const [cluster, setCluster] = useState(true)
  const [heat, setHeat] = useState(false)
  const [basemap, setBasemap] = useState<Basemap>('streets')
  const [fitToken, setFitToken] = useState(0)
  const [selected, setSelected] = useState<StopRow | null>(null)
  const [drill, setDrill] = useState<'load' | 'stops' | null>(null)
  const isV2 = (data.meta?.schema_version ?? 1) >= 2

  const stops = useMemo(
    () => aggregateStops(applyFilters(data.stop_map, filters)),
    [data.stop_map, filters],
  )

  const stopRows = useMemo(
    () => stops.map((r) => ({ ...r, net: r.boarding - r.alighting })),
    [stops],
  )

  /**
   * Boarding and alighting is a separate feed from trip and revenue data and
   * often lags it. Coverage is derived from whatever stop_map is in the loaded
   * JSON, so another city's export with full stop coverage will not warn.
   */
  const coverage = useMemo(() => {
    const dates = [...new Set(data.stop_map.map((r) => r.service_date))].sort()
    const inRange = dates.filter((d) => d >= filters.range.start && d <= filters.range.end)
    const start = new Date(filters.range.start)
    const end = new Date(filters.range.end)
    const selectedDays = Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())
      ? inRange.length
      : Math.round((end.getTime() - start.getTime()) / 86400000) + 1
    return {
      dates,
      days: inRange.length,
      selectedDays,
      first: inRange[0] ?? dates[0] ?? '',
      last: inRange[inRange.length - 1] ?? dates[dates.length - 1] ?? '',
      availableFirst: dates[0] ?? '',
      availableLast: dates[dates.length - 1] ?? '',
      gap: selectedDays - inRange.length,
    }
  }, [data.stop_map, filters.range])

  /**
   * One circle per physical stop. The table keeps route-direction rows, but the
   * map was plotting the same coordinates many times and looked empty under
   * clustering when every point sat on top of another.
   */
  const mapStops = useMemo(() => {
    const byAbbr = new Map<string, {
      stop_abbr: string
      stop_name: string
      boarding: number
      alighting: number
      peak_load: number
      latitude: number
      longitude: number
    }>()
    for (const s of stopRows) {
      if (!Number.isFinite(s.latitude) || !Number.isFinite(s.longitude)) continue
      const e = byAbbr.get(s.stop_abbr)
      if (!e) {
        byAbbr.set(s.stop_abbr, {
          stop_abbr: s.stop_abbr,
          stop_name: s.stop_name,
          boarding: s.boarding,
          alighting: s.alighting,
          peak_load: s.peak_load,
          latitude: s.latitude,
          longitude: s.longitude,
        })
      } else {
        e.boarding += s.boarding
        e.alighting += s.alighting
        e.peak_load = Math.max(e.peak_load, s.peak_load)
      }
    }
    return [...byAbbr.values()]
  }, [stopRows])

  const polylines = useMemo(() => {
    if (!isV2 || !data.stop_sequence_geo?.length) return []
    const dirs = filters.directions.length > 0
      ? new Set(filters.directions)
      : null
    const byDir = new Map<string, StopSequenceGeoRow[]>()
    for (const r of data.stop_sequence_geo) {
      if (dirs && !dirs.has(r.route_direction_key)) continue
      const arr = byDir.get(r.route_direction_key) ?? []
      arr.push(r)
      byDir.set(r.route_direction_key, arr)
    }
    // Cap polylines to avoid painting every direction at once.
    const keys = [...byDir.keys()].slice(0, filters.directions.length > 0 ? 20 : 4)
    return keys.map((key) => {
      const pts = (byDir.get(key) ?? []).slice().sort((a, b) => a.stop_no - b.stop_no)
      return {
        route_direction_key: key,
        coords: pts.map((p) => [p.longitude, p.latitude] as [number, number]),
      }
    })
  }, [data.stop_sequence_geo, filters.directions, isV2])

  /**
   * Stop numbers only line up within one direction, so the profile charts are
   * always a single direction. Which directions are offered follows the route
   * and direction filters, so the panel moves with the rest of the page.
   */
  const dirOptions = useMemo(() => {
    const dirs = data.agency.route_directions
    const bySelection = filters.directions.length > 0
      ? dirs.filter((d) => filters.directions.includes(d))
      : dirs
    if (filters.routes.length === 0) return bySelection
    const routes = new Set(filters.routes)
    const scoped = bySelection.filter((d) => routes.has(d.slice(0, d.indexOf('-'))))
    return scoped.length > 0 ? scoped : bySelection
  }, [data.agency.route_directions, filters.directions, filters.routes])

  const [dirChoice, setDirChoice] = useState<string | null>(null)
  const activeDir = dirChoice && dirOptions.includes(dirChoice) ? dirChoice : dirOptions[0] ?? ''

  /**
   * The export keeps the busiest trip of each service day. Averaging those
   * across the selected days answers "what does a busy run look like now"
   * without letting one arbitrary day stand for the period.
   */
  const profile = useMemo(() => {
    if (!activeDir) return { direction: '', days: 0, rows: [] }
    const inRange = data.ba_line_best_trip.filter(
      (r) =>
        r.route_direction_key === activeDir &&
        r.service_date >= filters.range.start &&
        r.service_date <= filters.range.end,
    )
    if (inRange.length === 0) return { direction: activeDir, days: 0, rows: [] }
    const days = new Set(inRange.map((r) => r.service_date)).size
    const acc = new Map<number, { stop_no: number; stop_name: string; boarding: number; alighting: number; passenger_load: number }>()
    for (const r of inRange) {
      const e = acc.get(r.stop_no) ?? {
        stop_no: r.stop_no, stop_name: r.stop_name, boarding: 0, alighting: 0, passenger_load: 0,
      }
      e.boarding += r.boarding
      e.alighting += r.alighting
      e.passenger_load += r.passenger_load
      acc.set(r.stop_no, e)
    }
    const rows = [...acc.values()]
      .map((e) => ({
        ...e,
        boarding: Math.round((e.boarding / days) * 10) / 10,
        alighting: Math.round((e.alighting / days) * 10) / 10,
        passenger_load: Math.round((e.passenger_load / days) * 10) / 10,
      }))
      .sort((a, b) => a.stop_no - b.stop_no)
    return { direction: activeDir, days, rows }
  }, [data.ba_line_best_trip, activeDir, filters.range])

  const baRows = profile.rows
  const mlp = useMemo(() => {
    if (baRows.length === 0) return null
    return baRows.reduce((m, r) => (r.passenger_load > m.passenger_load ? r : m), baRows[0])
  }, [baRows])
  const totalB = stops.reduce((s, r) => s + r.boarding, 0)
  const totalA = stops.reduce((s, r) => s + r.alighting, 0)
  const maxLoad = stops.reduce((s, r) => Math.max(s, r.peak_load), 0)

  /**
   * Route and date slices only exist in exports that carry those columns.
   * Older files hold one network-wide table, and the panel says so rather than
   * silently ignoring the filters.
   */
  const odHasRoute = (data.od_top ?? []).some((r) => r.route_code != null)
  const odHasDate = (data.od_top ?? []).some((r) => r.service_date != null)
  const odHasWeek = (data.od_top ?? []).some((r) => r.week_start != null)
  const odScope = odHasDate
    ? 'Follows the route and date filters.'
    : odHasWeek
      ? 'Follows the route filter, and the date filter to the nearest week: every week that overlaps the selected dates is counted in full.'
      : odHasRoute
        ? 'Follows the route filter. Origin-destination pairs are stored per route for the whole dataset, so the date filter does not apply here.'
        : 'Network total for the whole dataset: this export has no route or date columns, so the filters above do not apply.'

  /** Every pair that survives the filters, busiest first. */
  const odPairs = useMemo(() => {
    const raw = data.od_top ?? []
    if (!odHasRoute && !odHasDate && !odHasWeek) return raw
    const routes = filters.routes.length > 0 ? new Set(filters.routes) : null
    const acc = new Map<string, { origin_abbr: string; destination_abbr: string; ridership: number; revenue: number }>()
    for (const r of raw) {
      if (r.service_date && (r.service_date < filters.range.start || r.service_date > filters.range.end)) continue
      // Weekly buckets count if any part of the week falls inside the range.
      if (r.week_start && r.week_end && (r.week_end < filters.range.start || r.week_start > filters.range.end)) continue
      if (routes && r.route_code && !routes.has(r.route_code)) continue
      const key = `${r.origin_abbr}|${r.destination_abbr}`
      const e = acc.get(key) ?? {
        origin_abbr: r.origin_abbr, destination_abbr: r.destination_abbr, ridership: 0, revenue: 0,
      }
      e.ridership += r.ridership
      e.revenue += r.revenue
      acc.set(key, e)
    }
    return [...acc.values()].sort((a, b) => b.ridership - a.ridership)
  }, [data.od_top, odHasRoute, odHasDate, odHasWeek, filters.routes, filters.range])

  const odRows = useMemo(() => odPairs.slice(0, 50), [odPairs])

  /**
   * The busiest origins against the busiest destinations. A matrix shows the
   * shape of the flow (radial, cross-town, one-directional) that a ranked
   * table of pairs cannot.
   */
  const odMatrix = useMemo(() => {
    if (odPairs.length === 0) return null
    const byOrigin = new Map<string, number>()
    const byDest = new Map<string, number>()
    for (const r of odPairs) {
      byOrigin.set(r.origin_abbr, (byOrigin.get(r.origin_abbr) ?? 0) + r.ridership)
      byDest.set(r.destination_abbr, (byDest.get(r.destination_abbr) ?? 0) + r.ridership)
    }
    const topN = (m: Map<string, number>, n: number) =>
      [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k)
    const origins = topN(byOrigin, 12)
    const dests = topN(byDest, 12)
    // Cells are drawn from every filtered pair, not just the ranked table's
    // top slice, or the grid reads as empty for anything outside the top few.
    const lookup = new Map(odPairs.map((r) => [`${r.origin_abbr}|${r.destination_abbr}`, r.ridership]))
    const cells: [number, number, number][] = []
    let shown = 0
    dests.forEach((d, x) => {
      origins.forEach((o, y) => {
        const v = lookup.get(`${o}|${d}`) ?? 0
        if (v > 0) shown += v
        cells.push([x, y, v])
      })
    })
    const total = odPairs.reduce((s, r) => s + r.ridership, 0)
    return { origins, dests, cells, share: total > 0 ? shown / total : 0, pairs: odPairs.length }
  }, [odPairs])

  const odMatrixOpt = useMemo((): EChartsOption | null => {
    if (!odMatrix) return null
    return {
      ...toolboxDefaults('stops-od-matrix'),
      ...heatmapMatrixOption(odMatrix.dests, odMatrix.origins, odMatrix.cells, {
        xName: 'Destination',
        yName: 'Origin',
      }),
    }
  }, [odMatrix])

  const odColumns: Column<(typeof odRows)[number]>[] = [
    { key: 'origin_abbr', header: 'Origin', numeric: false },
    { key: 'destination_abbr', header: 'Destination', numeric: false },
    { key: 'ridership', header: 'Ridership', align: 'right', bar: true, format: (v) => fmtInt(v as number) },
    { key: 'revenue', header: 'Revenue', align: 'right', format: (v) => fmtMoney(v as number) },
  ]

  const capacity = useMemo(() => {
    const caps = (data.vehicle_summary ?? [])
      .map((v) => v.veh_capacity)
      .filter((c): c is number => typeof c === 'number' && c > 0)
    if (caps.length === 0) return 40
    return Math.round(caps.reduce((a, b) => a + b, 0) / caps.length)
  }, [data.vehicle_summary])

  const loadOpt = useMemo((): EChartsOption => ({
    ...toolboxDefaults('stops-load-profile'),
    legend: { show: false },
    tooltip: {
      trigger: 'axis',
      formatter: (params: unknown) => {
        const p = Array.isArray(params) ? params[0] : params
        const idx = (p as { dataIndex: number }).dataIndex
        const row = baRows[idx]
        if (!row) return ''
        return `<strong>${row.stop_name}</strong><br/>Stop ${row.stop_no}<br/>Load: ${row.passenger_load.toFixed(1)} pax`
      },
    },
    xAxis: {
      ...categoryAxis(),
      data: baRows.map((r) => `${r.stop_no}. ${r.stop_name}`),
      axisLabel: { ...axisLabelSmall, rotate: 32 },
    },
    yAxis: valueAxis('Passengers on board'),
    series: [
      {
        name: 'Load',
        type: 'line',
        data: baRows.map((r) => r.passenger_load),
        smooth: true,
        areaStyle: { color: 'rgba(27,122,78,0.10)' },
        itemStyle: { color: '#1B7A4E' },
        symbolSize: 7,
        ...markTarget(capacity, `Capacity ${capacity}`),
      },
    ],
  }), [baRows, capacity])

  const baOpt = useMemo((): EChartsOption => ({
    ...toolboxDefaults('stops-boarding-alighting'),
    legend: { data: ['Boarding', 'Alighting'] },
    tooltip: {
      trigger: 'axis',
      formatter: (params: unknown) => {
        const arr = params as Array<{ dataIndex: number }>
        const row = baRows[arr[0]?.dataIndex ?? 0]
        if (!row) return ''
        return `<strong>${row.stop_name}</strong><br/>Stop ${row.stop_no}<br/>Boarding: ${row.boarding.toFixed(1)} pax/trip<br/>Alighting: ${row.alighting.toFixed(1)} pax/trip`
      },
    },
    xAxis: {
      ...categoryAxis(),
      data: baRows.map((r) => `${r.stop_no}. ${r.stop_name}`),
      axisLabel: { ...axisLabelSmall, rotate: 32 },
    },
    yAxis: {
      ...valueAxis('Passengers per trip'),
      axisLabel: { color: '#6b7280', fontSize: 11, formatter: (v: number) => String(Math.abs(v)) },
    },
    series: [
      { name: 'Boarding', type: 'bar', stack: 'ba', data: baRows.map((r) => r.boarding), itemStyle: { color: '#1B7A4E' }, barMaxWidth: 22 },
      { name: 'Alighting', type: 'bar', stack: 'ba', data: baRows.map((r) => -r.alighting), itemStyle: { color: '#DC2626' }, barMaxWidth: 22 },
    ],
  }), [baRows])

  const topBoardingOpt = useMemo((): EChartsOption => {
    const top = [...stopRows].sort((a, b) => b.boarding - a.boarding).slice(0, 20)
    return {
      ...toolboxDefaults('stops-top-boarding'),
      ...horizontalBarOption(
        top.map((r) => ({ name: r.stop_abbr || r.stop_name, value: r.boarding })),
        'pax',
        { showAverage: true },
      ),
    }
  }, [stopRows])

  const columns: Column<StopRow>[] = useMemo(
    () => [
      { key: 'stop_name', header: 'Stop', numeric: false },
      { key: 'stop_abbr', header: 'Abbr', numeric: false },
      { key: 'boarding', header: 'Boarding', align: 'right', bar: true, format: (v) => fmtInt(v as number) },
      { key: 'alighting', header: 'Alighting', align: 'right', format: (v) => fmtInt(v as number) },
      {
        key: 'net',
        header: 'Net',
        align: 'right',
        format: (v) => fmtInt(v as number),
        threshold: (v) => (v > 0 ? 'good' : v < 0 ? 'bad' : 'warn'),
      },
      { key: 'peak_load', header: 'Peak Load', align: 'right', format: (v) => fmtInt(v as number) },
      { key: 'days', header: 'Days', align: 'right', format: (v) => fmtInt(v as number) },
    ],
    [],
  )

  const periodLabel = coverage.days > 0
    ? `${coverage.days} day${coverage.days === 1 ? '' : 's'} of stop data, ${fmtDateShort(coverage.first)} to ${fmtDateShort(coverage.last)}`
    : `${filters.range.start} to ${filters.range.end}`
  const routeShare = selected && totalB > 0 ? selected.boarding / totalB : null

  return (
    <div className="page">
      {coverage.gap > 0 && (
        <Callout tone="warn" title="Stop data covers part of the selected range">
          Boarding and alighting were recorded on {coverage.days} of the {coverage.selectedDays} days
          you selected
          {coverage.days > 0 ? `, ${fmtDateShort(coverage.first)} to ${fmtDateShort(coverage.last)}` : ''}.
          Every figure on this page comes from those days. Trips, revenue, and load factor elsewhere in
          the dashboard cover the full range.
        </Callout>
      )}
      <div className="kpi-grid">
        <StatCard
          label="Boardings"
          value={fmtInt(totalB)}
          sub={periodLabel}
          onClick={() => setDrill('stops')}
          drillLabel="Stop ranking"
        />
        <StatCard
          label="Alightings"
          value={fmtInt(totalA)}
          sub={periodLabel}
          onClick={() => setDrill('stops')}
          drillLabel="Stop ranking"
        />
        <StatCard
          label="Peak load"
          value={fmtInt(maxLoad)}
          sub={`Highest single-stop load · ${periodLabel}`}
          onClick={baRows.length > 0 ? () => setDrill('load') : undefined}
          drillLabel="Load profile"
        />
        <StatCard
          label="Active stops"
          value={String(stops.length)}
          sub={periodLabel}
          onClick={() => setDrill('stops')}
          drillLabel="Stop ranking"
        />
      </div>

      <Card title="Stop activity map" subtitle="Circle size follows the selected metric">
        <div className="stops-map-toolbar">
          <SegmentedControl
            value={metric}
            options={METRIC_OPTIONS}
            onChange={setMetric}
            ariaLabel="Map metric"
          />
          <Select
            label="Basemap"
            value={basemap}
            options={[
              { value: 'streets', label: 'Streets (OSM)' },
              { value: 'positron', label: 'Light (vector)' },
              { value: 'dark', label: 'Dark (vector)' },
              { value: 'none', label: 'No basemap' },
            ]}
            onChange={(v) => setBasemap(v as Basemap)}
          />
          <div className="filter-toggles">
            <Switch label="Clusters" checked={cluster} onChange={setCluster} />
            <Switch label="Heat" checked={heat} onChange={setHeat} />
          </div>
          <Button variant="secondary" onClick={() => setFitToken((n) => n + 1)}>Fit to stops</Button>
        </div>
        {stops.length > 0 ? (
          <StopMap
            stops={mapStops}
            height={480}
            metric={metric}
            cluster={cluster}
            heat={heat}
            basemap={basemap}
            polylines={polylines}
            fitToken={fitToken}
            onStopClick={(s) => {
              const row = stopRows.find((r) => r.stop_abbr === s.stop_abbr)
              if (row) setSelected(row)
            }}
          />
        ) : (
          <EmptyState>No stop data for this filter selection.</EmptyState>
        )}
        {!isV2 && (
          <p className="ops-footnote">Route lines on the map need a complete data upload.</p>
        )}
      </Card>

      {stopRows.length > 0 && (
        <Card
          title="Top 20 boarding stops"
          subtitle={periodLabel}
          onDrill={() => setDrill('stops')}
        >
          <Chart option={topBoardingOpt} height={Math.min(560, 40 + stopRows.length * 22)} group="stops" />
        </Card>
      )}

      {dirOptions.length > 0 && (
        <>
          <Card
            title="Passenger load along the route"
            subtitle={
              mlp
                ? `Average of the busiest trip on each of ${profile.days} service ${profile.days === 1 ? 'day' : 'days'}. Peak load ${fmtInt(mlp.passenger_load)} at stop ${mlp.stop_no} (${mlp.stop_name}).`
                : `Average of the busiest trip on each service day in ${periodLabel}.`
            }
            action={
              <Select
                label="Direction"
                value={activeDir}
                options={dirOptions.map((d) => ({ value: d, label: d }))}
                onChange={setDirChoice}
              />
            }
            onDrill={baRows.length > 0 ? () => setDrill('load') : undefined}
            drillLabel="Stop by stop"
          >
            <Chart option={loadOpt} height={320} group="stops" empty={baRows.length === 0} />
          </Card>
          <Card
            title="Boarding and alighting per stop"
            subtitle={`One direction at a time: ${activeDir}, all ${baRows.length} stops in sequence. Boarding sits above the line and alighting below, in passengers per trip averaged over ${profile.days} service ${profile.days === 1 ? 'day' : 'days'}.`}
            action={
              <Select
                label="Direction"
                value={activeDir}
                options={dirOptions.map((d) => ({ value: d, label: d }))}
                onChange={setDirChoice}
              />
            }
          >
            <Chart option={baOpt} height={340} group="stops" empty={baRows.length === 0} />
          </Card>
        </>
      )}

      {odMatrixOpt && odMatrix && (
        <Card
          title="Origin to destination flows"
          subtitle={`The ${odMatrix.origins.length} busiest origins against the ${odMatrix.dests.length} busiest destinations, holding ${fmtPct(odMatrix.share)} of the ${fmtInt(odMatrix.pairs)} filtered pairs. Blank cells carry no recorded passengers. ${odScope}`}
        >
          <Chart option={odMatrixOpt} height={Math.max(280, 120 + odMatrix.origins.length * 24)} />
        </Card>
      )}

      {odRows.length > 0 && (
        <Card
          title="Top origin to destination pairs"
          subtitle={`Top 50 pairs from ETM ticket origins and destinations. ${odScope}`}
        >
          <DataTable
            rows={odRows}
            columns={odColumns}
            initialSort={{ key: 'ridership', dir: 'desc' }}
            pageSize={15}
            searchable
            exportName="od-top"
            rowKey={(r) => `${r.origin_abbr}-${r.destination_abbr}`}
          />
        </Card>
      )}

      {stops.length > 0 && (
        <Card title="Stop details" subtitle="Click a row for the stop drawer">
          <DataTable
            rows={stopRows}
            columns={columns}
            initialSort={{ key: 'boarding', dir: 'desc' }}
            pageSize={20}
            searchable
            exportName="stop-details"
            rowKey={(r) => r.route_direction_key + r.stop_abbr}
            onRowClick={setSelected}
          />
        </Card>
      )}

      <Drawer
        open={selected != null}
        onClose={() => setSelected(null)}
        title={selected?.stop_name ?? ''}
        subtitle={selected?.stop_abbr}
      >
        {selected && (
          <dl className="ops-grid">
            <div>
              <dt className="ops-item-label">Boarding</dt>
              <dd className="ops-item-value">{fmtInt(selected.boarding)}</dd>
            </div>
            <div>
              <dt className="ops-item-label">Alighting</dt>
              <dd className="ops-item-value">{fmtInt(selected.alighting)}</dd>
            </div>
            <div>
              <dt className="ops-item-label">Net</dt>
              <dd className="ops-item-value">{fmtInt(selected.net)}</dd>
            </div>
            <div>
              <dt className="ops-item-label">Peak load</dt>
              <dd className="ops-item-value">{fmtInt(selected.peak_load)}</dd>
            </div>
            <div>
              <dt className="ops-item-label">Share of boardings</dt>
              <dd className="ops-item-value">
                {routeShare != null ? `${(routeShare * 100).toFixed(1)}%` : '\u2014'}
              </dd>
            </div>
            <div>
              <dt className="ops-item-label">Direction</dt>
              <dd className="ops-item-value ops-item-value-sm">{selected.route_direction_key}</dd>
            </div>
          </dl>
        )}
      </Drawer>

      <BreakdownDrawer
        open={drill === 'load'}
        onClose={() => setDrill(null)}
        title="Load profile, stop by stop"
        subtitle={`${profile.direction} \u2014 average of the busiest trip on each of ${profile.days} service ${profile.days === 1 ? 'day' : 'days'}`}
        width={620}
        stats={[
          {
            label: 'Maximum load point',
            value: mlp ? `Stop ${mlp.stop_no}` : '\u2014',
            hint: mlp?.stop_name,
          },
          { label: 'Load there', value: mlp ? fmtInt(mlp.passenger_load) : '\u2014', hint: `Capacity ${capacity}` },
          {
            label: 'Stops over capacity',
            value: String(baRows.filter((r) => r.passenger_load > capacity).length),
            hint: `of ${baRows.length} stops`,
          },
        ]}
        note="The maximum load point is where a route's capacity is actually set. Short-turning or adding a trip that covers only this section is usually cheaper than running extra full-length trips."
      >
        <BreakdownTable
          columns={[
            { key: 'stop', label: 'Stop' },
            { key: 'boarding', label: 'Boarding', align: 'right' },
            { key: 'alighting', label: 'Alighting', align: 'right' },
            { key: 'load', label: 'Load', align: 'right' },
          ]}
          rows={baRows.map((r) => ({
            __key: `${r.stop_no}-${r.stop_name}`,
            stop: `${r.stop_no}. ${r.stop_name}`,
            boarding: fmtInt(r.boarding),
            alighting: fmtInt(r.alighting),
            load: `${fmtInt(r.passenger_load)}${r.passenger_load > capacity ? ' \u26A0' : ''}`,
          }))}
        />
      </BreakdownDrawer>

      <BreakdownDrawer
        open={drill === 'stops'}
        onClose={() => setDrill(null)}
        title="Stop activity"
        subtitle={periodLabel}
        width={600}
        stats={[
          { label: 'Boardings', value: fmtInt(totalB) },
          { label: 'Active stops', value: String(stops.length) },
          {
            label: 'Top 10 stop share',
            value:
              totalB > 0
                ? `${(([...stopRows].sort((a, b) => b.boarding - a.boarding).slice(0, 10).reduce((s, r) => s + r.boarding, 0) / totalB) * 100).toFixed(1)}%`
                : '\u2014',
            hint: 'Of all boardings',
          },
        ]}
        note="Where a handful of stops carry most boardings, shelter, queue management and ticketing capacity at those stops affect the whole network's dwell time."
      >
        <BreakdownTable
          columns={[
            { key: 'stop', label: 'Stop' },
            { key: 'boarding', label: 'Boarding', align: 'right' },
            { key: 'share', label: 'Share', align: 'right' },
            { key: 'net', label: 'Net', align: 'right' },
          ]}
          rows={[...stopRows]
            .sort((a, b) => b.boarding - a.boarding)
            .slice(0, 20)
            .map((r) => ({
              __key: r.route_direction_key + r.stop_abbr,
              stop: r.stop_name,
              boarding: fmtInt(r.boarding),
              share: totalB > 0 ? `${((r.boarding / totalB) * 100).toFixed(1)}%` : '\u2014',
              net: fmtInt(r.net),
            }))}
        />
      </BreakdownDrawer>
    </div>
  )
}