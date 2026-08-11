# AGENTS.md

Transit ridership analytics (Excel → Python metrics → React dashboard) for Bhavnagar. One repo runs both a Python/FastAPI pipeline and a React/Vite UI; Railway builds the React bundle and serves it from FastAPI.

## Layout

| Path | Role |
|------|------|
| `etram/__init__.py` | FastAPI app `etram:app` — upload jobs (`/api/jobs`), health, then mounts `webapp/dist` at `/` |
| `etram/ingest/` | Excel → canonical Parquet + DQ report (`dq.py`, `load.py`, `upload_prepare.py`, `stop_map.py`, `route_map.py`, `stage_km.py`, `transforms.py`) |
| `etram/metrics/` | KPIs over canonical Parquet (`build.py`, `kpis.py`, `trip_summary.py`, `route_day.py`, `ba_pattern.py`, `canonical.py`) |
| `config/agencies/{id}.yaml` | Per-agency Excel→canonical column map. New agency = new YAML, no engine changes. |
| `data/canonical/{agency}/` | Generated Parquet (`agencies`, `stops`, `routes`, `vehicles`, `tickets`, `stop_sequence`, `time_slots`, `trip_summary`, `route_day_summary`, `ba_stop_trip`) + `dq_report.json` + `metrics_snapshot.json`. Gitignored. |
| `data/jobs/{job_id}/` | Per-upload inputs, prepared CSV, `result.json`. Gitignored. |
| `scripts/` | Standalone scripts — `export_phase3_data.py` (canonical → dashboard JSON), May-specific builders, `run_api.ps1` |
| `tests/` | Python tests (pytest-style, run via `python -m pytest`) |
| `webapp/` | React 19 + Vite 8 + ECharts + MapLibre. `npm run dev` for UI, `npm run build` for production. |
| `docs/phase0/` | Contracts (architecture, schema, mapping, metric, DQ). `docs/phase1-README.md` … `phase3-README.md` walk through phases. |
| `Input files/` | Source data, gitignored. May pack is the canonical upload shape (`Upload/Drag and drop files/`). |
| `Dockerfile`, `railway.json` | Multi-stage Node→Python deploy, builder = Dockerfile (not Railpack). |

## Pipeline (every output follows this order)

```
etram.ingest.upload_prepare  →  etram.ingest.load.run_ingest  →
etram.metrics.build.run_metrics  →  scripts/export_phase3_data.py
```

The FastAPI `_run_job` in `etram/__init__.py` runs all four with a single `PIPELINE_LOCK` plus a cross-process file lock on `data/.pipeline.lock` (see `etram/_file_lock.py`). The registry (`data/jobs/registry.json`) is rewritten atomically via `tmp + os.replace` under a second cross-process lock (`data/jobs/.registry.lock`), and `_persist_jobs` merges the in-memory `JOBS` over the on-disk registry (newer `updated_at` wins) so separate workers do not clobber each other. Read endpoints use `_registry_view()` (in-memory overlaid on disk) so a worker can see jobs created by another process. Export is capped at 16 MB (`MAX_PAYLOAD_BYTES`); over-budget jobs fail loudly with a hint about `slot_summary`/`vehicle_summary`.

## Setup

PowerShell, project root:

```powershell
pip install -r requirements.txt
$env:PYTHONPATH = (Get-Location).Path
.\scripts\run_api.ps1                 # uvicorn etram:app --port 8000 --reload
```

Frontend (separate terminal):

```powershell
cd webapp
npm install
npm run dev                           # Vite on :5173, proxies /api → :8000
```

Static fallback data lives at `webapp/public/data/bhavnagar-dashboard.json`; production reads the same file via the React bundle, **but the live portal starts empty — see "Frontend" below**.

## Run a single stage locally

```powershell
# Phase 1 (Excel → canonical Parquet + dq_report.json)
python -m etram.ingest --agency bhavnagar

# Phase 2 (KPIs + metrics_snapshot.json)
python -m etram.metrics --agency bhavnagar

# Phase 3 export (canonical → dashboard JSON; default out webapp/public/data/)
python ../scripts/export_phase3_data.py --agency-id bhavnagar
# or with custom out:
python ../scripts/export_phase3_data.py --agency-id bhavnagar --out data/jobs/<job_id>/result.json
```

A job that fails ingest (any `BLOCK` DQ rule) raises `RuntimeError("Ingest rejected: …")`. The pipeline never silently fabricates missing fields — feature gates stay OFF when coverage is low.

## Tests

Python (root, no `pytest.ini`):
```powershell
python -m pytest tests -q
```

Frontend (Vitest, node env, pure-logic + light component smoke only — see `webapp/vitest.config.ts`):
```powershell
cd webapp
npm test
npm run check       # encoding fix + JSX escape check + tsc + vitest
```

## Frontend — things that will bite you

