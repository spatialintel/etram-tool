# Phase 2 — Metrics engine

Build derived analytical tables and KPIs from canonical Parquet. No React / API yet.

```bash
python -m etram.ingest --agency bhavnagar   # if needed
python -m etram.metrics --agency bhavnagar
python scripts/validate_phase2.py
```

Outputs in `data/canonical/{agency}/`:
- `trip_summary.parquet`
- `route_day_summary.parquet`
- `ba_stop_trip.parquet`
- `metrics_snapshot.json`

Baseline: `tests/fixtures/pbix_baseline_bhavnagar.json`

Accuracy notes:
- Trip grain = unique (date, route_direction, bus_trip). PBIX trip table has duplicate rows; we match the unique grain (21,327).
- Agency-wide capacity in PBIX Routewise is slightly inflated by those duplicates; we match unique-trip capacity.
- Route-day and R1 2026-04-01 KPIs match PBIX exactly (ridership, revenue, LF, EPKM, ATL, EPB).
