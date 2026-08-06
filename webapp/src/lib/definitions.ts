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
    formula: 'Count of ticketed passengers',
  },
  revenue: { label: 'Revenue', unit: 'inr', formula: 'Sum of ticket fare' },
  lf: {
    label: 'Load Factor (LF)',
    unit: 'pct',
    formula: 'pax-km / capacity-km',
    note: 'Uses seated capacity, not crush load',
    target: 0.6,
  },
  atl: { label: 'Average Trip Length (ATL)', unit: 'km', formula: 'pax-km / ridership' },
  fare_yield: {
    label: 'Fare Yield',
    unit: 'inr',
    formula: 'revenue / ridership',
    note: 'Average fare collected per passenger',
  },
  epkm: {
    label: 'Earnings per km (EPKM)',
    unit: 'inr',
    formula: 'revenue / vehicle-km',
    note: 'Revenue earned for every kilometre operated',
  },
  epb: {
    label: 'Earnings per Bus (EPB)',
    unit: 'inr',
    formula: 'revenue / buses',
    note: 'Daily revenue productivity of one bus in service',
  },
  rev_per_trip: { label: 'Revenue per Trip', unit: 'inr', formula: 'revenue / trips' },
  trips_per_bus: { label: 'Trips per Bus', unit: 'count', formula: 'trips / buses', target: 6 },
  headway: {
    label: 'Headway',
    unit: 'min',
    formula: 'service span / trips',
    note: 'Estimated from first and last observed trip hour, not from a timetable',
  },
  vehicle_km: { label: 'Vehicle km', unit: 'km', formula: 'route length x trips' },
  pax_km: { label: 'Passenger km', unit: 'km', formula: 'Sum of distance travelled per passenger' },
  peak_load: { label: 'Peak Load', unit: 'pax', formula: 'Max onboard passengers at any stop' },
  boarding: { label: 'Boarding', unit: 'pax', formula: 'Passengers boarding at a stop' },
  alighting: { label: 'Alighting', unit: 'pax', formula: 'Passengers alighting at a stop' },
} as const satisfies Record<string, MetricDefinition>

export type DefinitionKey = keyof typeof DEFINITIONS

export const getDefinition = (key: DefinitionKey): MetricDefinition => DEFINITIONS[key]
