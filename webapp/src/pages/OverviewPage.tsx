import { useMemo, useState } from 'react'
import type { EChartsOption } from 'echarts'
import {
  Chart,
  calendarHeatmapOption,
  kpiBulletOption,
  rankedShareBarOption,
  stackedPanelsOption,
  stackedShareBarOption,
  toolboxDefaults,
  zoomDefaults,
} from '../components/Chart'
import {
  BreakdownDrawer,
  BreakdownTable,
  Button,
  Callout,
  Card,
  EmptyState,
  InfoTip,
  ListRow,
  StatCard,
  StatusBadge,
} from '../components/ui'
import { aggregateDaily, aggregateRoutes, periodTotals } from '../lib/aggregate'
import { applyFilters, splitByComparison } from '../lib/filters'
import type { FilterState } from '../lib/filters'
import { fmtDateShort, fmtDelta, fmtInt, fmtMoney, fmtPct, fmtWeekday } from '../lib/format'
import { usePrefs } from '../lib/prefs'
import type { DashboardData, KpiDailyRow, Page } from '../types'
import { getDefinition } from '../lib/definitions'
import type { DefinitionKey as DefKey } from '../lib/definitions'

type OpsItem = { key: DefKey; label: string; value: string }

type DrillKey =
  | 'ridership'
  | 'revenue'
  | 'lf'
  | 'trips'
  | 'timeline'
  | 'calendar'
  | 'revenue-share'
  | 'gender'
  | 'top-routes'
  | 'ops'
  | 'health'
  | null

function meanKpi(rows: KpiDailyRow[], key: keyof KpiDailyRow): number | null {
  const vals = rows
    .map((r) => r[key])
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
  if (vals.length === 0) return null
  return vals.reduce((a, b) => a + b, 0) / vals.length
}

function fmtOrDash(n: number | null, fmt: (v: number) => string): string {
  return n == null ? '\u2014' : fmt(n)
}

