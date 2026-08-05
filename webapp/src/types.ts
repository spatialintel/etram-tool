/**
 * Shape of `public/data/<agency>-dashboard.json`, produced by
 * `scripts/export_phase3_data.py`.
 *
 * Everything added by schema_version 2 is declared optional so a v1 payload
 * (static file on disk, cached copy, or a job result produced before the
 * exporter was upgraded) still type-checks and still loads.
 */

export interface AgencyInfo {
  agency_id: string
  agency_name: string
  date_min: string
  date_max: string
  routes: string[]
  route_directions: string[]
}

export interface DailyRow {
  service_date: string
  ridership: number
  revenue: number
  pax_km: number
  capacity_km: number
  trips: number
  buses: number
  lf: number
  /** schema_version 2 */
  day_name?: string
  week_no?: number
  week_label?: string
  week_start?: string
  week_end?: string
  male_ridership?: number
  female_ridership?: number
}

export interface RouteTrendRow {
  service_date: string
  route_code: string
  ridership: number
  revenue: number
  load_factor_route: number
  n_trips: number
  n_buses: number
  /** schema_version 2 */
  ridership_per_bus?: number
  revenue_per_bus?: number
  ridership_per_trip?: number
  revenue_per_trip?: number
  route_length_route?: number
  pax_km?: number
  capacity_km?: number
}

export interface TemporalRow {
  service_date: string
  route_code: string
  start_hour: number
  ridership: number
  revenue: number
  trips: number
  /** schema_version 2 — for hour x weekday heatmaps */
  day_name?: string
}

export interface StopMapRow {
  service_date: string
  route_direction_key: string
  stop_abbr: string
  stop_name: string
  boarding: number
  alighting: number
  peak_load: number
  latitude: number
  longitude: number
  /** schema_version 2 */
  route_code?: string
  total_passengers_at_stop?: number
}

export interface BaLineRow {
  service_date: string
  route_direction_key: string
  bus_trip_key: string
  stop_no: number
  stop_name: string
  boarding: number
  alighting: number
  passenger_load: number
}

/** Present from schema_version 2 onwards. */
export interface DashboardMeta {
  generated_at: string
  schema_version: number
  source_rows?: { route_day: number; trip: number; ba: number }
  load_ok?: boolean
  /** Raw DQ rules from `dq_report.json` */
  dq_rules?: Array<{
    table?: string
    id?: string
    level?: string
    value?: number | string | null
    message?: string
    [key: string]: unknown
  }>
  /** Raw DQ table stats from `dq_report.json` */
  dq_tables?: Record<string, { rows?: number; [key: string]: unknown }>
}

export interface KpiDailyRow {
  service_date: string | null
  route_code?: string | null
  ridership?: number
  revenue?: number
  n_trips?: number
  n_buses?: number
  pax_km?: number
  capacity_km?: number
  LF: number | null
  EPKM: number | null
  ATL: number | null
  EPKM_route: number | null
  EPB: number | null
  trips_per_bus: number | null
  vehicle_km: number | null
  vehicle_km_per_bus: number | null
  headway_mins: number | null
}

export interface SlotSummaryRow {
  service_date: string
  route_code: string
  time_slot_label: string
  trips: number
  ridership: number
  revenue: number
  pax_km: number
  capacity_km: number
}

export interface VehicleSummaryRow {
  service_date: string
  vehicle_id: string
  trips: number
  ridership: number
  revenue: number
  pax_km: number
  capacity_km: number
  veh_capacity?: number
  /** schema_version 2+ — Σ route_length_km */
  vehicle_km?: number
}

export interface CrewSummaryRow {
  service_date: string
  role: 'conductor' | 'driver' | string
  crew_id: string
  trips: number
  ridership: number
  revenue: number
  pax_km: number
  vehicle_km?: number
}

export interface OdTopRow {
  origin_abbr: string
  destination_abbr: string
  ridership: number
  revenue: number
  /** Present from the route/week-sliced export onwards; absent in older files. */
  route_code?: string
  /** Monday of the week the pair was counted in, with its inclusive end date. */
  week_start?: string
  week_end?: string
  service_date?: string
}

export interface TripDistributionBin {
  metric: 'ridership_trip' | 'trip_lf' | string
  bin_lo: number
  bin_hi: number
  count: number
}

export interface StopSequenceGeoRow {
  route_direction_key: string
  stop_no: number
  stop_abbr: string
  latitude: number
  longitude: number
  route_code?: string
}

export interface DashboardData {
  agency: AgencyInfo
  feature_gates: Record<string, boolean>
  daily: DailyRow[]
  route_trend: RouteTrendRow[]
  temporal: TemporalRow[]
  stop_map: StopMapRow[]
  ba_line_best_trip: BaLineRow[]
  meta?: DashboardMeta
  kpi_daily?: KpiDailyRow[]
  slot_summary?: SlotSummaryRow[]
  vehicle_summary?: VehicleSummaryRow[]
  crew_summary?: CrewSummaryRow[]
  trip_distribution?: TripDistributionBin[]
  stop_sequence_geo?: StopSequenceGeoRow[]
  od_top?: OdTopRow[]
}

export type Page =
  | 'overview'
  | 'routes'
  | 'trends'
  | 'temporal'
  | 'stops'
  | 'efficiency'
  | 'entities'
  | 'compare'
  | 'definitions'
  | 'upload'