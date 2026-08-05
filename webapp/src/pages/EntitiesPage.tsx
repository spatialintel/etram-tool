import { useMemo, useState } from 'react'
import {
  Callout,
  Card,
  DataTable,
  Drawer,
  EmptyState,
  Sparkline,
  StatCard,
  Tabs,
  type Column,
} from '../components/ui'
import { applyFilters } from '../lib/filters'
import type { FilterState } from '../lib/filters'
import { fmtDateShort, fmtInt, fmtKm, fmtMoney, fmtPct } from '../lib/format'
import type {
  CrewSummaryRow,
  DashboardData,
  StopMapRow,
  VehicleSummaryRow,
} from '../types'

type TabId = 'vehicles' | 'drivers' | 'conductors' | 'stops'

type EntityAgg = {
  id: string
  label: string
  trips: number
  ridership: number
  revenue: number
  pax_km: number
  capacity_km: number
  vehicle_km: number
  boarding: number
  alighting: number
  peak_load: number
  days: number
  lf: number
  net: number
  rev_per_pax: number
  /** Daily series behind the drawer trend: ridership, or boardings for stops. */
  spark: number[]
  sparkDates: string[]
}

function inDateRange(date: string, f: FilterState): boolean {
  return (!f.range.start || date >= f.range.start) && (!f.range.end || date <= f.range.end)
}

function weekdayOk(date: string, days: number[]): boolean {
  if (days.length === 0) return true
  const wd = new Date(`${date}T00:00:00Z`).getUTCDay()
  return days.includes(wd)
}

function finish(
  map: Map<string, EntityAgg & { byDay: Map<string, number> }>,
  sortKey: 'ridership' | 'revenue' | 'boarding',
): EntityAgg[] {
  return [...map.values()]
    .map((e) => {
      const days = e.byDay.size
      const byDay = [...e.byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]))
      const spark = byDay.map(([, v]) => v)
      const sparkDates = byDay.map(([d]) => d)
      return {
        id: e.id,
        label: e.label,
        trips: e.trips,
        ridership: e.ridership,
        revenue: e.revenue,
        pax_km: e.pax_km,
        capacity_km: e.capacity_km,
        vehicle_km: e.vehicle_km,
        boarding: e.boarding,
        alighting: e.alighting,
        peak_load: e.peak_load,
        days,
        lf: e.capacity_km > 0 ? e.pax_km / e.capacity_km : 0,
        net: e.boarding - e.alighting,
        rev_per_pax: e.ridership > 0 ? e.revenue / e.ridership : 0,
        spark,
        sparkDates,
      }
    })
    .sort((a, b) => b[sortKey] - a[sortKey])
}

function emptyAgg(id: string, label: string): EntityAgg & { byDay: Map<string, number> } {
  return {
    id,
    label,
    trips: 0,
    ridership: 0,
    revenue: 0,
    pax_km: 0,
    capacity_km: 0,
    vehicle_km: 0,
    boarding: 0,
    alighting: 0,
    peak_load: 0,
    days: 0,
    lf: 0,
    net: 0,
    rev_per_pax: 0,
    spark: [],
    sparkDates: [],
    byDay: new Map(),
  }
}

function aggregateVehicles(rows: VehicleSummaryRow[], f: FilterState): EntityAgg[] {
  const map = new Map<string, EntityAgg & { byDay: Map<string, number> }>()
  for (const r of rows) {
    if (!inDateRange(r.service_date, f) || !weekdayOk(r.service_date, f.days)) continue
    let e = map.get(r.vehicle_id)
    if (!e) {
      e = emptyAgg(r.vehicle_id, r.vehicle_id)
      map.set(r.vehicle_id, e)
    }
    e.trips += r.trips || 0
    e.ridership += r.ridership || 0
    e.revenue += r.revenue || 0
    e.pax_km += r.pax_km || 0
    e.capacity_km += r.capacity_km || 0
    e.vehicle_km += r.vehicle_km || 0
    e.byDay.set(r.service_date, (e.byDay.get(r.service_date) || 0) + (r.ridership || 0))
  }
  return finish(map, 'ridership')
}

