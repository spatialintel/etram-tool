import { addDays, weekdayOf } from './filters'
import type { Granularity } from './filters'
import type { DailyRow, KpiDailyRow, RouteTrendRow, StopMapRow, TemporalRow } from '../types'

/* Time bucketing */

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Monday-based week start, so a bucket never splits a working week. */
export function weekStart(iso: string): string {
  return addDays(iso, -((weekdayOf(iso) + 6) % 7))
}

export function bucketKey(iso: string, gran: Granularity): string {
  if (gran === 'weekly') return weekStart(iso)
  if (gran === 'monthly') return iso.slice(0, 7)
  return iso
}

export function bucketLabel(key: string, gran: Granularity): string {
  if (gran === 'monthly') {
    const [y, m] = key.split('-')
    return `${MONTH_NAMES[Number(m) - 1]} ${y}`
  }
  if (gran === 'weekly') return `Week of ${key}`
  return key
}

/* Daily series */

export type DailyAgg = {
  key: string
  label: string
  ridership: number
  revenue: number
  pax_km: number
  capacity_km: number
  trips: number
  buses: number
  lf: number
  days: number
}

/**
 * Load factor is recomputed from summed pax-km and capacity-km rather than
 * averaged: averaging daily ratios would weight a quiet Sunday like a Monday.
 */
export function aggregateDaily(rows: DailyRow[], gran: Granularity): DailyAgg[] {
  const map = new Map<string, DailyAgg>()
  for (const r of rows) {
    const key = bucketKey(r.service_date, gran)
    let e = map.get(key)
    if (!e) {
      e = { key, label: bucketLabel(key, gran), ridership: 0, revenue: 0, pax_km: 0, capacity_km: 0, trips: 0, buses: 0, lf: 0, days: 0 }
      map.set(key, e)
    }
    e.ridership += r.ridership || 0
    e.revenue += r.revenue || 0
    e.pax_km += r.pax_km || 0
    e.capacity_km += r.capacity_km || 0
    e.trips += r.trips || 0
    e.buses += r.buses || 0
    e.days += 1
  }
  return [...map.values()]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((e) => ({ ...e, lf: e.capacity_km > 0 ? e.pax_km / e.capacity_km : 0 }))
}

export type PeriodTotals = {
  ridership: number
  revenue: number
  pax_km: number
  capacity_km: number
  trips: number
  /** Fleet size is a daily count, so it is averaged rather than summed. */
  busesPerDay: number
  lf: number
  days: number
  atl: number
  fareYield: number
  revPerTrip: number
  tripsPerBus: number
}

export function periodTotals(rows: DailyRow[]): PeriodTotals {
  const t = rows.reduce(
    (a, r) => {
      a.ridership += r.ridership || 0
      a.revenue += r.revenue || 0
      a.pax_km += r.pax_km || 0
      a.capacity_km += r.capacity_km || 0
      a.trips += r.trips || 0
      a.buses += r.buses || 0
      return a
    },
    { ridership: 0, revenue: 0, pax_km: 0, capacity_km: 0, trips: 0, buses: 0 },
  )
  const days = rows.length
  const busesPerDay = days > 0 ? t.buses / days : 0
  const busDays = t.buses
  return {
    ridership: t.ridership,
    revenue: t.revenue,
    pax_km: t.pax_km,
    capacity_km: t.capacity_km,
    trips: t.trips,
    busesPerDay,
    days,
    lf: t.capacity_km > 0 ? t.pax_km / t.capacity_km : 0,
    atl: t.ridership > 0 ? t.pax_km / t.ridership : 0,
    fareYield: t.ridership > 0 ? t.revenue / t.ridership : 0,
    revPerTrip: t.trips > 0 ? t.revenue / t.trips : 0,
    tripsPerBus: busDays > 0 ? t.trips / busDays : 0,
  }
}

/** Period ratios from daily KPI rows: sums in the numerator and denominator, not a mean of daily ratios. */
export type PeriodKpis = {
  lf: number | null
  epkm: number | null
  epb: number | null
  vehicle_km: number | null
  vehicle_km_per_bus: number | null
  headway_mins: number | null
}

export function periodKpisFromDaily(rows: KpiDailyRow[]): PeriodKpis {
  let pax_km = 0
  let capacity_km = 0
  let revenue = 0
  let vehicle_km = 0
  let bus_days = 0
  let trips = 0
  let headway_span = 0
  for (const r of rows) {
    pax_km += r.pax_km || 0
    capacity_km += r.capacity_km || 0
    revenue += r.revenue || 0
    vehicle_km += r.vehicle_km || 0
    bus_days += r.n_buses || 0
    const n = r.n_trips || 0
    trips += n
    if (typeof r.headway_mins === 'number' && Number.isFinite(r.headway_mins) && n > 0) {
      headway_span += r.headway_mins * n
    }
  }
  return {
    lf: capacity_km > 0 ? pax_km / capacity_km : null,
    epkm: vehicle_km > 0 ? revenue / vehicle_km : null,
    epb: bus_days > 0 ? revenue / bus_days : null,
    vehicle_km: vehicle_km > 0 ? vehicle_km : null,
    vehicle_km_per_bus: bus_days > 0 && vehicle_km > 0 ? vehicle_km / bus_days : null,
    headway_mins: trips > 0 && headway_span > 0 ? headway_span / trips : null,
  }
}

