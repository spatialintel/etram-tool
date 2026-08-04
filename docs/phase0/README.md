# Phase 0 — Complete

Contracts for the E-TRAM multi-agency product (React + Plotly/Mapbox, no Power BI).

| Doc | Purpose |
|-----|---------|
| [00-architecture-decisions.md](00-architecture-decisions.md) | Excel + DuckDB; no Postgres yet; API last |
| [01-canonical-schema.md](01-canonical-schema.md) | Tables metrics/UI may use |
| [02-agency-mapping-spec.md](02-agency-mapping-spec.md) | How agencies map Excel → canonical |
| [02-agency-mapping-bhavnagar.yaml](02-agency-mapping-bhavnagar.yaml) | Bhavnagar column map |
| [03-metric-spec.md](03-metric-spec.md) | PBIX DAX formulas to reimplement |
| [04-data-quality-contract.md](04-data-quality-contract.md) | Validation + feature gates |

## Phase 1 entry criteria

- [x] Architecture locked (Excel → Parquet/DuckDB)
- [x] Canonical schema defined
- [x] Bhavnagar mapping written from real headers
- [x] Metric formulas captured from PBIX
- [x] DQ + feature gates defined

Next: implement Bhavnagar ingest (Excel → canonical Parquet) + DQ report. No React yet. No FastAPI yet.
