import { Card, DataTable, type Column } from '../components/ui'
import { DEFINITIONS, type DefinitionKey, type MetricDefinition } from '../lib/definitions'
import { UNIT_LABEL } from '../lib/format'

type DefRow = {
  key: string
  label: string
  unit: string
  formula: string
  target: string
  note: string
  source: string
}

const SOURCE_HINT: Partial<Record<DefinitionKey, string>> = {
  ridership: 'route_day_summary / tickets',
  revenue: 'route_day_summary / tickets',
  lf: 'pax_km & capacity_km (route_day or trip)',
  atl: 'pax_km / ridership',
  fare_yield: 'revenue / ridership',
  epkm: 'kpi_daily (Python summarize_kpis)',
  epb: 'kpi_daily (Python summarize_kpis)',
  trips_per_bus: 'n_trips / n_buses',
  headway: 'kpi_daily / temporal estimate',
  vehicle_km: 'kpi_daily (Python summarize_kpis)',
  pax_km: 'route_day_summary',
  peak_load: 'ba_stop_trip passenger_load max',
  boarding: 'ba_stop_trip',
  alighting: 'ba_stop_trip',
  rev_per_trip: 'revenue / trips',
}

export function DefinitionsPage() {
  const rows: DefRow[] = (Object.keys(DEFINITIONS) as DefinitionKey[]).map((key) => {
    const d = DEFINITIONS[key] as MetricDefinition
    return {
      key,
      label: d.label,
      unit: UNIT_LABEL[d.unit] || d.unit,
      formula: d.formula,
      target:
        d.target == null
          ? '\u2014'
          : d.unit === 'pct'
            ? `${(d.target * 100).toFixed(0)}%`
            : String(d.target),
      note: d.note ?? '\u2014',
      source: SOURCE_HINT[key] ?? 'Derived in UI or export',
    }
  })

  const columns: Column<DefRow>[] = [
    { key: 'label', header: 'Metric', numeric: false },
    { key: 'unit', header: 'Unit', numeric: false },
    { key: 'formula', header: 'Formula', numeric: false },
    { key: 'target', header: 'Target', align: 'right', numeric: false },
    { key: 'source', header: 'Data source', numeric: false },
    { key: 'note', header: 'Notes', numeric: false },
  ]

  return (
    <div className="page">
      <Card
        title="Metric definitions"
        subtitle="Single source of truth used by InfoTips across the dashboard"
      >
        <DataTable
          rows={rows}
          columns={columns}
          initialSort={{ key: 'label', dir: 'asc' }}
          searchable
          exportName="metric-definitions"
          rowKey={(r) => r.key}
          pageSize={25}
        />
      </Card>
    </div>
  )
}