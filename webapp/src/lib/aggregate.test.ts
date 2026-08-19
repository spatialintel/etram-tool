import { describe, expect, it } from 'vitest'
import { aggregateDaily, aggregateHours, aggregateRoutes, aggregateStops, bucketKey, headwayMinsFromTemporal, hourlyRouteHeadways, periodKpisFromDaily, periodTotals, weekStart } from './aggregate'
import type { DailyRow, KpiDailyRow, RouteTrendRow, StopMapRow, TemporalRow } from '../types'

const daily = (service_date: string, patch: Partial<DailyRow> = {}): DailyRow => ({
  service_date,
  ridership: 100,
  revenue: 1000,
  pax_km: 500,
  capacity_km: 1000,
  trips: 10,
  buses: 2,
  lf: 0.5,
  ...patch,
})

describe('bucketing', () => {
  it('starts weeks on Monday', () => {
    expect(weekStart('2026-04-01')).toBe('2026-03-30')
    expect(weekStart('2026-03-30')).toBe('2026-03-30')
    expect(weekStart('2026-04-05')).toBe('2026-03-30')
  })

  it('keys by day, week or month', () => {
    expect(bucketKey('2026-04-15', 'daily')).toBe('2026-04-15')
    expect(bucketKey('2026-04-15', 'weekly')).toBe('2026-04-13')
    expect(bucketKey('2026-04-15', 'monthly')).toBe('2026-04')
  })
})

describe('aggregateDaily', () => {
  it('sums into buckets and recomputes load factor from the totals', () => {
    const rows = [
      daily('2026-04-01', { pax_km: 300, capacity_km: 1000 }),
      daily('2026-04-02', { pax_km: 900, capacity_km: 1000 }),
    ]
    const out = aggregateDaily(rows, 'monthly')
    expect(out).toHaveLength(1)
    expect(out[0].ridership).toBe(200)
    expect(out[0].days).toBe(2)
    // 1200/2000, not the mean of 0.3 and 0.9 - identical here but weighted in general
    expect(out[0].lf).toBeCloseTo(0.6, 10)
  })

  it('weights load factor by capacity rather than averaging ratios', () => {
    const rows = [
      daily('2026-04-01', { pax_km: 100, capacity_km: 100 }),
      daily('2026-04-02', { pax_km: 100, capacity_km: 900 }),
    ]
    expect(aggregateDaily(rows, 'monthly')[0].lf).toBeCloseTo(0.2, 10)
  })

  it('returns buckets in chronological order', () => {
    const out = aggregateDaily([daily('2026-04-10'), daily('2026-04-01')], 'daily')
    expect(out.map((b) => b.key)).toEqual(['2026-04-01', '2026-04-10'])
  })

  it('handles an empty input', () => {
    expect(aggregateDaily([], 'weekly')).toEqual([])
  })
})

describe('periodTotals', () => {
  it('averages fleet size per day but sums flow metrics', () => {
    const t = periodTotals([daily('2026-04-01', { buses: 2 }), daily('2026-04-02', { buses: 4 })])
    expect(t.ridership).toBe(200)
    expect(t.trips).toBe(20)
    expect(t.busesPerDay).toBe(3)
    expect(t.days).toBe(2)
  })

  it('derives per-unit metrics without dividing by zero', () => {
    const t = periodTotals([daily('2026-04-01', { ridership: 200, revenue: 2400, pax_km: 800, trips: 20, buses: 5 })])
    expect(t.atl).toBeCloseTo(4, 10)
    expect(t.fareYield).toBeCloseTo(12, 10)
    expect(t.revPerTrip).toBeCloseTo(120, 10)
    expect(t.tripsPerBus).toBeCloseTo(4, 10)

    const empty = periodTotals([])
    expect(empty.lf).toBe(0)
    expect(empty.atl).toBe(0)
    expect(empty.tripsPerBus).toBe(0)
  })
})

