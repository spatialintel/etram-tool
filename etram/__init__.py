"""E-TRAM multi-agency analytics package + lightweight job API."""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
import threading
import uuid
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import yaml
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from etram.ingest.load import run_ingest
from etram.metrics.build import run_metrics

__version__ = "0.1.0"
MAX_UPLOAD_BYTES = 50 * 1024 * 1024


def _project_root() -> Path:
    return Path(__file__).resolve().parents[1]


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass
class Job:
    id: str
    agency_id: str
    status: str
    created_at: str
    updated_at: str
    error: str | None = None
    result_path: str | None = None
    logs: list[str] | None = None


JOBS: dict[str, Job] = {}
JOBS_LOCK = threading.Lock()

app = FastAPI(title="E-TRAM Job API", version=__version__)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _jobs_root() -> Path:
    return _project_root() / "data" / "jobs"


def _registry_path() -> Path:
    return _jobs_root() / "registry.json"


def _persist_jobs() -> None:
    _jobs_root().mkdir(parents=True, exist_ok=True)
    payload = {job_id: asdict(job) for job_id, job in JOBS.items()}
    _registry_path().write_text(json.dumps(payload, indent=2), encoding="utf-8")


def _load_jobs() -> None:
    p = _registry_path()
    if not p.exists():
        return
    try:
        payload = json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return
    for job_id, row in payload.items():
        JOBS[job_id] = Job(**row)


def _append_job_log(job_id: str, message: str) -> None:
    with JOBS_LOCK:
        job = JOBS[job_id]
        if job.logs is None:
            job.logs = []
        job.logs.append(f"{_utc_now()} {message}")
        job.updated_at = _utc_now()
        _persist_jobs()


def _update_job(job_id: str, **kwargs: Any) -> None:
    with JOBS_LOCK:
        job = JOBS[job_id]
        for k, v in kwargs.items():
            setattr(job, k, v)
        job.updated_at = _utc_now()
        _persist_jobs()


async def _save_upload(dest: Path, file: UploadFile) -> int:
    dest.parent.mkdir(parents=True, exist_ok=True)
    size = 0
    with dest.open("wb") as f:
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            size += len(chunk)
            if size > MAX_UPLOAD_BYTES:
                raise HTTPException(status_code=413, detail=f"{file.filename} exceeds 50MB limit")
            f.write(chunk)
    await file.close()
    return size


def _build_job_mapping(
    job_dir: Path, agency_id: str, etm_path: Path, supporting_path: Path, stops_dir: Path
) -> Path:
    root = _project_root()
    base_mapping_path = root / "config" / "agencies" / f"{agency_id}.yaml"
    if not base_mapping_path.exists():
        raise FileNotFoundError(f"Agency mapping not found: {base_mapping_path}")

    cfg = yaml.safe_load(base_mapping_path.read_text(encoding="utf-8"))
    cfg["sources"]["etm"]["path"] = str(etm_path.resolve())
    cfg["sources"]["supporting"]["path"] = str(supporting_path.resolve())
    cfg["sources"]["stop_sequence"]["path"] = str(stops_dir.resolve())

    out = job_dir / "mapping.yaml"
    out.write_text(yaml.safe_dump(cfg, sort_keys=False), encoding="utf-8")
    return out


def _run_export_script() -> None:
    root = _project_root()
    script = root / "scripts" / "export_phase3_data.py"
    subprocess.run([sys.executable, str(script)], check=True, cwd=str(root))


def _run_job(job_id: str, mapping_path: Path, agency_id: str) -> None:
    try:
        _update_job(job_id, status="running")
        _append_job_log(job_id, "Job started")
        root = _project_root()
        _append_job_log(job_id, "Running ingest")
        run_ingest(mapping_path, root=root)
        _append_job_log(job_id, "Running metrics")
        run_metrics(agency_id, root=root)
        _append_job_log(job_id, "Exporting dashboard JSON")
        _run_export_script()

        src = root / "webapp" / "public" / "data" / "bhavnagar-dashboard.json"
        if not src.exists():
            raise FileNotFoundError(f"Expected dashboard JSON not found: {src}")

        result_path = root / "data" / "jobs" / job_id / "result.json"
        result_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, result_path)
        _append_job_log(job_id, "Job completed successfully")
        _update_job(job_id, status="succeeded", result_path=str(result_path))
    except Exception as e:
        _append_job_log(job_id, f"Job failed: {e}")
        _update_job(job_id, status="failed", error=str(e))


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/jobs")
async def create_job(
    agency_id: str = Form(default="bhavnagar"),
    etm_file: UploadFile = File(...),
    supporting_file: UploadFile = File(...),
    stop_sequence_files: list[UploadFile] = File(...),
) -> dict[str, Any]:
    if not stop_sequence_files:
        raise HTTPException(status_code=400, detail="At least one stop sequence file is required")

    job_id = uuid.uuid4().hex
    now = _utc_now()
    with JOBS_LOCK:
        JOBS[job_id] = Job(
            id=job_id,
            agency_id=agency_id,
            status="queued",
            created_at=now,
            updated_at=now,
            logs=[],
        )
        _persist_jobs()

    job_dir = _project_root() / "data" / "jobs" / job_id / "input"
    etm_path = job_dir / "ETM Data" / (etm_file.filename or "etm.xlsx")
    supporting_path = job_dir / (supporting_file.filename or "supporting.xlsx")
    stops_dir = job_dir / "Stops sequence"

    await _save_upload(etm_path, etm_file)
    await _save_upload(supporting_path, supporting_file)
    for f in stop_sequence_files:
        await _save_upload(stops_dir / (f.filename or f"stops-{uuid.uuid4().hex}.xlsx"), f)

    _append_job_log(job_id, "Upload saved")
    mapping_path = _build_job_mapping(job_dir.parent, agency_id, etm_path, supporting_path, stops_dir)
    t = threading.Thread(target=_run_job, args=(job_id, mapping_path, agency_id), daemon=True)
    t.start()

    return {"job_id": job_id, "status": "queued"}


@app.get("/api/jobs/{job_id}")
def get_job(job_id: str) -> dict[str, Any]:
    with JOBS_LOCK:
        job = JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    out = asdict(job)
    out["result_url"] = f"/api/jobs/{job_id}/result" if job.status == "succeeded" else None
    return out


@app.get("/api/jobs")
def list_jobs(limit: int = 20) -> dict[str, Any]:
    if limit < 1:
        limit = 1
    if limit > 100:
        limit = 100
    with JOBS_LOCK:
        jobs = sorted(JOBS.values(), key=lambda j: j.created_at, reverse=True)[:limit]
    return {"jobs": [asdict(j) for j in jobs]}


@app.get("/api/jobs/{job_id}/result")
def get_job_result(job_id: str) -> JSONResponse:
    with JOBS_LOCK:
        job = JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status != "succeeded" or not job.result_path:
        raise HTTPException(status_code=409, detail=f"Job status is {job.status}")

    p = Path(job.result_path)
    if not p.exists():
        raise HTTPException(status_code=500, detail="Result file missing")
    return JSONResponse(content=json.loads(p.read_text(encoding="utf-8")))


_load_jobs()
