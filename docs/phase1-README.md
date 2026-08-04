# Phase 1 — Ingest

Excel → canonical Parquet + DQ report (no Postgres, no API).

```bash
pip install -r requirements.txt
python -m etram.ingest --agency bhavnagar
```

Outputs under `data/canonical/{agency_id}/`:
- agencies, stops, routes, vehicles, tickets, stop_sequence, time_slots (parquet)
- dq_report.json