function aggregateCrew(rows: CrewSummaryRow[], role: string, f: FilterState): EntityAgg[] {
  const map = new Map<string, EntityAgg & { byDay: Map<string, number> }>()
  for (const r of rows) {
    if (r.role !== role) continue
    if (!inDateRange(r.service_date, f) || !weekdayOk(r.service_date, f.days)) continue
    let e = map.get(r.crew_id)
    if (!e) {
      e = emptyAgg(r.crew_id, r.crew_id)
      map.set(r.crew_id, e)
    }
    e.trips += r.trips || 0
    e.ridership += r.ridership || 0
    e.revenue += r.revenue || 0
    e.pax_km += r.pax_km || 0
    e.vehicle_km += r.vehicle_km || 0
    e.byDay.set(r.service_date, (e.byDay.get(r.service_date) || 0) + (r.ridership || 0))
  }
  return finish(map, role === 'conductor' ? 'revenue' : 'ridership')
}

function aggregateStops(rows: StopMapRow[], f: FilterState): EntityAgg[] {
  const map = new Map<string, EntityAgg & { byDay: Map<string, number> }>()
  for (const r of applyFilters(rows, f)) {
    let e = map.get(r.stop_abbr)
    if (!e) {
      e = emptyAgg(r.stop_abbr, r.stop_name || r.stop_abbr)
      map.set(r.stop_abbr, e)
    }
    e.boarding += r.boarding || 0
    e.alighting += r.alighting || 0
    e.peak_load = Math.max(e.peak_load, r.peak_load || 0)
    e.byDay.set(r.service_date, (e.byDay.get(r.service_date) || 0) + (r.boarding || 0))
  }
  return finish(map, 'boarding')
}

