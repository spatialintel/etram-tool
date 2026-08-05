# Phase 3 — React + ECharts + MapLibre UI

## Canonical location (source of truth)

Edit and commit only:

```
E-TRAM Tool_V7/webapp/
```

| Copy | Role |
|------|------|
| `webapp/` (this repo / G: project) | **Canonical** — edit here, push to GitHub |
| `C:\temp\etram-webapp` | **Run mirror only** — npm/vite when G: drive fails (`EBADF`) |

Sync after editing on G::

```powershell
.\scripts\sync_webapp_local.ps1
cd C:\temp\etram-webapp
npm run dev
```

If you edited on `C:\temp\etram-webapp`, pull back:

```powershell
.\scripts\sync_webapp_local.ps1 -Pull
```

Quality gate on the mirror: `npm run check` (encoding fix + `tsc` + vitest).

## 1) Refresh data artifacts

```bash
python scripts/export_phase3_data.py --agency-id bhavnagar
```

Writes `webapp/public/data/bhavnagar-dashboard.json` at **schema_version: 2** (meta/dq, kpi_daily, slot/vehicle/crew summaries, trip_distribution, stop_sequence_geo). Payload must stay under ~8 MB.

## 2) Backend API

From **project root** (not `webapp/`):

```powershell
.\scripts\run_api.ps1
```

Health: `http://127.0.0.1:8000/api/health`

## 3) Frontend

```powershell
.\scripts\sync_webapp_local.ps1
cd C:\temp\etram-webapp
npm install
npm run dev
```

Vite proxies `/api` → port 8000.

## Pages

| Section | Pages |
|---------|--------|
| Menu | Overview, Route Performance, Route Trends, Temporal, Stops & Map, Efficiency, Compare |
| Data | Upload, Data Quality |
| Help | Definitions |

Filters (date range + compare, multi-select, chips, URL hash) apply on analysis pages. Data Quality / Definitions hide the filter bar.

**Prefs toolbar:** dark mode, compact density, print, saved views (stored in `localStorage` via `lib/prefs.ts`).

Charts: Apache ECharts. Map: MapLibre (clusters, heat, basemap, polylines from `stop_sequence_geo`). Pages are `React.lazy`-loaded.

## Source layout

```
src/
  App.tsx              shell, nav, filters, prefs, lazy page switch
  types.ts             DashboardData (v2 fields optional)
  pages/               one file per page
  components/ui/       design-system primitives + PrefsBar
  components/          Chart, StopMap, ErrorBoundary
  lib/                 format, stats, filters, aggregate, definitions, prefs, upload, useDashboardData
```

Upgrade plan: `docs/superpowers/plans/2026-08-05-dashboard-elements-upgrade.md`.

Crew / conductor page is **not** shipped — requires explicit product approval (real `conductor_id` only; no route-proxy ranking).

## Notes

- Static JSON is the default load; uploads replace data via job API.
- Phase E widgets gate on `meta.schema_version >= 2` (`useDashboardData().isV2`).
- `Could not import module "etram"` → API was started from `webapp/` instead of project root.
- Encoding: Windows editor writes can corrupt TS to UTF-16 — run `npm run fix:enc` / `npm run check`.

## API hardening (v0.2)

- Upload filenames sanitized (basename only)
- One pipeline job at a time (shared lock)
- Ingest `load_ok` / BLOCK rules fail the job
- Stale `queued`/`running` jobs marked failed on API restart
- CORS defaults to local Vite origins (override with `CORS_ORIGINS`)