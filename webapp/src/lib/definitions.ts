import type { Unit } from './format'

export type MetricDefinition = {
  label: string
  unit: Unit
  formula: string
  note?: string
  target?: number
}

/**
 * Every KPI shown in the UI must have an entry here. Surfaced through InfoTip
 * and the Definitions page so an agency can audit what a number means.
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
    target: 0.6,
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
    formula: 'revenue / vehicle-km',
    note: 'Revenue earned for every kilometre operated.',
  },
  epb: {
    label: 'Earnings per Bus (EPB)',
    unit: 'inr',
    formula: 'revenue / active buses',
    note: 'Average revenue earned per operating bus per day.',
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
    target: 6,
    note: 'Target of 6 refers to daily scheduled trips per bus.',
  },
  headway: {
    label: 'Headway',
    unit: 'min',
    formula: 'service span / (departures - 1)',
    note: 'Estimated average interval between departures from observed first and last departure times. Not from a published timetable.',
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
    note: 'Average distance operated per bus per day.',
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
  cost_recovery: {
    label: 'Cost Recovery Ratio',
    unit: 'pct',
    formula: 'revenue / operating cost',
    note: 'Not shown until operating cost data is uploaded.',
  },
  on_time_performance: {
    label: 'On-time Performance',
    unit: 'pct',
    formula: 'trips on time / trips observed',
    note: 'Not shown until GPS or schedule adherence data is available.',
  },
} as const satisfies Record<string, MetricDefinition>

export type DefinitionKey = keyof typeof DEFINITIONS

export const getDefinition = (key: DefinitionKey): MetricDefinition => DEFINITIONS[key]