describe('periodKpisFromDaily', () => {
  const kpi = (service_date: string, patch: Partial<KpiDailyRow> = {}): KpiDailyRow => ({
    service_date,
    ridership: 100,
    revenue: 200,
    n_trips: 10,
    n_buses: 2,
    pax_km: 50,
    capacity_km: 100,
    LF: 0.5,
    EPKM: 1,
    ATL: 0.5,
    EPKM_route: 1,
    EPB: 100,
    trips_per_bus: 5,
    vehicle_km: 40,
    vehicle_km_per_bus: 20,
    headway_mins: 12,
    commercial_speed_kmh: 18,
    ...patch,
  })

  it('computes load factor, EPKM, and EPB from period sums', () => {
    const out = periodKpisFromDaily([
      kpi('2026-04-01', { pax_km: 10, capacity_km: 10, revenue: 100, vehicle_km: 10, n_buses: 1, LF: 1, EPKM: 10 }),
      kpi('2026-04-02', { pax_km: 10, capacity_km: 90, revenue: 100, vehicle_km: 90, n_buses: 9, LF: 0.11, EPKM: 1.1 }),
    ])
    expect(out.lf).toBeCloseTo(0.2, 10)
    expect(out.epkm).toBeCloseTo(2, 10)
    expect(out.epb).toBeCloseTo(20, 10)
    expect(out.vehicle_km).toBe(100)
  })

  it('trip-weights headway across days', () => {
    const out = periodKpisFromDaily([
      kpi('2026-04-01', { n_trips: 1, headway_mins: 30 }),
      kpi('2026-04-02', { n_trips: 9, headway_mins: 10 }),
    ])
    expect(out.headway_mins).toBeCloseTo(12, 10)
  })

  it('trip-weights commercial speed across days', () => {
    const out = periodKpisFromDaily([
      kpi('2026-04-01', { n_trips: 1, commercial_speed_kmh: 10 }),
      kpi('2026-04-02', { n_trips: 9, commercial_speed_kmh: 20 }),
    ])
    expect(out.commercial_speed_kmh).toBeCloseTo(19, 10)
  })
})

describe('aggregateRoutes', () => {
  const rt = (service_date: string, route_code: string, patch: Partial<RouteTrendRow> = {}): RouteTrendRow => ({
    service_date,
    route_code,
    ridership: 50,
    revenue: 500,
    load_factor_route: 0.5,
    n_trips: 5,
    n_buses: 1,
    ...patch,
  })

  it('sums per route and ranks by ridership', () => {
    const out = aggregateRoutes([rt('2026-04-01', 'R1'), rt('2026-04-02', 'R1'), rt('2026-04-01', 'R2', { ridership: 10 })])
    expect(out.map((r) => r.route_code)).toEqual(['R1', 'R2'])
    expect(out[0].ridership).toBe(100)
    expect(out[0].days).toBe(2)
  })

  it('falls back to trip-weighted load factor when passenger-km is missing', () => {
    const out = aggregateRoutes([
      rt('2026-04-01', 'R1', { load_factor_route: 0.9, n_trips: 1 }),
      rt('2026-04-02', 'R1', { load_factor_route: 0.1, n_trips: 9 }),
    ])
    expect(out[0].lf).toBeCloseTo(0.18, 10)
  })

  it('computes load factor from passenger-km over capacity-km', () => {
    const out = aggregateRoutes([
      rt('2026-04-01', 'R1', { pax_km: 90, capacity_km: 100, load_factor_route: 0.9, n_trips: 1 }),
      rt('2026-04-02', 'R1', { pax_km: 90, capacity_km: 900, load_factor_route: 0.1, n_trips: 9 }),
    ])
    expect(out[0].lf).toBeCloseTo(0.18, 10)
  })

  it('does not trip-weight load factor when capacity-km is present', () => {
    const out = aggregateRoutes([
      rt('2026-04-01', 'R1', { pax_km: 10, capacity_km: 100, load_factor_route: 0.9, n_trips: 1 }),
      rt('2026-04-02', 'R1', { pax_km: 10, capacity_km: 900, load_factor_route: 0.1, n_trips: 9 }),
    ])
    expect(out[0].lf).toBeCloseTo(0.02, 10)
  })

  it('computes trips per bus over bus-days', () => {
    const out = aggregateRoutes([rt('2026-04-01', 'R1', { n_trips: 6, n_buses: 2 }), rt('2026-04-02', 'R1', { n_trips: 6, n_buses: 2 })])
    expect(out[0].tripsPerBus).toBeCloseTo(3, 10)
  })
})

