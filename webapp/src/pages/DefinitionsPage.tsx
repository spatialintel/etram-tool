import { Card, DataTable, type Column } from '../components/ui'
import { DEFINITION_KEYS, DEFINITIONS, type DefinitionKey, type MetricDefinition } from '../lib/definitions'
import { UNIT_LABEL } from '../lib/format'

type DefRow = {
  key: string
  label: string
  unit: string
  formula: string
  how: string
  source: string
  note: string
}

export function DefinitionsPage() {
  const rows: DefRow[] = DEFINITION_KEYS.map((key) => {
    const d = DEFINITIONS[key] as MetricDefinition
    return {
      key,
      label: d.label,
      unit: UNIT_LABEL[d.unit] || d.unit || 'count',
      formula: d.formula,
      how: d.how,
      source: d.source,
      note: d.note ?? '\u2014',
    }
  })

  const columns: Column<DefRow>[] = [
    { key: 'label', header: 'Metric', numeric: false },
    { key: 'unit', header: 'Unit', numeric: false },
    { key: 'formula', header: 'Formula', numeric: false },
    { key: 'how', header: 'How calculated', numeric: false },
    { key: 'source', header: 'Data source', numeric: false },
    { key: 'note', header: 'Notes', numeric: false },
  ]

  return (
    <div className="page">
      <Card
        title="Metric definitions"
        subtitle="Every KPI on the dashboard — formula, calculation steps, and data source. The same text appears on ⓘ tips next to each metric."
      >
        <p className="definitions-lead">
          Formulas follow the Power BI (PBIX) / Phase 0 metric specification. There are no unverified
          targets or benchmarks. Click ⓘ on any KPI card for the same explanation without leaving the page.
        </p>
        <DataTable
          rows={rows}
          columns={columns}
          initialSort={{ key: 'label', dir: 'asc' }}
          searchable
          exportName="metric-definitions"
          rowKey={(r) => r.key}
          pageSize={30}
        />
      </Card>

      <div className="definitions-cards" aria-label="Metric calculation cards">
        {DEFINITION_KEYS.map((key: DefinitionKey) => {
          const d = DEFINITIONS[key] as MetricDefinition
          return (
            <Card key={key} title={d.label} subtitle={UNIT_LABEL[d.unit] || d.unit || 'count'}>
              <dl className="definitions-dl">
                <div>
                  <dt>Formula</dt>
                  <dd className="definitions-formula">{d.formula}</dd>
                </div>
                <div>
                  <dt>How calculated</dt>
                  <dd>{d.how}</dd>
                </div>
                <div>
                  <dt>Data source</dt>
                  <dd>{d.source}</dd>
                </div>
                {d.note ? (
                  <div>
                    <dt>Note</dt>
                    <dd>{d.note}</dd>
                  </div>
                ) : null}
              </dl>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
