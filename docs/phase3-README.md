# Phase 3 — React + Plotly/Mapbox UI

This phase delivers a working React dashboard shell over Phase 2 outputs.

## 1) Refresh data artifacts

```bash
python scripts/export_phase3_data.py
```

Generates:
- `webapp/public/data/bhavnagar-dashboard.json`

## 2) Backend API (upload + job processing)

Run from **project root** (not `webapp/`):

```powershell
# Windows
.\scripts\run_api.ps1

# Or manually
cd "E-TRAM Tool_V7"
$env:PYTHONPATH = (Get-Location).Path
uvicorn etram:app --host 0.0.0.0 --port 8000 --reload
```

Health check: `http://127.0.0.1:8000/api/health`

## 3) Frontend run

```bash
cd webapp
npm install
npm run dev
```

If `npm install` fails on the G: drive, copy `webapp` to `C:\temp\webapp` and run there.
The Vite dev server proxies `/api` to port 8000 — keep the API running from project root.

## Implemented pages

- Overview: daily ridership + revenue combo chart
- Route Performance: ridership + load factor by route on selected day
- Temporal: hourly ridership distribution
- Stops & Map: boarding/alighting map and passenger load line for sample trip

## Filters

- Service date
- Route code
- Route direction

## Notes

- Default view loads static JSON from `webapp/public/data/bhavnagar-dashboard.json`.
- Upload UI posts to `POST /api/jobs`; completed jobs replace dashboard data in-memory.
- Feature gates from DQ are shown in-app.
- **Common error:** `Could not import module "etram"` means uvicorn was started from `webapp/` instead of project root.