- **Upload-first portal.** `src/lib/useDashboardData.ts` deliberately does *not* fetch `/data/*.json`. Until a successful upload replaces session state, `App.tsx` keeps the user on the `upload` page and renders the empty shell. The `bhavnagar-dashboard.json` in `public/data/` is only used as a fallback by some local setups.
- **`schema_version: 2`** in the export payload. `useDashboardData.isV2` gates Phase-E widgets; bump the export version and any consumer that uses `isV2` if you change the shape.
- **JSX escapes ≠ JS escapes.** `webapp/scripts/check-jsx-escapes.mjs` fails the build if `title="\u00B7"` (or similar) appears in a JSX attribute — the literal text is shown to the user. Put escaped strings inside `{}` braces, not in attribute quotes.
- **UTF-16 LE source files.** Some Windows tooling in this repo writes `.ts/.tsx/.css/.json/.mjs` as UTF-16 LE. `webapp/scripts/fix-encoding.mjs` rewrites them to UTF-8 BOM-less; `npm run check` runs it before typecheck.
- **OXlint rules.** `webapp/.oxlintrc.json` enables `react/rules-of-hooks` (error) and `react/only-export-components` (warn, `allowConstantExport: true`). Lint via `npm run lint`.
- **Tsconfig.** `webapp/tsconfig.app.json` uses `verbatimModuleSyntax`, `noUnusedLocals/Parameters`, `erasableSyntaxOnly`. Re-exports need `export type`.
- **Vite dev proxy.** `/api` → `http://127.0.0.1:8000`. Run the API first or the UI will 404 on `/api/jobs`.

## Adding a new agency

1. Copy `config/agencies/bhavnagar.yaml` to `config/agencies/{id}.yaml`; update `agency_id`, `agency_name`, the column maps under `tickets/stops/routes/vehicles/stop_sequence`, and any `transforms`.
2. Add the agency id to the API (the upload endpoint validates against `^[a-z][a-z0-9_-]{0,63}$` and the existence of `config/agencies/{id}.yaml`).
3. No code changes to `etram/ingest/` or `etram/metrics/` are required — the pipeline is YAML-driven.

If the agency has no KML, leave `kml_route_lengths.path` empty (`""`) and the loader strips the section. `etram/ingest/load.py:_kml_route_lengths` is the only consumer.

## Deploy (Railway)

- `railway.json` pins builder to `Dockerfile` (root). Do not let Railway auto-detect Python/Railpack — the repo is mixed Python+Node.
- Multi-stage build: `node:22-alpine` builds `webapp/dist`, then `python:3.11-slim` copies it in and runs `uvicorn etram:app --port ${PORT:-8080}`.
- Healthcheck: `/api/health` (180s timeout, ON_FAILURE restart, 3 retries).
- Mount a volume at `/app/data` so `data/jobs/` and uploaded data survive restarts. Both cross-process lock files (`data/.pipeline.lock`, `data/jobs/.registry.lock`) live under the same mount — a shared volume is what lets multiple replicas serialize; without it the file locks only serialize processes on one host. ≥ 2 GB RAM for full-month May packs (smaller tiers OOM/restart).

## Gotchas

- **PYTHONPATH = repo root** is required for `etram` imports. `scripts/run_api.ps1` and the README both set this. Without it: `ModuleNotFoundError: etram`.
- **Single-worker uvicorn is the supported deployment.** `etram/__init__.py` holds a `threading.Lock` (in-process) and a `FileLock` on `data/.pipeline.lock` (cross-process, `fcntl.flock` on POSIX / `msvcrt.locking` on Windows). Both serialize the ingest→metrics→export pipeline against `data/canonical/{agency}/`. The job registry is merged (newer `updated_at` wins) under a second cross-process lock so workers don't clobber each other, and reads go through `_registry_view()`. **Remaining multi-worker gap:** `_reconcile_stale_jobs` runs only on startup against the in-memory `JOBS`, so a worker restart will mark jobs another live worker is running as `failed` — the stale-reconciliation logic assumes one owner. One uvicorn worker remains the supported deployment; the file locks are a safety net for the case where multiple workers are run anyway. If you move the registry or canonical data to a database later, re-evaluate. Do not run more than one `python -m etram.ingest/metrics` against the same agency concurrently.
- **`run_api.ps1` is itself saved as UTF-16 LE.** Open it in a tool that re-saves as UTF-8 if you edit it, or PowerShell will refuse to parse it.
- **G: drive npm problems.** README documents `scripts/sync_webapp_local.ps1` — mirrors `webapp/` to `C:\temp\etram-webapp` (excluding `node_modules`, `dist`, `.vite`) when npm fails on the network drive. Do not keep a second editable copy at `C:\temp\webapp`.
- **Dashboard JSON size.** `export_phase3_data.py` enforces a 16 MB hard cap. The script intentionally slices OD pairs to top-`OD_PAIRS_PER_SLICE=80` per route-week; raising it without slicing elsewhere will blow the budget.
- **Conductor vs April schemas.** Uploads are auto-detected in `etram/ingest/upload_prepare.detect_schema`. Mixed schemas in one job → `ValueError`; unknown schemas → `ValueError` listing the bad files.
- **Job registry persistence.** `data/jobs/registry.json` is rewritten on every job update; on restart `_reconcile_stale_jobs` marks any `queued/running` as `failed: "Interrupted by server restart"`.
- **Uploads are staged to a `.part` temp file** by `etram._save_upload`, then `os.replace`d onto the final name only after the whole stream validates (size < 200 MB, non-empty). A failed upload (oversized/empty) leaves only a removed `.part`, never a partial file at the final path.
- **`.pbix` and `_temp_unzip/`** are scratch. The Power BI file is gitignored; do not commit the extracted XML.

## Source-of-truth pointers

- Architecture decisions: `docs/phase0/00-architecture-decisions.md` (Phase 1–2 pipeline locked; Postgres deferred).
- Canonical schema: `docs/phase0/01-canonical-schema.md`.
- Mapping contract: `docs/phase0/02-agency-mapping-spec.md` + `02-agency-mapping-bhavnagar.yaml`.
- KPI formulas (must match PBIX DAX): `docs/phase0/03-metric-spec.md`.
- DQ rules + feature gates: `docs/phase0/04-data-quality-contract.md` (BLOCK aborts ingest; WARN/INFO gate UI pages instead of faking data).