export function OverviewPage({
  data,
  filters,
  onUploadClick,
  onNavigate,
}: {
  data: DashboardData
  filters: FilterState
  onUploadClick: () => void
  onNavigate: (page: Page, patch?: Partial<FilterState>) => void
}) {
  const [prefs] = usePrefs()
  const [drill, setDrill] = useState<DrillKey>(null)
  const minDate = data.agency.date_min
  const isV2 = (data.meta?.schema_version ?? 1) >= 2
  const lfTarget = prefs.targets.lf

  const { current, comparison, comparisonRange } = useMemo(
    () => splitByComparison(data.daily, filters, { min: minDate }),
    [data.daily, filters, minDate],
  )

  const totals = useMemo(() => periodTotals(current), [current])
  const prevTotals = useMemo(() => (comparison ? periodTotals(comparison) : null), [comparison])
  const series = useMemo(() => aggregateDaily(current, filters.granularity), [current, filters.granularity])

  const routeRows = useMemo(
    () => aggregateRoutes(applyFilters(data.route_trend, filters)),
    [data.route_trend, filters],
  )

  const topRoutes = useMemo(() => {
    const total = routeRows.reduce((s, r) => s + r.ridership, 0)
    return routeRows.slice(0, 5).map((r) => ({
      ...r,
      share: total > 0 ? (r.ridership / total) * 100 : 0,
    }))
  }, [routeRows])

  const revenueShare = useMemo(
    () =>
      routeRows
        .filter((r) => r.revenue > 0)
        .sort((a, b) => b.revenue - a.revenue)
        .map((r) => ({ name: r.route_code, value: r.revenue })),
    [routeRows],
  )

  /** Best and worst bucket in view: a single LF number hides how uneven the month was. */
  const lfSpread = useMemo(() => {
    const vals = series.map((b) => b.lf).filter((v) => Number.isFinite(v) && v > 0)
    if (vals.length < 2) return null
    const min = Math.min(...vals)
    const max = Math.max(...vals)
    return max - min > 0.005 ? { min, max } : null
  }, [series])

  const kpiInRange = useMemo(() => {
    if (!data.kpi_daily?.length) return [] as KpiDailyRow[]
    const start = filters.range.start
    const end = filters.range.end
    return data.kpi_daily.filter((r) => {
      const d = r.service_date
      if (!d) return false
      return d >= start && d <= end
    })
  }, [data.kpi_daily, filters.range])

  const ops: OpsItem[] = useMemo(() => {
    const epkm = isV2 ? meanKpi(kpiInRange, 'EPKM') : null
    const epb = isV2 ? meanKpi(kpiInRange, 'EPB') : null
    const headway = isV2 ? meanKpi(kpiInRange, 'headway_mins') : null
    return [
      {
        key: 'atl',
        label: 'Average trip length (ATL)',
        value: `${totals.atl.toFixed(2)} km`,
      },
      { key: 'fare_yield', label: 'Fare yield per passenger', value: fmtMoney(totals.fareYield, { dp: 2 }) },
      {
        key: 'epkm',
        label: 'Earnings per km (EPKM)',
        value: fmtOrDash(epkm, (v) => fmtMoney(v, { dp: 2 })),
      },
      {
        key: 'epb',
        label: 'Earnings per bus (EPB)',
        value: fmtOrDash(epb, (v) => fmtMoney(v, { compact: (epb ?? 0) >= 1e5 })),
      },
      {
        key: 'trips_per_bus',
        label: 'Trips per bus',
        value: totals.tripsPerBus > 0 ? totals.tripsPerBus.toFixed(1) : '\u2014',
      },
      {
        key: 'headway',
        label: 'Average headway',
        value: fmtOrDash(headway, (v) => `${v.toFixed(1)} min`),
      },
    ]
  }, [totals, isV2, kpiInRange])

  const calendarOpt = useMemo((): EChartsOption => {
    const days = current.map((d) => ({ date: d.service_date, value: d.ridership }))
    const start = current[0]?.service_date ?? filters.range.start
    const end = current[current.length - 1]?.service_date ?? filters.range.end
    return calendarHeatmapOption(days, [start, end])
  }, [current, filters.range])

  const anomalies = useMemo(() => {
    if (current.length < 5) return [] as { date: string; z: number; ridership: number }[]
    const byDow = new Map<number, number[]>()
    for (const d of current) {
      const wd = new Date(`${d.service_date}T00:00:00Z`).getUTCDay()
      const arr = byDow.get(wd) ?? []
      arr.push(d.ridership)
      byDow.set(wd, arr)
    }
    const stats = new Map<number, { mean: number; sd: number }>()
    for (const [wd, vals] of byDow) {
      if (vals.length < 2) continue
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length
      const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length)
      if (sd > 0) stats.set(wd, { mean, sd })
    }
    const out: { date: string; z: number; ridership: number }[] = []
    for (const d of current) {
      const wd = new Date(`${d.service_date}T00:00:00Z`).getUTCDay()
      const s = stats.get(wd)
      if (!s) continue
      const z = (d.ridership - s.mean) / s.sd
      if (Math.abs(z) >= 2) out.push({ date: d.service_date, z, ridership: d.ridership })
    }
    return out.sort((a, b) => Math.abs(b.z) - Math.abs(a.z)).slice(0, 5)
  }, [current])

  const genderShare = useMemo(() => {
    if (!data.feature_gates?.gender_charts) return [] as { name: string; value: number }[]
    let male = 0
    let female = 0
    for (const d of current) {
      male += d.male_ridership || 0
      female += d.female_ridership || 0
    }
    const total = male + female
    if (total <= 0) return []
    return [
      { name: 'Male', value: male },
      { name: 'Female', value: female },
    ]
  }, [current, data.feature_gates])

  const baCoverage = useMemo(() => {
    const rules = data.meta?.dq_rules ?? []
    const miss = rules.find((r) => r.id === 'ticket_dates_missing_sequence')
    const missing = Array.isArray(miss?.value) ? miss.value.length : 0
    const totalDays = data.daily.length || 1
    const covered = Math.max(0, totalDays - missing)
    return { covered, totalDays, pct: covered / totalDays }
  }, [data.meta, data.daily])

  const revenueShareOpt = useMemo(
    (): EChartsOption => rankedShareBarOption(revenueShare, { unit: 'money', valueName: 'Revenue' }),
    [revenueShare],
  )

  const genderOpt = useMemo(
    (): EChartsOption => stackedShareBarOption(genderShare),
    [genderShare],
  )

  const comboOpt = useMemo((): EChartsOption => {
    const ridership = series.map((b) => b.ridership)
    const ma =
      filters.granularity === 'daily' && ridership.length >= 7
        ? ridership.map((_, i) => {
            if (i < 6) return null
            const window = ridership.slice(i - 6, i + 1)
            return Math.round(window.reduce((a, b) => a + b, 0) / 7)
          })
        : null
    return {
      ...toolboxDefaults('overview-ridership-revenue'),
      // Both panels share the date axis, so the zoom has to move them together.
      ...zoomDefaults({ xAxisIndex: [0, 1] }),
      ...stackedPanelsOption({
        labels: series.map((b) => b.label),
        top: {
          name: 'Ridership',
          values: ridership,
          color: '#1B7A4E',
          unit: 'pax',
          ...(ma ? { overlay: { name: '7-day average', values: ma } } : {}),
        },
        bottom: { name: 'Revenue', values: series.map((b) => b.revenue), color: '#2F9E6A', unit: '\u20B9' },
        rotateLabels: filters.granularity === 'daily',
        showValues: filters.showValues,
      }),
    }
  }, [series, filters.granularity, filters.showValues])

  const lfBulletOpt = useMemo(
    (): EChartsOption =>
      kpiBulletOption({
        actual: totals.lf,
        target: lfTarget,
        max: Math.max(lfTarget, lfSpread?.max ?? totals.lf) * 1.1,
        range: lfSpread ?? undefined,
        format: (v) => fmtPct(v),
        targetLabel: `Target ${(lfTarget * 100).toFixed(0)}%`,
      }),
    [totals.lf, lfTarget, lfSpread],
  )

  /** Daily load factor, sorted, so best and worst service days are one hop away. */
  const lfDays = useMemo(() => {
    const rows = current
      .map((d) => ({
        date: d.service_date,
        lf: d.capacity_km > 0 ? d.pax_km / d.capacity_km : 0,
        ridership: d.ridership,
      }))
      .filter((r) => r.lf > 0)
      .sort((a, b) => b.lf - a.lf)
    return {
      rows,
      aboveTarget: rows.filter((r) => r.lf >= lfTarget).length,
    }
  }, [current, lfTarget])

  const byWeekday = useMemo(() => {
    const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    const acc = new Map<number, { days: number; ridership: number; revenue: number; pax_km: number; capacity_km: number }>()
    for (const d of current) {
      const wd = new Date(`${d.service_date}T00:00:00Z`).getUTCDay()
      const e = acc.get(wd) ?? { days: 0, ridership: 0, revenue: 0, pax_km: 0, capacity_km: 0 }
      e.days += 1
      e.ridership += d.ridership || 0
      e.revenue += d.revenue || 0
      e.pax_km += d.pax_km || 0
      e.capacity_km += d.capacity_km || 0
      acc.set(wd, e)
    }
    return [...acc.entries()]
      .sort((a, b) => ((a[0] + 6) % 7) - ((b[0] + 6) % 7))
      .map(([wd, e]) => ({
        name: names[wd],
        days: e.days,
        avgRidership: e.ridership / Math.max(e.days, 1),
        avgRevenue: e.revenue / Math.max(e.days, 1),
        lf: e.capacity_km > 0 ? e.pax_km / e.capacity_km : 0,
      }))
  }, [current])

  const rankedDays = useMemo(
    () => [...current].sort((a, b) => b.ridership - a.ridership),
    [current],
  )

  const dayTypeSplit = useMemo(() => {
    const acc = { week: { days: 0, ridership: 0, revenue: 0 }, end: { days: 0, ridership: 0, revenue: 0 } }
    for (const d of current) {
      const wd = new Date(`${d.service_date}T00:00:00Z`).getUTCDay()
      const bucket = wd === 0 || wd === 6 ? acc.end : acc.week
      bucket.days += 1
      bucket.ridership += d.ridership || 0
      bucket.revenue += d.revenue || 0
    }
    return {
      weekdayAvg: acc.week.days > 0 ? acc.week.ridership / acc.week.days : 0,
      weekendAvg: acc.end.days > 0 ? acc.end.ridership / acc.end.days : 0,
      weekdayDays: acc.week.days,
      weekendDays: acc.end.days,
    }
  }, [current])

  if (current.length === 0) {
    return (
      <div className="page">
        <EmptyState
          title="No service days in the selected period"
          action={{ label: 'Upload Data', onClick: onUploadClick }}
        >
          Widen the date range, clear route filters, or upload a fresh dataset.
        </EmptyState>
      </div>
    )
  }

  const cmpLabel = comparisonRange
    ? `vs previous ${totals.days} days${comparisonRange.partial ? ' (partial)' : ''}`
    : null
  const trendOf = (cur: number, prev: number | undefined) => {
    const d = cmpLabel ? fmtDelta(cur, prev) : null
    return d ? { up: d.up, label: `${d.label} ${cmpLabel}` } : undefined
  }

  const gateEntries = Object.entries(data.feature_gates)
  const generatedAt = data.meta?.generated_at
  const loadOk = data.meta?.load_ok

  return (
    <div className="page">
      {isV2 && loadOk === false && (
        <Callout tone="warn" title="Data quality gate failed">
          The last load reported load_ok=false. Review Data Quality after re-upload.
        </Callout>
      )}

      {anomalies.length > 0 && (
        <Callout tone="warn" title="Unusual days (2+ standard deviations from the same weekday)">
          {anomalies
            .map((a) => `${a.date}: ${a.z >= 0 ? '+' : ''}${a.z.toFixed(1)}σ (${fmtInt(a.ridership)} pax)`)
            .join(' · ')}
        </Callout>
      )}

      <div className="bento-kpi">
        <StatCard
          variant="primary"
          label="Ridership"
          value={fmtInt(totals.ridership)}
          sub={`${totals.days} service days \u00B7 ${fmtInt(Math.round(totals.ridership / Math.max(totals.days, 1)))} passengers/day`}
          trend={trendOf(totals.ridership, prevTotals?.ridership)}
          definitionKey="ridership"
          spark={series.map((b) => b.ridership)}
          onClick={() => setDrill('ridership')}
          drillLabel="Daily breakdown"
        />
        <StatCard
          label="Revenue"
          value={fmtMoney(totals.revenue, { compact: totals.revenue >= 1e5 })}
          sub={`${fmtMoney(totals.revenue / Math.max(totals.days, 1), { compact: totals.revenue / Math.max(totals.days, 1) >= 1e5 })}/day \u00B7 ${fmtMoney(totals.fareYield, { dp: 2 })} per passenger`}
          trend={trendOf(totals.revenue, prevTotals?.revenue)}
          definitionKey="revenue"
          spark={series.map((b) => b.revenue)}
          onClick={() => setDrill('revenue')}
          drillLabel="Route revenue"
        />
        <StatCard
          label="Load factor (LF)"
          value={fmtPct(totals.lf)}
          sub={
            lfSpread
              ? `Passenger-km / capacity-km \u00B7 range ${fmtPct(lfSpread.min)}\u2013${fmtPct(lfSpread.max)}`
              : 'Passenger-km / capacity-km'
          }
          trend={trendOf(totals.lf, prevTotals?.lf)}
          definitionKey="lf"
          target={{
            value: lfTarget,
            current: totals.lf,
            label: `Target ${(lfTarget * 100).toFixed(0)}%`,
          }}
          spark={series.map((b) => b.lf)}
          onClick={() => setDrill('lf')}
          drillLabel="Daily load factors"
        />
        <StatCard
          label="Service trips"
          value={fmtInt(totals.trips)}
          sub={`${fmtInt(Math.round(totals.busesPerDay))} buses/day \u00B7 ${totals.tripsPerBus.toFixed(1)} trips per bus`}
          trend={trendOf(totals.trips, prevTotals?.trips)}
          definitionKey="trips_per_bus"
          spark={series.map((b) => b.trips)}
          onClick={() => setDrill('trips')}
          drillLabel="Route service"
        />
      </div>

      <div className="bento-mid">
        <Card
          title="Ridership and revenue over time"
          subtitle={`Shared date axis · ${filters.granularity}`}
          onDrill={() => setDrill('timeline')}
          drillLabel="Day detail"
        >
          <Chart option={comboOpt} height={340} group="overview" empty={series.length === 0} />
        </Card>
        <Card
          title="Load factor (LF) against target"
          subtitle={
            lfSpread
              ? `The bar is the period average and the green band is the daily range, ${fmtPct(lfSpread.min)} to ${fmtPct(lfSpread.max)}.`
              : `Period average against the ${(lfTarget * 100).toFixed(0)}% target`
          }
          onDrill={() => setDrill('lf')}
        >
          <Chart option={lfBulletOpt} height={132} group="overview" />
          <div className="overview-lf-facts">
            <ListRow
              title="Days at or above target"
              meta={`${lfDays.aboveTarget} of ${lfDays.rows.length} service days`}
              badge={
                <StatusBadge tone={lfDays.aboveTarget * 2 >= lfDays.rows.length ? 'up' : 'down'}>
                  {fmtPct(lfDays.aboveTarget / Math.max(lfDays.rows.length, 1))}
                </StatusBadge>
              }
            />
            {lfDays.rows.length > 0 && (
              <>
                <ListRow
                  title="Best day"
                  meta={lfDays.rows[0].date}
                  badge={<StatusBadge tone="up">{fmtPct(lfDays.rows[0].lf)}</StatusBadge>}
                />
                <ListRow
                  title="Weakest day"
                  meta={lfDays.rows[lfDays.rows.length - 1].date}
                  badge={<StatusBadge tone="down">{fmtPct(lfDays.rows[lfDays.rows.length - 1].lf)}</StatusBadge>}
                />
              </>
            )}
          </div>
        </Card>
      </div>

      <div className="bento-bottom">
        <Card
          title="Service calendar"
          subtitle="Daily ridership, darker means busier"
          onDrill={() => setDrill('calendar')}
          drillLabel="By weekday"
        >
          <Chart option={calendarOpt} height={320} empty={current.length === 0} />
        </Card>
        <Card
          title="Revenue share by route"
          subtitle={`All ${revenueShare.length} routes \u00B7 ranked, with share of period revenue`}
          onDrill={() => setDrill('revenue-share')}
        >
          <Chart
            option={revenueShareOpt}
            height={Math.max(200, 28 + revenueShare.length * 26)}
            empty={revenueShare.length === 0}
          />
        </Card>
        {genderShare.length > 0 ? (
          <Card
            title="Gender mix"
            subtitle="Share of ticketed passengers"
            onDrill={() => setDrill('gender')}
          >
            <Chart option={genderOpt} height={140} />
          </Card>
        ) : (
          <Card
            title="Top routes"
            subtitle="By ridership. Click a route to open Trends"
            onDrill={() => setDrill('top-routes')}
          >
            {topRoutes.length > 0 ? (
              topRoutes.map((r) => (
                <ListRow
                  key={r.route_code}
                  title={r.route_code}
                  meta={`${fmtInt(r.ridership)} riders \u00B7 ${fmtPct(r.lf)} load factor`}
                  badge={<StatusBadge tone="neutral">{r.share.toFixed(1)}%</StatusBadge>}
                  onClick={() => onNavigate('trends', { routes: [r.route_code] })}
                />
              ))
            ) : (
              <div className="empty-state">No route data in the selected period.</div>
            )}
          </Card>
        )}
      </div>

      {genderShare.length > 0 && (
        <Card
          title="Top routes"
          subtitle="By ridership. Click a route to open Trends"
          onDrill={() => setDrill('top-routes')}
        >
          {topRoutes.length > 0 ? (
            topRoutes.map((r) => (
              <ListRow
                key={r.route_code}
                title={r.route_code}
                meta={`${fmtInt(r.ridership)} riders \u00B7 ${fmtPct(r.lf)} load factor`}
                badge={<StatusBadge tone="neutral">{r.share.toFixed(1)}%</StatusBadge>}
                onClick={() => onNavigate('trends', { routes: [r.route_code] })}
              />
            ))
          ) : (
            <div className="empty-state">No route data in the selected period.</div>
          )}
        </Card>
      )}

      <div className="bento-footer">
        <Card
          title="Operating snapshot"
          subtitle={isV2 ? 'Period totals and daily averages' : 'Period totals'}
          onDrill={() => setDrill('ops')}
          drillLabel="How these are built"
        >
          <dl className="ops-grid">
            {ops.map((item) => (
              <div key={item.key}>
                <dt className="ops-item-label">
                  <span>{item.label}</span>
                  <InfoTip definitionKey={item.key} />
                </dt>
                <dd className="ops-item-value">{item.value}</dd>
              </div>
            ))}
          </dl>
          {!isV2 && (
            <p className="ops-footnote">
              Re-run the data export for earnings per km, earnings per bus, and headway.
            </p>
          )}
        </Card>

        <Card title="Data health" onDrill={() => setDrill('health')} drillLabel="Checks">
          <dl className="ops-grid">
            <div>
              <dt className="ops-item-label">Dataset range</dt>
              <dd className="ops-item-value ops-item-value-sm">
                {data.agency.date_min} — {data.agency.date_max}
              </dd>
            </div>
            <div>
              <dt className="ops-item-label">Days in view</dt>
              <dd className="ops-item-value">{totals.days} of {data.daily.length}</dd>
            </div>
            <div>
              <dt className="ops-item-label">Stop-sequence coverage</dt>
              <dd className="ops-item-value">
                {fmtPct(baCoverage.pct)} ({baCoverage.covered}/{baCoverage.totalDays} days)
              </dd>
            </div>
            <div>
              <dt className="ops-item-label">Last updated</dt>
              <dd className="ops-item-value ops-item-value-sm">
                {generatedAt ? generatedAt.replace('T', ' ').replace('+00:00', ' UTC') : '\u2014'}
              </dd>
            </div>
            <div>
              <dt className="ops-item-label">Schema</dt>
              <dd className="ops-item-value">v{data.meta?.schema_version ?? 1}</dd>
            </div>
          </dl>
          <div className="gate-chips">
            {gateEntries.map(([key, on]) => (
              <StatusBadge key={key} tone={on ? 'up' : 'neutral'}>
                {key.replace(/_/g, ' ')}{on ? '' : ' off'}
              </StatusBadge>
            ))}
          </div>
          <div style={{ marginTop: 16 }}>
            <Button variant="primary" onClick={onUploadClick}>Upload Data</Button>
          </div>
        </Card>
      </div>

      <BreakdownDrawer
        open={drill === 'ridership' || drill === 'timeline'}
        onClose={() => setDrill(null)}
        title="Ridership breakdown"
        subtitle={`${filters.range.start} to ${filters.range.end}`}
        stats={[
          { label: 'Total passengers', value: fmtInt(totals.ridership) },
          {
            label: 'Average per day',
            value: fmtInt(Math.round(totals.ridership / Math.max(totals.days, 1))),
            hint: `${totals.days} service days`,
          },
          {
            label: 'Weekday average',
            value: fmtInt(Math.round(dayTypeSplit.weekdayAvg)),
            hint: `${dayTypeSplit.weekdayDays} days`,
          },
          {
            label: 'Weekend average',
            value: fmtInt(Math.round(dayTypeSplit.weekendAvg)),
            hint: `${dayTypeSplit.weekendDays} days`,
          },
        ]}
        note={
          dayTypeSplit.weekendDays > 0 && dayTypeSplit.weekdayAvg > 0
            ? [
                `Weekend demand runs at ${fmtPct(dayTypeSplit.weekendAvg / dayTypeSplit.weekdayAvg)} of a weekday. Use this ratio when setting weekend headways.`,
                rankedDays.length > 0
                  ? `Busiest day: ${fmtWeekday(rankedDays[0].service_date)} ${fmtDateShort(rankedDays[0].service_date)} (${fmtInt(rankedDays[0].ridership)} passengers). Quietest day: ${fmtWeekday(rankedDays[rankedDays.length - 1].service_date)} ${fmtDateShort(rankedDays[rankedDays.length - 1].service_date)} (${fmtInt(rankedDays[rankedDays.length - 1].ridership)} passengers).`
                  : null,
              ].filter(Boolean).join(' ')
            : rankedDays.length > 0
              ? `Busiest day: ${fmtWeekday(rankedDays[0].service_date)} ${fmtDateShort(rankedDays[0].service_date)}. Quietest day: ${fmtWeekday(rankedDays[rankedDays.length - 1].service_date)} ${fmtDateShort(rankedDays[rankedDays.length - 1].service_date)}.`
              : 'No weekend days in the selected window.'
        }
      >
        <BreakdownTable
          caption="Busiest days"
          columns={[
            { key: 'date', label: 'Date' },
            { key: 'day', label: 'Day' },
            { key: 'ridership', label: 'Passengers', align: 'right' },
            { key: 'revenue', label: 'Revenue', align: 'right' },
            { key: 'trips', label: 'Trips', align: 'right' },
          ]}
          rows={rankedDays.slice(0, 5).map((d) => ({
            __key: d.service_date,
            date: d.service_date,
            day: fmtWeekday(d.service_date),
            ridership: fmtInt(d.ridership),
            revenue: fmtMoney(d.revenue, { compact: d.revenue >= 1e5 }),
            trips: fmtInt(d.trips),
          }))}
        />
        <BreakdownTable
          caption="Quietest days"
          columns={[
            { key: 'date', label: 'Date' },
            { key: 'day', label: 'Day' },
            { key: 'ridership', label: 'Passengers', align: 'right' },
            { key: 'revenue', label: 'Revenue', align: 'right' },
            { key: 'trips', label: 'Trips', align: 'right' },
          ]}
          rows={rankedDays.slice(-5).reverse().map((d) => ({
            __key: d.service_date,
            date: d.service_date,
            day: fmtWeekday(d.service_date),
            ridership: fmtInt(d.ridership),
            revenue: fmtMoney(d.revenue, { compact: d.revenue >= 1e5 }),
            trips: fmtInt(d.trips),
          }))}
        />
      </BreakdownDrawer>

      <BreakdownDrawer
        open={drill === 'revenue'}
        onClose={() => setDrill(null)}
        title="Revenue breakdown"
        subtitle={`${filters.range.start} to ${filters.range.end}`}
        stats={[
          { label: 'Total revenue', value: fmtMoney(totals.revenue, { compact: totals.revenue >= 1e5 }) },
          {
            label: 'Average per day',
            value: fmtMoney(totals.revenue / Math.max(totals.days, 1), { compact: false }),
          },
          { label: 'Fare yield', value: fmtMoney(totals.fareYield, { dp: 2 }), hint: 'Per passenger' },
          { label: 'Revenue per trip', value: fmtMoney(totals.revPerTrip, { dp: 2 }) },
        ]}
        note="Fare yield moving without a fare revision usually means a change in trip length or pass mix, not a pricing change."
      >
        <BreakdownTable
          caption="Revenue by route"
          columns={[
            { key: 'route', label: 'Route' },
            { key: 'revenue', label: 'Revenue', align: 'right' },
            { key: 'share', label: 'Share', align: 'right' },
            { key: 'yield', label: 'Per passenger', align: 'right' },
          ]}
          rows={routeRows
            .slice()
            .sort((a, b) => b.revenue - a.revenue)
            .map((r) => ({
              __key: r.route_code,
              route: r.route_code,
              revenue: fmtMoney(r.revenue, { compact: r.revenue >= 1e5 }),
              share: fmtPct(totals.revenue > 0 ? r.revenue / totals.revenue : 0),
              yield: fmtMoney(r.fareYield, { dp: 2 }),
            }))}
        />
      </BreakdownDrawer>

      <BreakdownDrawer
        open={drill === 'lf'}
        onClose={() => setDrill(null)}
        title="Load factor breakdown"
        subtitle="Passenger-km divided by capacity-km"
        stats={[
          { label: 'Period load factor', value: fmtPct(totals.lf) },
          { label: 'Target', value: fmtPct(lfTarget) },
          {
            label: 'Days at or above target',
            value: `${lfDays.aboveTarget} of ${lfDays.rows.length}`,
            hint: fmtPct(lfDays.aboveTarget / Math.max(lfDays.rows.length, 1)),
          },
          { label: 'Passenger-km', value: fmtInt(Math.round(totals.pax_km)) },
        ]}
        note="Low load factor with high ridership points at oversupply on long sections rather than weak demand. Check the route quadrant on Route Performance before cutting trips."
      >
        <BreakdownTable
          caption="Strongest days"
          columns={[
            { key: 'date', label: 'Date' },
            { key: 'lf', label: 'Load factor', align: 'right' },
            { key: 'ridership', label: 'Passengers', align: 'right' },
          ]}
          rows={lfDays.rows.slice(0, 5).map((r) => ({
            __key: r.date,
            date: r.date,
            lf: fmtPct(r.lf),
            ridership: fmtInt(r.ridership),
          }))}
        />
        <BreakdownTable
          caption="Weakest days"
          columns={[
            { key: 'date', label: 'Date' },
            { key: 'lf', label: 'Load factor', align: 'right' },
            { key: 'ridership', label: 'Passengers', align: 'right' },
          ]}
          rows={lfDays.rows.slice(-5).reverse().map((r) => ({
            __key: r.date,
            date: r.date,
            lf: fmtPct(r.lf),
            ridership: fmtInt(r.ridership),
          }))}
        />
      </BreakdownDrawer>

      <BreakdownDrawer
        open={drill === 'trips'}
        onClose={() => setDrill(null)}
        title="Service delivery breakdown"
        subtitle={`${filters.range.start} to ${filters.range.end}`}
        stats={[
          { label: 'Trips operated', value: fmtInt(totals.trips) },
          { label: 'Buses per day', value: fmtInt(Math.round(totals.busesPerDay)) },
          { label: 'Trips per bus', value: totals.tripsPerBus.toFixed(1) },
          { label: 'Trips per day', value: fmtInt(Math.round(totals.trips / Math.max(totals.days, 1))) },
        ]}
        note="Trips per bus below target usually indicates lost running time (breakdowns, crew changeovers, terminal layover) rather than a shortage of vehicles."
      >
        <BreakdownTable
          caption="Trips by route"
          columns={[
            { key: 'route', label: 'Route' },
            { key: 'trips', label: 'Trips', align: 'right' },
            { key: 'buses', label: 'Buses/day', align: 'right' },
            { key: 'lf', label: 'Load factor', align: 'right' },
          ]}
          rows={routeRows
            .slice()
            .sort((a, b) => b.trips - a.trips)
            .map((r) => ({
              __key: r.route_code,
              route: r.route_code,
              trips: fmtInt(r.trips),
              buses: r.busesPerDay.toFixed(1),
              lf: fmtPct(r.lf),
            }))}
        />
      </BreakdownDrawer>

      <BreakdownDrawer
        open={drill === 'calendar'}
        onClose={() => setDrill(null)}
        title="Demand by day of week"
        subtitle="Averages across the selected period"
        note="Days that sit consistently below the weekly average are the first candidates for a reduced timetable; days above it are where extra trips pay for themselves."
      >
        <BreakdownTable
          columns={[
            { key: 'day', label: 'Day' },
            { key: 'days', label: 'Days', align: 'right' },
            { key: 'ridership', label: 'Avg passengers', align: 'right' },
            { key: 'revenue', label: 'Avg revenue', align: 'right' },
            { key: 'lf', label: 'Load factor', align: 'right' },
          ]}
          rows={byWeekday.map((w) => ({
            __key: w.name,
            day: w.name,
            days: String(w.days),
            ridership: fmtInt(Math.round(w.avgRidership)),
            revenue: fmtMoney(w.avgRevenue, { compact: w.avgRevenue >= 1e5 }),
            lf: fmtPct(w.lf),
          }))}
        />
      </BreakdownDrawer>

      <BreakdownDrawer
        open={drill === 'revenue-share' || drill === 'top-routes'}
        onClose={() => setDrill(null)}
        title="Route contribution"
        subtitle={`${routeRows.length} routes \u00B7 ${filters.range.start} to ${filters.range.end}`}
        stats={[
          { label: 'Routes in view', value: String(routeRows.length) },
          {
            label: 'Top route share',
            value: fmtPct(revenueShare.length > 0 && totals.revenue > 0 ? revenueShare[0].value / totals.revenue : 0),
            hint: revenueShare[0]?.name,
          },
          {
            label: 'Top 3 share',
            value: fmtPct(
              totals.revenue > 0
                ? revenueShare.slice(0, 3).reduce((s, r) => s + r.value, 0) / totals.revenue
                : 0,
            ),
          },
        ]}
        note="A high top-three share means the network's revenue depends on a few corridors: protect their reliability before adding coverage elsewhere."
      >
        <BreakdownTable
          columns={[
            { key: 'route', label: 'Route' },
            { key: 'revenue', label: 'Revenue', align: 'right' },
            { key: 'share', label: 'Share', align: 'right' },
            { key: 'cum', label: 'Cumulative', align: 'right' },
            { key: 'ridership', label: 'Passengers', align: 'right' },
          ]}
          rows={(() => {
            let run = 0
            return revenueShare.map((r) => {
              run += r.value
              const route = routeRows.find((x) => x.route_code === r.name)
              return {
                __key: r.name,
                route: r.name,
                revenue: fmtMoney(r.value, { compact: r.value >= 1e5 }),
                share: fmtPct(totals.revenue > 0 ? r.value / totals.revenue : 0),
                cum: fmtPct(totals.revenue > 0 ? run / totals.revenue : 0),
                ridership: fmtInt(route?.ridership ?? 0),
              }
            })
          })()}
        />
      </BreakdownDrawer>

      <BreakdownDrawer
        open={drill === 'gender'}
        onClose={() => setDrill(null)}
        title="Gender mix"
        subtitle="Ticketed passengers with a recorded gender"
        stats={genderShare.map((g) => ({
          label: g.name,
          value: fmtInt(g.value),
          hint: fmtPct(g.value / Math.max(genderShare.reduce((s, x) => s + x.value, 0), 1)),
        }))}
        note="Compare this against the hourly profile on Temporal Analysis: a mix that shifts sharply after dark is a personal-security signal worth acting on."
      />

      <BreakdownDrawer
        open={drill === 'ops'}
        onClose={() => setDrill(null)}
        title="How these numbers are built"
        subtitle="Formulas behind the operating snapshot"
      >
        <BreakdownTable
          columns={[
            { key: 'metric', label: 'Metric' },
            { key: 'value', label: 'Value', align: 'right' },
            { key: 'formula', label: 'Formula' },
          ]}
          rows={ops.map((o) => ({
            __key: o.key,
            metric: o.label,
            value: o.value,
            formula: getDefinition(o.key).formula,
          }))}
        />
      </BreakdownDrawer>

      <BreakdownDrawer
        open={drill === 'health'}
        onClose={() => setDrill(null)}
        title="Data health checks"
        subtitle="What the last ingest verified"
        stats={[
          { label: 'Days in view', value: `${totals.days} of ${data.daily.length}` },
          {
            label: 'Stop-sequence coverage',
            value: fmtPct(baCoverage.pct),
            hint: `${baCoverage.covered} of ${baCoverage.totalDays} days`,
          },
          { label: 'Schema version', value: `v${data.meta?.schema_version ?? 1}` },
        ]}
        note="Feature gates switch charts off when the underlying column is missing or too sparse to trust, rather than showing a chart built on partial data."
      >
        <BreakdownTable
          caption="Feature gates"
          columns={[
            { key: 'gate', label: 'Feature' },
            { key: 'state', label: 'State', align: 'right' },
          ]}
          rows={gateEntries.map(([key, on]) => ({
            __key: key,
            gate: key.replace(/_/g, ' '),
            state: on ? 'On' : 'Off',
          }))}
        />
      </BreakdownDrawer>
    </div>
  )
}