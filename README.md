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

Deploy the repository root. `railway.json` selects the root `Dockerfile`, which
builds the React dashboard and serves it from the FastAPI service. Railway must
not use Python/Railpack auto-detection for this mixed Python/Node repository.

- Health check: `/api/health`
- Public dashboard: `/`
- Upload API: `/api/jobs`
- Runtime port: supplied automatically through `PORT`

The container filesystem is ephemeral. Attach a Railway volume at `/app/data`
if uploaded jobs and generated results must survive redeployments.