export function EntitiesPage({
  data,
  filters,
}: {
  data: DashboardData
  filters: FilterState
}) {
  const gates = data.feature_gates || {}
  const availableTabs = useMemo(() => {
    const items: { id: TabId; label: string }[] = [{ id: 'vehicles', label: 'Vehicles' }]
    if (gates.driver_speed) items.push({ id: 'drivers', label: 'Drivers' })
    if (gates.conductor_revenue) items.push({ id: 'conductors', label: 'Conductors' })
    if (gates.ba_maps !== false && (data.stop_map?.length ?? 0) > 0) {
      items.push({ id: 'stops', label: 'Stops' })
    }
    return items
  }, [gates, data.stop_map])

  const [tab, setTab] = useState<TabId>('vehicles')
  const activeTab = availableTabs.some((t) => t.id === tab) ? tab : (availableTabs[0]?.id ?? 'vehicles')
  const [selected, setSelected] = useState<EntityAgg | null>(null)

  const rows = useMemo(() => {
    if (activeTab === 'vehicles') return aggregateVehicles(data.vehicle_summary ?? [], filters)
    if (activeTab === 'drivers') return aggregateCrew(data.crew_summary ?? [], 'driver', filters)
    if (activeTab === 'conductors') return aggregateCrew(data.crew_summary ?? [], 'conductor', filters)
    return aggregateStops(data.stop_map ?? [], filters)
  }, [activeTab, data.vehicle_summary, data.crew_summary, data.stop_map, filters])

  const totals = useMemo(
    () =>
      rows.reduce(
        (a, r) => ({
          trips: a.trips + r.trips,
          ridership: a.ridership + r.ridership,
          revenue: a.revenue + r.revenue,
          vehicle_km: a.vehicle_km + r.vehicle_km,
          boarding: a.boarding + r.boarding,
          alighting: a.alighting + r.alighting,
        }),
        { trips: 0, ridership: 0, revenue: 0, vehicle_km: 0, boarding: 0, alighting: 0 },
      ),
    [rows],
  )

  const isStop = activeTab === 'stops'
  const rangeLabel = `${filters.range.start} to ${filters.range.end}`

  const columns: Column<EntityAgg>[] = useMemo(() => {
    if (isStop) {
      return [
        { key: 'label', header: 'Stop', numeric: false },
        { key: 'id', header: 'Code', numeric: false },
        {
          key: 'boarding',
          header: 'Boarding',
          align: 'right',
          bar: true,
          format: (v) => fmtInt(v as number),
        },
        { key: 'alighting', header: 'Alighting', align: 'right', format: (v) => fmtInt(v as number) },
        { key: 'net', header: 'Net', align: 'right', format: (v) => fmtInt(v as number) },
        { key: 'peak_load', header: 'Peak load', align: 'right', format: (v) => fmtInt(v as number) },
        { key: 'days', header: 'Days', align: 'right', format: (v) => fmtInt(v as number) },
      ]
    }
    const nameHeader =
      activeTab === 'vehicles' ? 'Vehicle' : activeTab === 'drivers' ? 'Driver' : 'Conductor'
    const cols: Column<EntityAgg>[] = [
      { key: 'label', header: nameHeader, numeric: false },
      { key: 'trips', header: 'Trips', align: 'right', format: (v) => fmtInt(v as number) },
      { key: 'vehicle_km', header: 'Vehicle km', align: 'right', format: (v) => fmtKm(v as number) },
      {
        key: 'ridership',
        header: 'Ridership',
        align: 'right',
        bar: true,
        format: (v) => fmtInt(v as number),
      },
      { key: 'revenue', header: 'Revenue', align: 'right', format: (v) => fmtMoney(v as number) },
    ]
    if (activeTab === 'vehicles') {
      cols.push({ key: 'lf', header: 'Load factor', align: 'right', format: (v) => fmtPct(v as number) })
    }
    if (activeTab === 'conductors') {
      cols.push({
        key: 'rev_per_pax',
        header: 'Rev / pax',
        align: 'right',
        format: (v) => (typeof v === 'number' && v > 0 ? fmtMoney(v, { dp: 2 }) : '\u2014'),
      })
    }
    cols.push({ key: 'days', header: 'Days', align: 'right', format: (v) => fmtInt(v as number) })
    return cols
  }, [activeTab, isStop])

  if ((data.vehicle_summary?.length ?? 0) === 0 && (data.crew_summary?.length ?? 0) === 0) {
    return (
      <div className="page">
        <EmptyState title="No entity summaries">
          Re-export Phase 3 data (schema v2) to populate vehicle_summary and crew_summary.
        </EmptyState>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="kpi-grid">
        <StatCard
          label={
            isStop
              ? 'Stops'
              : activeTab === 'vehicles'
                ? 'Vehicles'
                : activeTab === 'drivers'
                  ? 'Drivers'
                  : 'Conductors'
          }
          value={String(rows.length)}
          sub={rangeLabel}
        />
        {isStop ? (
          <>
            <StatCard
              label="Boardings"
              value={fmtInt(totals.boarding)}
              sub={`${fmtInt(totals.boarding / Math.max(rows.length, 1))} per active stop`}
              definitionKey="boarding"
            />
            <StatCard
              label="Alightings"
              value={fmtInt(totals.alighting)}
              sub={`${fmtInt(totals.alighting / Math.max(rows.length, 1))} per active stop`}
              definitionKey="alighting"
            />
          </>
        ) : (
          <>
            <StatCard
              label="Trips"
              value={fmtInt(totals.trips)}
              sub={`${fmtInt(totals.trips / Math.max(rows.length, 1))} per ${activeTab.slice(0, -1)}`}
            />
            <StatCard
              label="Vehicle km"
              value={fmtKm(totals.vehicle_km)}
              sub={`${fmtKm(totals.vehicle_km / Math.max(rows.length, 1))} per ${activeTab.slice(0, -1)}`}
              definitionKey="vehicle_km"
            />
            <StatCard
              label="Ridership"
              value={fmtInt(totals.ridership)}
              sub={`${fmtInt(totals.ridership / Math.max(rows.length, 1))} per ${activeTab.slice(0, -1)}`}
              definitionKey="ridership"
            />
            <StatCard
              label="Revenue"
              value={fmtMoney(totals.revenue, { compact: totals.revenue >= 1e5 })}
              sub={`${fmtMoney(totals.revenue / Math.max(rows.length, 1), { compact: false })} per ${activeTab.slice(0, -1)}`}
              definitionKey="revenue"
            />
          </>
        )}
      </div>

      {activeTab === 'drivers' && (
        <Callout tone="warn" title="Driver ID field quality">
          Values come from the ETM Driver ID column. Some agencies store schedule labels here; treat
          rankings as operational slices, not individual performance scores.
        </Callout>
      )}

      <div className="routes-toolbar">
        <Tabs
          value={activeTab}
          onChange={(v) => {
            setSelected(null)
            setTab(v as TabId)
          }}
          items={availableTabs}
        />
      </div>

      <Card
        title={`${availableTabs.find((t) => t.id === activeTab)?.label ?? 'Entities'} detail`}
        subtitle="Click a row for period totals and trend"
      >
        {rows.length === 0 ? (
          <EmptyState title="No rows for this filter">Widen the date range or clear day filters.</EmptyState>
        ) : (
          <DataTable
            rows={rows}
            columns={columns}
            initialSort={{
              key: isStop ? 'boarding' : activeTab === 'conductors' ? 'revenue' : 'ridership',
              dir: 'desc',
            }}
            searchable
            totalsRow={!isStop}
            exportName={`entities-${activeTab}`}
            rowKey={(r) => r.id}
            onRowClick={setSelected}
            pageSize={25}
          />
        )}
      </Card>

      <Drawer
        open={selected != null}
        onClose={() => setSelected(null)}
        title={selected?.label ?? ''}
        subtitle={selected ? `${selected.id} · ${rangeLabel}` : undefined}
      >
        {selected && (
          <div className="route-drawer">
            <dl className="ops-grid">
              {!isStop && (
                <>
                  <div>
                    <dt className="ops-item-label">Trips</dt>
                    <dd className="ops-item-value">{fmtInt(selected.trips)}</dd>
                  </div>
                  <div>
                    <dt className="ops-item-label">Vehicle km</dt>
                    <dd className="ops-item-value">{fmtKm(selected.vehicle_km)}</dd>
                  </div>
                  <div>
                    <dt className="ops-item-label">Ridership</dt>
                    <dd className="ops-item-value">{fmtInt(selected.ridership)}</dd>
                  </div>
                  <div>
                    <dt className="ops-item-label">Revenue</dt>
                    <dd className="ops-item-value">{fmtMoney(selected.revenue)}</dd>
                  </div>
                  {activeTab === 'vehicles' && (
                    <div>
                      <dt className="ops-item-label">Load factor</dt>
                      <dd className="ops-item-value">{fmtPct(selected.lf)}</dd>
                    </div>
                  )}
                  {activeTab === 'conductors' && selected.rev_per_pax > 0 && (
                    <div>
                      <dt className="ops-item-label">Rev / pax</dt>
                      <dd className="ops-item-value">{fmtMoney(selected.rev_per_pax, { dp: 2 })}</dd>
                    </div>
                  )}
                </>
              )}
              {isStop && (
                <>
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
                </>
              )}
              <div>
                <dt className="ops-item-label">Days active</dt>
                <dd className="ops-item-value">{fmtInt(selected.days)}</dd>
              </div>
            </dl>
            {selected.spark.length > 1 && (
              <div className="route-drawer-spark">
                <div className="ops-item-label">
                  {isStop ? 'Boardings per day' : 'Passengers carried per day'}
                </div>
                <p className="spark-caption">
                  {fmtDateShort(selected.sparkDates[0])} to{' '}
                  {fmtDateShort(selected.sparkDates[selected.sparkDates.length - 1])}, one point per
                  service day
                </p>
                <Sparkline values={selected.spark} width={260} height={48} />
                <dl className="spark-stats">
                  <div>
                    <dt>Average</dt>
                    <dd>{fmtInt(selected.spark.reduce((s, v) => s + v, 0) / selected.spark.length)}</dd>
                  </div>
                  <div>
                    <dt>Best day</dt>
                    <dd>
                      {fmtInt(Math.max(...selected.spark))} on{' '}
                      {fmtDateShort(
                        selected.sparkDates[selected.spark.indexOf(Math.max(...selected.spark))],
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Quietest day</dt>
                    <dd>
                      {fmtInt(Math.min(...selected.spark))} on{' '}
                      {fmtDateShort(
                        selected.sparkDates[selected.spark.indexOf(Math.min(...selected.spark))],
                      )}
                    </dd>
                  </div>
                </dl>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </div>
  )
}
