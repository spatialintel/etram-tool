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