describe('aggregateHours', () => {
  const th = (service_date: string, start_hour: number, patch: Partial<TemporalRow> = {}): TemporalRow => ({
    service_date,
    route_code: 'R1',
    start_hour,
    ridership: 20,
    revenue: 200,
    trips: 2,
    ...patch,
  })

  it('sums across routes and dates, and counts distinct days', () => {
    const out = aggregateHours([th('2026-04-01', 8), th('2026-04-01', 8, { route_code: 'R2' }), th('2026-04-02', 8)])
    expect(out).toHaveLength(1)
    expect(out[0].ridership).toBe(60)
    expect(out[0].days).toBe(2)
    expect(out[0].label).toBe('08:00')
  })

  it('orders by hour', () => {
    expect(aggregateHours([th('2026-04-01', 18), th('2026-04-01', 6)]).map((h) => h.hour)).toEqual([6, 18])
  })
})

describe('headwayMinsFromTemporal', () => {
  const th = (service_date: string, route_code: string, start_hour: number, trips: number): TemporalRow => ({
    service_date,
    route_code,
    start_hour,
    ridership: trips * 10,
    revenue: trips * 100,
    trips,
  })

  it('does not pool parallel routes into one clock span', () => {
    const rows = []
    for (let i = 0; i < 10; i++) {
      rows.push(th('2026-05-01', `R${i}`, 8, 1), th('2026-05-01', `R${i}`, 9, 1))
    }
    // Each route: 60 min span / 1 = 60. Pooled span/n would be 60/20 = 3.
    expect(headwayMinsFromTemporal(rows)).toBe(60)
  })

  it('treats a single occupied hour as a 60-minute window', () => {
    expect(headwayMinsFromTemporal([th('2026-05-01', 'R1', 8, 4)])).toBe(20)
  })

  it('trip-weights route-days', () => {
    const rows = [
      th('2026-05-01', 'A', 6, 1),
      th('2026-05-01', 'A', 7, 1),
      th('2026-05-01', 'B', 6, 3),
    ]
    // A: 60/1=60, n=2; B: 60/2=30, n=3; (60*2+30*3)/5 = 42
    expect(headwayMinsFromTemporal(rows)).toBe(42)
  })
})

describe('hourlyRouteHeadways', () => {
  it('uses 60/trips per route, not per network hour', () => {
    const rows: TemporalRow[] = [
      { service_date: '2026-05-01', route_code: 'R1', start_hour: 8, ridership: 10, revenue: 100, trips: 1 },
      { service_date: '2026-05-01', route_code: 'R2', start_hour: 8, ridership: 10, revenue: 100, trips: 1 },
    ]
    const byHour = hourlyRouteHeadways(rows)
    expect(byHour.get(8)).toEqual([60, 60])
  })
})

describe('aggregateStops', () => {
  const sm = (service_date: string, stop_abbr: string, patch: Partial<StopMapRow> = {}): StopMapRow => ({
    service_date,
    route_direction_key: 'R1-UP',
    stop_abbr,
    stop_name: `Stop ${stop_abbr}`,
    boarding: 10,
    alighting: 5,
    peak_load: 30,
    latitude: 21.7,
    longitude: 72.1,
    ...patch,
  })

  it('sums flows but takes the maximum peak load', () => {
    const out = aggregateStops([sm('2026-04-01', 'A', { peak_load: 30 }), sm('2026-04-02', 'A', { peak_load: 45 })])
    expect(out).toHaveLength(1)
    expect(out[0].boarding).toBe(20)
    expect(out[0].peak_load).toBe(45)
    expect(out[0].days).toBe(2)
  })

  it('keeps the same stop on different directions separate', () => {
    const out = aggregateStops([sm('2026-04-01', 'A'), sm('2026-04-01', 'A', { route_direction_key: 'R1-DN' })])
    expect(out).toHaveLength(2)
  })
})
