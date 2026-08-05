# Phase 3 — React + Plotly UI

## Canonical location (source of truth)

Edit and commit only:

```
E-TRAM Tool_V7/webapp/
```

| Copy | Role |
|------|------|
| `webapp/` (this repo / G: project) | **Canonical** — edit here, push to GitHub |
| `C:\temp\etram-webapp` | **Run mirror only** — npm/vite when G: drive fails (`EBADF`) |
| `C:\temp\webapp` | **Removed / stale** — do not use |

Sync after editing on G::

```powershell
.\scripts\sync_webapp_local.ps1
cd C:\temp\etram-webapp
npm run dev
```

If you edited on `C:\temp\etram-webapp` by mistake, pull back:

```powershell
.\scripts\sync_webapp_local.ps1 -Pull
```

GitHub remote: `https://github.com/spatialintel/etram-tool` — must match `webapp/` in this project.

## 1) Refresh data artifacts

```bash
python scripts/export_phase3_data.py
```

Generates `webapp/public/data/bhavnagar-dashboard.json`.

## 2) Backend API

From **project root** (not `webapp/`):

```powershell
.\scripts\run_api.ps1
```

Health: `http://127.0.0.1:8000/api/health`

## 3) Frontend

Prefer local mirror if G: npm fails:

```powershell
.\scripts\sync_webapp_local.ps1
cd C:\temp\etram-webapp
npm install
npm run dev
```

Vite proxies `/api` → port 8000.

## Implemented pages

- Overview (daily/weekly ridership & revenue, KPIs, day-over-day deltas)
- Route Performance
- Route Trends
- Temporal Analysis
- Stops & Map
- Efficiency
- Upload Data (Excel upload + job polling)

Conductor revenue is omitted until `conductor_id` exists in source ETM.

## Notes

- Static JSON is the default load; uploads replace data via job API.
- `Could not import module "etram"` → API was started from `webapp/` instead of project root.

## API hardening (v0.2)

- Upload filenames sanitized (basename only)
- One pipeline job at a time (shared lock)
- Ingest `load_ok` / BLOCK rules fail the job
- Stale `queued`/`running` jobs marked failed on API restart
- CORS defaults to local Vite origins (override with `CORS_ORIGINS`)
- Export: `python scripts/export_phase3_data.py --agency-id bhavnagar`
