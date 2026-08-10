import type { Unit } from './format'

export type MetricDefinition = {
  label: string
  unit: Unit
  /** Short formula shown in InfoTips and the Definitions table. */
  formula: string
  /** Step-by-step how the dashboard computes the value. */
  how: string
  /** Where the inputs come from. */
  source: string
  note?: string
}

/**
 * Single source of truth for every KPI on the dashboard.
 * Surfaced through InfoTip (ⓘ) and Help → Definitions.
 * Formulas follow the PBIX / Phase 0 metric spec — no unverified targets.
 */
export const DEFINITIONS = {
  ridership: {
    label: 'Ridership',
    unit: 'pax',
    formula: 'Σ total_passengers',
    how: 'Sum of adult + child passengers on every ETM / Conductor ticket row in the selected filters (dates, routes, hours, weekdays).',
    source: 'ETM tickets → route_day_summary / daily totals',
  },
  revenue: {
    label: 'Revenue',
    unit: 'inr',
    formula: 'Σ fare revenue',
    how: 'Sum of fare collected on ticket rows in the selected filters.',
    source: 'ETM tickets → route_day_summary / daily totals',
  },
  lf: {
    label: 'Load Factor (LF)',
    unit: 'pct',
    formula: 'Σ passenger-km ÷ Σ capacity-km',
    how: 'Passenger-km and capacity-km are summed for the selection, then divided. Period LF is recomputed from those sums (not an average of daily LFs).',
    source: 'trip_summary / route_day_summary (PBIX Load Factor)',
    note: 'Uses scheduled seating capacity, not crush capacity. Needs Stage Km from the distance workbook for passenger-km.',
  },
  capacity_km: {
    label: 'Capacity-km',
    unit: 'km',
    formula: 'route length × vehicle seating capacity (per trip), then summed',
    how: 'For each trip: route_length_km × seating capacity of the bus. Summed over trips in the filter.',
    source: 'trip_summary (routes × vehicles)',
  },
  atl: {
    label: 'Average Trip Length (ATL)',
    unit: 'km',
    formula: 'Σ passenger-km ÷ ridership',
    how: 'Total passenger-kilometres in the selection divided by total boardings.',
    source: 'route_day_summary (PBIX ATL)',
  },
  ppt: {
    label: 'Passengers per Trip (PPT)',
    unit: 'pax',
    formula: 'ridership ÷ trips',
    how: 'Total boardings divided by number of trips operated in the selection.',
    source: 'route_day_summary',
  },
  pax_per_bus: {
    label: 'Passengers per Bus',
    unit: 'pax',
    formula: 'ridership ÷ bus-days',
    how: 'Total boardings divided by sum of buses in service across route-days (bus-days).',
    source: 'route_day_summary (n_buses)',
  },
  fare_yield: {
    label: 'Fare Yield',
    unit: 'inr',
    formula: 'revenue ÷ ridership',
    how: 'Total fare revenue divided by total boardings — average fare per passenger.',
    source: 'route_day_summary',
    note: 'Same as revenue per passenger.',
  },
  rev_per_passenger: {
    label: 'Revenue per Passenger',
    unit: 'inr',
    formula: 'revenue ÷ ridership',
    how: 'Identical to fare yield.',
    source: 'route_day_summary',
    note: 'Same as fare yield.',
  },
  epkm: {
    label: 'Earnings per km (EPKM)',
    unit: 'inr',
    formula: 'Σ revenue_trip ÷ (AVERAGE(route_length_km) × trip count)',
    how: 'PBIX EPKM: total trip revenue divided by (mean route length of trips × number of distinct trips).',
    source: 'kpi_daily ← etram.metrics.kpis.kpi_epkm',
  },
  epb: {
    label: 'Earnings per Bus (EPB)',
    unit: 'inr',
    formula: 'Σ revenue ÷ Σ n_buses',
    how: 'Total revenue divided by bus-days in the selection (average revenue per bus-day).',
    source: 'kpi_daily ← etram.metrics.kpis.kpi_epb (PBIX EPB)',
  },
  rev_per_trip: {
    label: 'Revenue per Trip',
    unit: 'inr',
    formula: 'revenue ÷ trips',
    how: 'Total fare revenue divided by trips operated.',
    source: 'route_day_summary',
  },
  trips: {
    label: 'Service Trips',
    unit: 'count',
    formula: 'Σ n_trips',
    how: 'Count of bus trips operated in the selection (from route-day / trip summary).',
    source: 'route_day_summary',
  },
  trips_per_bus: {
    label: 'Trips per Bus',
    unit: 'count',
    formula: 'Σ n_trips ÷ Σ n_buses',
    how: 'Trips operated divided by bus-days.',
    source: 'kpi_daily / route_day_summary (PBIX No. of trip/bus)',
  },
  headway: {
    label: 'Headway',
    unit: 'min',
    formula: 'selected time interval (min) ÷ trip count',
    how: 'PBIX Tripwise_Summary Headway (mins): (MAX(Timeslot_2) − MIN(timeslot_1)) in minutes, divided by COUNT(bus_trip_key). Timeslots are floored to 30 minutes. Overview/Efficiency use this from kpi_daily. Temporal peak/off-peak uses the same divisor (span ÷ trip count) on hourly bins.',
    source: 'kpi_daily ← etram.metrics.kpis.kpi_headway_mins (PBIX Headway mins)',
    note: 'This is the PBIX measure (span ÷ n), not mean gap between successive departures (span ÷ (n−1)). Network-wide filters mix routes; for route comparisons select one route on Temporal.',
  },
  vehicle_km: {
    label: 'Vehicle-km',
    unit: 'km',
    formula: 'Σ (route length × n_trips)',
    how: 'For each route-day: route_length × trips, then summed across the selection.',
    source: 'kpi_daily ← etram.metrics.kpis.kpi_vehicle_km (PBIX Vehicle KM)',
  },
  vehicle_utilization: {
    label: 'Vehicle Utilization',
    unit: 'km',
    formula: 'vehicle-km ÷ bus-days',
    how: 'Total vehicle-km divided by bus-days — average km operated per bus-day.',
    source: 'kpi_daily (vehicle_km_per_bus)',
  },
  pax_km: {
    label: 'Passenger-km',
    unit: 'km',
    formula: 'Σ (passengers × stage_km)',
    how: 'Each ticket’s passengers multiplied by origin–destination Stage Km from the stop–stop distance matrix, then summed.',
    source: 'ETM tickets + distance workbook → ingest pax_km',
    note: 'Without the optional distance file, Stage Km / LF / ATL are incomplete.',
  },
  peak_load: {
    label: 'Peak Load',
    unit: 'pax',
    formula: 'max(passenger load along stop sequence)',
    how: 'On each trip, cumulative boardings minus alightings at each stop; peak load is the maximum onboard count.',
    source: 'ba_stop_trip (BA Pattern)',
  },
  boarding: {
    label: 'Boarding',
    unit: 'pax',
    formula: 'Σ passengers where stop is origin',
    how: 'Sum of ticket passengers whose boarding stop matches the stop (or map selection).',
    source: 'ba_stop_trip / tickets',
  },
  alighting: {
    label: 'Alighting',
    unit: 'pax',
    formula: 'Σ passengers where stop is destination',
    how: 'Sum of ticket passengers whose alighting stop matches the stop (or map selection).',
    source: 'ba_stop_trip / tickets',
  },
  bunching: {
    label: 'Bunching proxy',
    unit: 'ratio',
    formula: 'σ(peak-hour trip counts) ÷ mean(peak-hour trip counts)',
    how: '1) Peak hours = hours with ridership at or above the 75th percentile of hourly ridership. 2) Take trip counts for those hours. 3) Coefficient of variation (CV) = standard deviation ÷ mean. Higher CV means more uneven trip supply across peak hours.',
    source: 'Temporal page (derived from hourly temporal rows)',
    note: 'Proxy only — not GPS headway gaps between successive buses on one route.',
  },
  peak_share: {
    label: 'Peak share',
    unit: 'pct',
    formula: 'peak-hour ridership ÷ total ridership',
    how: 'Ridership in peak hours (75th-percentile rule) as a share of all ridership in the selected hours/days.',
    source: 'Temporal page',
  },
} as const satisfies Record<string, MetricDefinition>

export type DefinitionKey = keyof typeof DEFINITIONS

export const getDefinition = (key: DefinitionKey): MetricDefinition => DEFINITIONS[key]

export const DEFINITION_KEYS = Object.keys(DEFINITIONS) as DefinitionKey[]