/* Routes */

export type RouteAgg = {
  route_code: string
  ridership: number
  revenue: number
  trips: number
  busesPerDay: number
  lf: number
  fareYield: number
  tripsPerBus: number
  days: number
  /** Earnings per vehicle-km when route length is present */
  epkm: number
  vehicleKm: number
}

export function aggregateRoutes(rows: RouteTrendRow[]): RouteAgg[] {
  const map = new Map<
    string,
    RouteAgg & { paxKm: number; capKm: number; lfWeight: number; lfSum: number; busDays: number }
  >()
  for (const r of rows) {
    let e = map.get(r.route_code)
    if (!e) {
      e = {
        route_code: r.route_code,
        ridership: 0,
        revenue: 0,
        trips: 0,
        busesPerDay: 0,
        lf: 0,
        fareYield: 0,
        tripsPerBus: 0,
        days: 0,
        epkm: 0,
        vehicleKm: 0,
        paxKm: 0,
        capKm: 0,
        lfWeight: 0,
        lfSum: 0,
        busDays: 0,
      }
      map.set(r.route_code, e)
    }
    const w = r.n_trips || 0
    e.ridership += r.ridership || 0
    e.revenue += r.revenue || 0
    e.trips += w
    e.busDays += r.n_buses || 0
    e.vehicleKm += (r.route_length_route || 0) * w
    e.paxKm += r.pax_km || 0
    e.capKm += r.capacity_km || 0
    e.lfSum += (r.load_factor_route || 0) * w
    e.lfWeight += w
    e.days += 1
  }
  return [...map.values()]
    .map((e) => {
      const busesPerDay = e.days > 0 ? e.busDays / e.days : 0
      const lf = e.capKm > 0 ? e.paxKm / e.capKm : e.lfWeight > 0 ? e.lfSum / e.lfWeight : 0
      return {
        route_code: e.route_code,
        ridership: e.ridership,
        revenue: e.revenue,
        trips: e.trips,
        busesPerDay,
        days: e.days,
        lf,
        fareYield: e.ridership > 0 ? e.revenue / e.ridership : 0,
        tripsPerBus: e.busDays > 0 ? e.trips / e.busDays : 0,
        vehicleKm: e.vehicleKm,
        epkm: e.vehicleKm > 0 ? e.revenue / e.vehicleKm : 0,
      }
    })
    .sort((a, b) => b.ridership - a.ridership)
}

/* Hours */

export type HourAgg = {
  hour: number
  label: string
  ridership: number
  revenue: number
  trips: number
  days: number
}

export function aggregateHours(rows: TemporalRow[]): HourAgg[] {
  const map = new Map<number, HourAgg & { dates: Set<string> }>()
  for (const r of rows) {
    let e = map.get(r.start_hour)
    if (!e) {
      e = { hour: r.start_hour, label: `${String(r.start_hour).padStart(2, '0')}:00`, ridership: 0, revenue: 0, trips: 0, days: 0, dates: new Set() }
      map.set(r.start_hour, e)
    }
    e.ridership += r.ridership || 0
    e.revenue += r.revenue || 0
    e.trips += r.trips || 0
    e.dates.add(r.service_date)
  }
  return [...map.values()]
    .sort((a, b) => a.hour - b.hour)
    .map(({ dates, ...e }) => ({ ...e, days: dates.size }))
}

/* Stops */

export type StopAgg = {
  stop_abbr: string
  stop_name: string
  route_direction_key: string
  boarding: number
  alighting: number
  /** Peak load is a maximum, not a sum: adding daily peaks would be meaningless. */
  peak_load: number
  latitude: number
  longitude: number
  days: number
}

export function aggregateStops(rows: StopMapRow[]): StopAgg[] {
  const map = new Map<string, StopAgg>()
  for (const r of rows) {
    const key = `${r.route_direction_key}|${r.stop_abbr}`
    let e = map.get(key)
    if (!e) {
      e = {
        stop_abbr: r.stop_abbr,
        stop_name: r.stop_name,
        route_direction_key: r.route_direction_key,
        boarding: 0,
        alighting: 0,
        peak_load: 0,
        latitude: r.latitude,
        longitude: r.longitude,
        days: 0,
      }
      map.set(key, e)
    }
    e.boarding += r.boarding || 0
    e.alighting += r.alighting || 0
    e.peak_load = Math.max(e.peak_load, r.peak_load || 0)
    e.days += 1
  }
  return [...map.values()].sort((a, b) => b.boarding - a.boarding)
}
