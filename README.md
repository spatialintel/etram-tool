# E-TRAM Tool

Transit ridership analytics: Excel ingest → Python metrics → React dashboard.

## Local development

### API (project root)

```powershell
$env:PYTHONPATH = (Get-Location).Path
pip install -r requirements.txt
uvicorn etram:app --host 0.0.0.0 --port 8000 --reload
```

### Frontend

```powershell
cd webapp
npm install
npm run dev
```

Upload Excel files in the UI to regenerate the dashboard. Static sample data lives at `webapp/public/data/bhavnagar-dashboard.json`.

## Repo notes

Source Excel, Power BI (`.pbix`), and generated Parquet are gitignored. Run ingest/metrics locally or via the upload API.

## Webapp locations

**Canonical UI source:** `webapp/` in this project (and on GitHub).

For local `npm` when the G: drive fails, use the run mirror:

```powershell
.\scripts\sync_webapp_local.ps1
cd C:\temp\etram-webapp
npm run dev
```

Do not keep a second editable copy at `C:\temp\webapp`.

## Railway deployment

Repo: https://github.com/spatialintel/etram-tool (`main`).

Deploy the repository root from GitHub. `railway.json` selects the root
`Dockerfile`, which builds the React dashboard and serves it from FastAPI.
Do not use Python/Railpack auto-detection for this mixed Python/Node repo.

### Fresh Hobby deploy (new Railway account)

1. Connect GitHub and select `spatialintel/etram-tool`, branch `main`.
2. Confirm builder is **Dockerfile** (root), not Railpack.
3. After first deploy succeeds, generate a public domain.
4. Attach a volume mounted at `/app/data` so job uploads survive restarts.
5. Prefer **≥2 GB RAM** for full-month May packs (trial OOM/restarts otherwise).

Endpoints:

- Health: `/api/health`
- Dashboard: `/`
- Upload jobs: `/api/jobs`
- Port: Railway `PORT`

The portal is upload-first: no city data is preloaded; stakeholders upload the
May `Upload/` pack (Conductor CSVs, Supporting data, distance workbook, stop
sequences) to compile and build the dashboard.

### Concurrency

The pipeline holds both an in-process `threading.Lock` and a cross-process
file lock on `data/.pipeline.lock` (see `etram/_file_lock.py`). The job
registry is merged across workers (newer `updated_at` wins) and read through
`_registry_view()`, so separate workers can see and persist each other's jobs.
Single uvicorn worker is the supported deployment; the file locks are a safety
net for the case where multiple workers are run anyway. Known multi-worker
gap: `_reconcile_stale_jobs` assumes one owner and will mark another worker's
in-flight jobs as failed on restart. Move job state to an external queue/DB
before scaling horizontally.
