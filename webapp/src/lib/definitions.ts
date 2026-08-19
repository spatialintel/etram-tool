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
 */
export const DEFINITIONS = {
  ridership: {
    label: 'Ridership',
    unit: 'pax',
    formula: 'Σ passengers',
    how: 'Sum of adult and child passengers on every ticket in the selected dates, routes, hours, and weekdays.',
    source: 'Tickets',
  },
  revenue: {
    label: 'Revenue',
    unit: 'inr',
    formula: 'Σ fare revenue',
    how: 'Sum of fare collected on tickets in the selected filters.',
    source: 'Tickets',
  },
  lf: {
    label: 'Load Factor (LF)',
    unit: 'pct',
    formula: 'Σ passenger-km ÷ Σ capacity-km',
    how: 'Passenger-km and capacity-km are summed for the selection, then divided. Period load factor uses those sums, not an average of daily percentages.',
    source: 'Tickets, route lengths, and seating capacity',
    note: 'The 70% marker on Efficiency is the MoHUA ESCBS city-bus planning standard.',
  },
  capacity_km: {
    label: 'Capacity-km',
    unit: 'km',
    formula: 'route length × seating capacity (per trip), then summed',
    how: 'For each trip: route length × seating capacity of the bus. Summed over trips in the filter.',
    source: 'Trips, routes, and vehicles',
  },
  atl: {
    label: 'Average Trip Length (ATL)',
    unit: 'km',
    formula: 'Σ passenger-km ÷ ridership',
    how: 'Total passenger-kilometres in the selection divided by total boardings.',
    source: 'Tickets and stop-to-stop distances',
  },
  ppt: {
    label: 'Passengers per Trip (PPT)',
    unit: 'pax',
    formula: 'ridership ÷ trips',
    how: 'Total boardings divided by number of trips operated in the selection.',
    source: 'Tickets and trips',
  },
  pax_per_bus: {
    label: 'Passengers per Bus',
    unit: 'pax',
    formula: 'ridership ÷ bus-days',
    how: 'Total boardings divided by the sum of buses in service across route-days (bus-days).',
    source: 'Tickets and fleet in service',
  },
  fare_yield: {
    label: 'Fare Yield',
    unit: 'inr',
    formula: 'revenue ÷ ridership',
    how: 'Total fare revenue divided by total boardings — average fare per passenger.',
    source: 'Tickets',
    note: 'Same as revenue per passenger.',
  },
  rev_per_passenger: {
    label: 'Revenue per Passenger',
    unit: 'inr',
    formula: 'revenue ÷ ridership',
    how: 'Identical to fare yield.',
    source: 'Tickets',
    note: 'Same as fare yield.',
  },
  epkm: {
    label: 'Earnings per km (EPKM)',
    unit: 'inr',
    formula: 'Σ revenue ÷ Σ vehicle-km',
    how: 'Total fare revenue divided by total vehicle-kilometres in the selection (route length × trips, summed).',
    source: 'Tickets and route lengths',
  },
  epb: {
    label: 'Earnings per Bus (EPB)',
    unit: 'inr',
    formula: 'Σ revenue ÷ Σ bus-days',
    how: 'Total revenue divided by bus-days in the selection (average revenue per bus-day).',
    source: 'Tickets and fleet in service',
  },
  rev_per_trip: {
    label: 'Revenue per Trip',
    unit: 'inr',
    formula: 'revenue ÷ trips',
    how: 'Total fare revenue divided by trips operated.',
    source: 'Tickets and trips',
  },
  trips: {
    label: 'Service Trips',
    unit: 'count',
    formula: 'Σ trips',
    how: 'Count of bus trips operated in the selection.',
    source: 'Trips',
  },
  trips_per_bus: {
    label: 'Trips per Bus',
    unit: 'count',
    formula: 'Σ trips ÷ Σ bus-days',
    how: 'Trips operated divided by bus-days.',
    source: 'Trips and fleet in service',
  },
  headway: {
    label: 'Headway',
    unit: 'min',
    formula: 'per route: (last start − first start) ÷ (trips − 1); network: trip-weighted mean',
    how: 'On each route and direction, minutes from the first trip start to the last, divided by one less than the number of trips (needs two or more trips). The network figure weights those intervals by trip count. Peak and off-peak use the same method on hourly bins for each route-day.',
    source: 'Trip start times',
  },
  vehicle_km: {
    label: 'Vehicle-km',
    unit: 'km',
    formula: 'Σ (route length × trips)',
    how: 'For each route-day: route length × trips, then summed across the selection.',
    source: 'Trips and route lengths',
  },
  vehicle_utilization: {
    label: 'Vehicle Utilization',
    unit: 'km',
    formula: 'vehicle-km ÷ bus-days',
    how: 'Total vehicle-km divided by bus-days — average km operated per bus-day.',
    source: 'Trips, route lengths, and fleet in service',
    note: 'The 200 km/bus/day marker is the MoHUA/CEPT city-bus planning floor.',
  },
  pax_km: {
    label: 'Passenger-km',
    unit: 'km',
    formula: 'Σ (passengers × stage km)',
    how: 'Each ticket’s passengers multiplied by origin–destination distance, then summed.',
    source: 'Tickets and the distance workbook',
    note: 'Needs the distance file for complete Stage Km, load factor, and ATL.',
  },
  peak_load: {
    label: 'Peak Load',
    unit: 'pax',
    formula: 'max(passenger load along stop sequence)',
    how: 'On each trip, cumulative boardings minus alightings at each stop; peak load is the maximum onboard count.',
    source: 'Tickets and stop sequence',
  },
  boarding: {
    label: 'Boarding',
    unit: 'pax',
    formula: 'Σ passengers where stop is origin',
    how: 'Sum of ticket passengers whose boarding stop matches the stop (or map selection).',
    source: 'Tickets',
  },
  alighting: {
    label: 'Alighting',
    unit: 'pax',
    formula: 'Σ passengers where stop is destination',
    how: 'Sum of ticket passengers whose alighting stop matches the stop (or map selection).',
    source: 'Tickets',
  },
  bunching: {
    label: 'Peak-hour trip variation',
    unit: 'ratio',
    formula: 'σ(peak-hour trip counts) ÷ mean(peak-hour trip counts)',
    how: 'Peak hours are hours with ridership at or above the 75th percentile of hourly ridership. Variation is the standard deviation of those hours’ trip counts divided by their mean. Higher values mean trip supply is less even across busy hours.',
    source: 'Hourly trip counts',
  },
  peak_share: {
    label: 'Peak share',
    unit: 'pct',
    formula: 'peak-hour ridership ÷ total ridership',
    how: 'Ridership in peak hours (75th-percentile rule) as a share of all ridership in the selected hours and days.',
    source: 'Hourly ridership',
  },
  commercial_speed: {
    label: 'Commercial speed',
    unit: 'kmh',
    formula: 'Σ route length ÷ Σ trip hours',
    how: 'Trip distance divided by time from trip start to trip end, summed across trips. Trips shorter than 3 minutes or longer than 6 hours are dropped.',
    source: 'Trips and route lengths',
  },
  mlp_stop: {
    label: 'Max-load stop',
    unit: 'pax',
    formula: 'stop with the highest peak onboard load',
    how: 'Among stops in the selection, the stop whose peak onboard load is highest. Peak load is a maximum, not a sum of daily peaks.',
    source: 'Tickets and stop sequence',
  },
  child_share: {
    label: 'Child share',
    unit: 'pct',
    formula: 'child passengers ÷ ridership',
    how: 'Child passengers on tickets divided by total passengers in the selection.',
    source: 'Tickets',
  },
  pass_mix: {
    label: 'Pass category mix',
    unit: 'pct',
    formula: 'passengers in each pass category ÷ ticketed passengers',
    how: 'Ticket passengers grouped by pass category for the selected dates.',
    source: 'Tickets',
  },
  pax_per_vkm: {
    label: 'Passengers per vehicle-km',
    unit: 'ratio',
    formula: 'ridership ÷ vehicle-km',
    how: 'Total boardings divided by vehicle-kilometres operated in the selection.',
    source: 'Tickets, trips, and route lengths',
  },
  fare_per_pax_km: {
    label: 'Fare per passenger-km',
    unit: 'inr',
    formula: 'revenue ÷ passenger-km',
    how: 'Total fare revenue divided by passenger-kilometres — yield per kilometre travelled by passengers.',
    source: 'Tickets and the distance workbook',
  },
  short_turn: {
    label: 'Short-turn signal',
    unit: 'count',
    formula: 'lines whose max-load stop is mid-route',
    how: 'A line is flagged when its highest peak load sits between about 15% and 70% along the published stop sequence, and is not one of the last two stops.',
    source: 'Peak load and stop sequence',
  },
} as const satisfies Record<string, MetricDefinition>

export type DefinitionKey = keyof typeof DEFINITIONS

export const getDefinition = (key: DefinitionKey): MetricDefinition => DEFINITIONS[key]

export const DEFINITION_KEYS = Object.keys(DEFINITIONS) as DefinitionKey[]
