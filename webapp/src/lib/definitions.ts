import type { Unit } from './format'

export type MetricDefinition = {
  label: string
  unit: Unit
  formula: string
  note?: string
}

/**
 * Every KPI shown in the UI must have an entry here. Surfaced through InfoTip
 * and the Definitions page so an agency can audit what a number means.
 * Formulas follow the PBIX / Phase 0 metric spec — no unverified targets.
 */
export const DEFINITIONS = {
  ridership: {
    label: 'Ridership',
    unit: 'pax',
    formula: 'Total passenger boardings recorded by ETM',
  },
  revenue: {
    label: 'Revenue',
    unit: 'inr',
    formula: 'Sum of fare collected from ETM transactions',
  },
  lf: {
    label: 'Load Factor (LF)',
    unit: 'pct',
    formula: 'passenger-km / capacity-km',
    note: 'Uses scheduled seating capacity (not crush capacity).',
  },
  atl: {
    label: 'Average Trip Length (ATL)',
    unit: 'km',
    formula: 'passenger-km / ridership',
  },
  ppt: {
    label: 'Passengers per Trip (PPT)',
    unit: 'pax',
    formula: 'ridership / trips',
    note: 'Average passengers carried per trip operated.',
  },
  pax_per_bus: {
    label: 'Passengers per Bus',
    unit: 'pax',
    formula: 'ridership / active buses',
    note: 'Ridership divided by buses in service (bus-days in the selected period).',
  },
  fare_yield: {
    label: 'Fare Yield',
    unit: 'inr',
    formula: 'revenue / ridership',
    note: 'Same as revenue per passenger. Average fare collected per boarding.',
  },
  rev_per_passenger: {
    label: 'Revenue per Passenger',
    unit: 'inr',
    formula: 'revenue / ridership',
    note: 'Same as fare yield.',
  },
  epkm: {
    label: 'Earnings per km (EPKM)',
    unit: 'inr',
    formula: 'revenue / (average route length × trip count)',
    note: 'Matches PBIX EPKM: SUM(revenue_trip) / (AVERAGE(route_length_km) × DISTINCTCOUNT(trip_id)).',
  },
  epb: {
    label: 'Earnings per Bus (EPB)',
    unit: 'inr',
    formula: 'revenue / active buses',
    note: 'Average revenue earned per bus-day in the selected period.',
  },
  rev_per_trip: {
    label: 'Revenue per Trip',
    unit: 'inr',
    formula: 'revenue / trips',
  },
  trips: {
    label: 'Service Trips',
    unit: 'count',
    formula: 'trips operated in the period',
  },
  trips_per_bus: {
    label: 'Trips per Bus',
    unit: 'count',
    formula: 'trips / active buses',
  },
  headway: {
    label: 'Headway',
    unit: 'min',
    formula: 'selected time interval (min) / trip count',
    note: 'From PBIX Tripwise_Summary: span of first to last trip start (30-min bins) divided by number of trips in the filter context. Prefer reading route-level Temporal views when comparing routes.',
  },
  vehicle_km: {
    label: 'Vehicle-km',
    unit: 'km',
    formula: 'route length × trips',
    note: 'Total distance operated by the fleet.',
  },
  vehicle_utilization: {
    label: 'Vehicle Utilization',
    unit: 'km',
    formula: 'vehicle-km / active buses',
    note: 'Average distance operated per bus-day.',
  },
  pax_km: {
    label: 'Passenger-km',
    unit: 'km',
    formula: 'sum of distance travelled per passenger',
  },
  peak_load: {
    label: 'Peak Load',
    unit: 'pax',
    formula: 'max onboard passengers at any stop',
  },
  boarding: {
    label: 'Boarding',
    unit: 'pax',
    formula: 'passenger boardings at a stop',
  },
  alighting: {
    label: 'Alighting',
    unit: 'pax',
    formula: 'passenger alightings at a stop',
  },
} as const satisfies Record<string, MetricDefinition>

export type DefinitionKey = keyof typeof DEFINITIONS

export const getDefinition = (key: DefinitionKey): MetricDefinition => DEFINITIONS[key]
