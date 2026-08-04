# Phase 0 — Architecture decisions

Status: **locked for Phase 1–2**
Date: 2026-08-03

## Answers to open questions

### Do we need Postgres in Phase 1?

**No.** Postgres is optional and deferred until multi-agency production needs (shared server, concurrent users, auth-backed RLS).

For Phase 1–4 we use:

| Layer | Choice | Why |
|-------|--------|-----|
| Raw uploads | Excel files under `data/raw/{agency_id}/` | Matches current agency deliverables |
| Working store | **DuckDB** + Parquet under `data/canonical/` | Embedded SQL, no server, fast local analytics |
| Metrics | Pure Python over DuckDB/Parquet | Same formulas as PBIX DAX; easy to unit-test |
| UI | React + Plotly/Mapbox | Product UI; no Power BI |
| External city API | **Later** | Not available yet |

DuckDB is not "convert Excel to SQL and throw away Excel." Flow is:

```text
Excel upload
  → agency mapping (YAML)
  → write Parquet tables (canonical)
  → DuckDB queries / Python metrics
  → (later) thin local API for React
  → (much later) optional Postgres + agency APIs
```

### Is Excel upload enough?

**Yes for now.** Excel is the primary ingest mode for Phase 1–5. Multi-agency means each agency uploads its own files; only the **mapping YAML** changes.

### When does the API layer come in?

**Last — after the metrics model is proven accurate.**

Clarification of two different "APIs":

1. **Agency data API** (external push from cities) — **out of scope until Excel path is validated.**
2. **App backend API** (FastAPI serving React) — **after Phase 2 accuracy gate.** Until then, metrics are developed and tested as Python library functions (no React dependency).

Revised phase order:

| Phase | Focus |
|-------|--------|
| 0 | Contracts (this folder) |
| 1 | Excel → canonical Parquet/DuckDB (Bhavnagar) |
| 2 | Metrics engine + PBIX numeric cross-check |
| 3 | React UI reading metrics (local Python bridge or thin FastAPI) |
| 4 | Second agency mapping (no engine changes) |
| 5 | Auth, upload UI, optional Postgres, optional agency APIs |

## Non-negotiables for accuracy

1. Every metric formula is copied from PBIX DAX into `03-metric-spec.md` before coding.
2. Phase 2 does not close until Python matches PBIX for agreed route/date fixtures.
3. City-specific column names live only in mapping YAML — never in metric code or React.
4. Null fields (e.g. Gender, Driver ID in Bhavnagar) are flagged by DQ rules; pages that depend on them are disabled, not filled with fake zeros.

## Out of scope (explicit)

- Power BI (any form)
- Streamlit product shell
- Orphan PBIX measures that reference missing tables: `% Overlap`, `<2.5km` (no source data in Input files)
- Postgres / cloud deploy until requested
