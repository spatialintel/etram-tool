"""E-TRAM multi-agency analytics package + lightweight job API."""

from __future__ import annotations

import json
import os
import re
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
from fastapi.staticfiles import StaticFiles

from etram._file_lock import FileLock
from etram.ingest.load import run_ingest
from etram.metrics.build import run_metrics

__version__ = "0.3.0"
MAX_UPLOAD_BYTES = 200 * 1024 * 1024
MAX_STOP_SEQ_FILES = 62
AGENCY_ID_RE = re.compile(r"^[a-z][a-z0-9_-]{0,63}$")

# Serializes ingest → metrics → export so jobs cannot clobber shared canonical output.
PIPELINE_LOCK = threading.Lock()


def _project_root() -> Path:
    return Path(__file__).resolve().parents[1]


def _pipeline_lock_path() -> Path:
    return _project_root() / "data" / ".pipeline.lock"


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _cors_origins() -> list[str]:
    raw = os.environ.get(
        "CORS_ORIGINS",
        "http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:4173,http://localhost:4173",
    )
    return [o.strip() for o in raw.split(",") if o.strip()]


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
    allow_origins=_cors_origins(),
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


def _jobs_root() -> Path:
    return _project_root() / "data" / "jobs"


def _registry_path() -> Path:
    return _jobs_root() / "registry.json"


def _registry_lock_path() -> Path:
    return _jobs_root() / ".registry.lock"


def _read_registry() -> dict[str, Job]:
    """Read jobs persisted by any process from the on-disk registry."""
    p = _registry_path()
    if not p.exists():
        return {}
    try:
        payload = json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return {}
    out: dict[str, Job] = {}
    for job_id, row in payload.items():
        try:
            out[job_id] = Job(**row)
        except TypeError:
            continue
    return out


def _merge_jobs(disk: dict[str, Job], memory: dict[str, Job]) -> dict[str, Job]:
    """disk overlaid with memory; the entry with the newer ``updated_at`` wins.

    ``updated_at`` is always ``_utc_now()`` (ISO-8601 with +00:00), so string
    comparison is chronological. This lets a process merge its in-memory view
    into the shared registry without regressing fresher entries another worker
    wrote.
    """
    merged = dict(disk)
    for job_id, job in memory.items():
        other = merged.get(job_id)
        if other is None or job.updated_at >= other.updated_at:
            merged[job_id] = job
    return merged


def _registry_view() -> dict[str, Job]:
    """Jobs as this process should see them: in-memory overlaid on disk."""
    return _merge_jobs(_read_registry(), JOBS)


def _persist_jobs() -> None:
    """Merge in-memory JOBS into the on-disk registry and write atomically.

    Holds the cross-process registry lock for the full read-modify-write so
    separate workers cannot clobber each other's jobs.
    """
    _jobs_root().mkdir(parents=True, exist_ok=True)
    with FileLock(_registry_lock_path()):
        merged = _merge_jobs(_read_registry(), JOBS)
        target = _registry_path()
        tmp = target.with_suffix(".json.tmp")
        tmp.write_text(
            json.dumps({k: asdict(v) for k, v in merged.items()}, indent=2),
            encoding="utf-8",
        )
        os.replace(tmp, target)


def _reconcile_stale_jobs() -> None:
    """Mark in-flight jobs as failed after process restart (daemon workers are gone)."""
    changed = False
    for job in JOBS.values():
        if job.status in ("queued", "running"):
            job.status = "failed"
            job.error = "Interrupted by server restart"
            job.updated_at = _utc_now()
            if job.logs is None:
                job.logs = []
            job.logs.append(f"{_utc_now()} Marked failed after restart")
            changed = True
    if changed:
        _persist_jobs()


def _load_jobs() -> None:
    JOBS.update(_read_registry())
    _reconcile_stale_jobs()


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


def _safe_filename(
    name: str | None,
    fallback: str,
    *,
    allowed_exts: tuple[str, ...] = (".xlsx", ".xls"),
) -> str:
    """Basename only — blocks path traversal and empty/odd names."""
    raw = (name or "").replace("\\", "/").strip()
    base = Path(raw).name.strip()
    if not base or base in (".", "..") or "/" in base or "\\" in base:
        return fallback
    exts = tuple(e.lower() if e.startswith(".") else f".{e.lower()}" for e in allowed_exts)
    if not any(base.lower().endswith(ext) for ext in exts):
        allowed = ", ".join(exts)
        raise HTTPException(
            status_code=400,
            detail=f"Only {allowed} files are allowed ({base})",
        )
    return base


def _validate_agency_id(agency_id: str) -> str:
    agency_id = (agency_id or "").strip().lower()
    if not AGENCY_ID_RE.match(agency_id):
        raise HTTPException(status_code=400, detail="Invalid agency_id")
    mapping = _project_root() / "config" / "agencies" / f"{agency_id}.yaml"
    if not mapping.exists():
        raise HTTPException(status_code=400, detail=f"Unknown agency_id: {agency_id}")
    return agency_id


async def _save_upload(dest: Path, file: UploadFile) -> int:
    dest.parent.mkdir(parents=True, exist_ok=True)
    # Ensure dest stays under jobs root
    jobs = _jobs_root().resolve()
    try:
        dest.resolve().relative_to(jobs)
    except ValueError as e:
        raise HTTPException(status_code=400, detail="Invalid upload path") from e

    # Write to a sibling temp file and rename on success so a failed upload
    # (oversized or empty) never leaves a partial file at the final path.
    tmp = dest.with_name(dest.name + ".part")
    size = 0
    try:
        with tmp.open("wb") as f:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                size += len(chunk)
                if size > MAX_UPLOAD_BYTES:
                    raise HTTPException(status_code=413, detail="File exceeds 200MB limit")
                f.write(chunk)
        await file.close()
        if size == 0:
            raise HTTPException(status_code=400, detail="Uploaded file is empty")
        os.replace(tmp, dest)
    except Exception:
        tmp.unlink(missing_ok=True)
        raise
    return size


def _build_job_mapping(
    job_dir: Path,
    agency_id: str,
    etm_path: Path,
    supporting_path: Path,
    stops_dir: Path,
) -> Path:
    root = _project_root()
    base_mapping_path = root / "config" / "agencies" / f"{agency_id}.yaml"
    cfg = yaml.safe_load(base_mapping_path.read_text(encoding="utf-8"))
    cfg["sources"]["etm"]["path"] = str(etm_path.resolve())
    cfg["sources"]["supporting"]["path"] = str(supporting_path.resolve())
    # Always use the uploaded supporting workbook for routes/vehicles/stops.
    cfg["sources"]["supporting"].pop("routes_path", None)
    cfg["sources"]["supporting"].pop("vehicles_path", None)
    cfg["sources"]["stop_sequence"]["path"] = str(stops_dir.resolve())
    # KML is optional; without a real file, keep supporting Route Length values.
    kml = cfg.get("kml_route_lengths") or {}
    kml_rel = (kml.get("path") or "").strip()
    if not kml_rel:
        cfg.pop("kml_route_lengths", None)
    else:
        kml_path = Path(kml_rel)
        if not kml_path.is_absolute():
            kml_path = root / kml_path
        if not kml_path.exists():
            cfg.pop("kml_route_lengths", None)

    out = job_dir / "mapping.yaml"
    out.write_text(yaml.safe_dump(cfg, sort_keys=False), encoding="utf-8")
    return out


def _run_export_script(agency_id: str, out_path: Path) -> Path:
    root = _project_root()
    script = root / "scripts" / "export_phase3_data.py"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [
            sys.executable,
            str(script),
            "--agency-id",
            agency_id,
            "--out",
            str(out_path.resolve()),
        ],
        check=True,
        cwd=str(root),
    )
    if not out_path.exists():
        raise FileNotFoundError(f"Expected dashboard JSON not found: {out_path}")
    return out_path


def _run_job(
    job_id: str,
    *,
    agency_id: str,
    etm_paths: list[Path],
    supporting_path: Path,
    stops_dir: Path,
    distance_path: Path | None,
) -> None:
    from etram.ingest.upload_prepare import prepare_etm_for_ingest

    acquired = PIPELINE_LOCK.acquire(blocking=True)
    try:
        with FileLock(_pipeline_lock_path()):
            _update_job(job_id, status="running")
            _append_job_log(job_id, "Job started")
            root = _project_root()
            job_root = _jobs_root() / job_id

            def log(msg: str) -> None:
                _append_job_log(job_id, msg)

            prepared_csv = job_root / "prepared" / "ETM_ingest.csv"
            log("Compiling and cleaning ETM uploads")
            prepare_etm_for_ingest(
                etm_paths,
                supporting_path=supporting_path,
                out_csv=prepared_csv,
                distance_path=distance_path,
                log=log,
            )

            mapping_path = _build_job_mapping(
                job_root, agency_id, prepared_csv, supporting_path, stops_dir
            )

            log("Running ingest")
            report = run_ingest(mapping_path, root=root)
            if not report.get("load_ok", False):
                blocked = [
                    r.get("id") or r.get("message") or str(r)
                    for r in (report.get("rules") or [])
                    if (r.get("level") or "").upper() == "BLOCK"
                ]
                detail = "; ".join(blocked[:8]) if blocked else "data quality checks failed"
                raise RuntimeError(f"Ingest rejected: {detail}")

            log("Running metrics")
            run_metrics(agency_id, root=root)

            result_path = job_root / "result.json"
            log("Exporting dashboard JSON")
            _run_export_script(agency_id, result_path)

            log("Job completed successfully")
            _update_job(job_id, status="succeeded", result_path=str(result_path), error=None)
    except Exception as e:
        _append_job_log(job_id, f"Job failed: {e}")
        _update_job(job_id, status="failed", error=str(e))
    finally:
        if acquired:
            PIPELINE_LOCK.release()


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "version": __version__}


@app.post("/api/jobs")
async def create_job(
    agency_id: str = Form(default="bhavnagar"),
    supporting_file: UploadFile = File(...),
    stop_sequence_files: list[UploadFile] = File(...),
    etm_file: UploadFile | None = File(None),
    etm_files: list[UploadFile] | None = File(None),
    distance_file: UploadFile | None = File(None),
) -> dict[str, Any]:
    agency_id = _validate_agency_id(agency_id)

    uploads: list[UploadFile] = []
    if etm_files:
        uploads.extend([f for f in etm_files if f is not None and f.filename])
    if etm_file is not None and etm_file.filename:
        uploads.append(etm_file)
    if not uploads:
        raise HTTPException(
            status_code=400,
            detail="At least one ETM file is required (Excel or Conductor Report CSV)",
        )

    if not stop_sequence_files:
        raise HTTPException(status_code=400, detail="At least one stop sequence file is required")
    if len(stop_sequence_files) > MAX_STOP_SEQ_FILES:
        raise HTTPException(
            status_code=400,
            detail=f"Too many stop sequence files (max {MAX_STOP_SEQ_FILES})",
        )

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

    job_dir = _jobs_root() / job_id / "input"
    try:
        etm_dir = job_dir / "ETM Data"
        etm_paths: list[Path] = []
        for i, f in enumerate(uploads):
            name = _safe_filename(
                f.filename,
                f"etm-{i:02d}.csv",
                allowed_exts=(".xlsx", ".xls", ".csv"),
            )
            path = etm_dir / name
            await _save_upload(path, f)
            etm_paths.append(path)

        supporting_path = job_dir / _safe_filename(supporting_file.filename, "supporting.xlsx")
        await _save_upload(supporting_path, supporting_file)

        stops_dir = job_dir / "Stops sequence"
        for i, f in enumerate(stop_sequence_files):
            name = _safe_filename(f.filename, f"stops-{i:02d}.xlsx")
            await _save_upload(stops_dir / name, f)

        distance_path: Path | None = None
        if distance_file is not None and distance_file.filename:
            distance_path = job_dir / _safe_filename(distance_file.filename, "distance.xlsx")
            await _save_upload(distance_path, distance_file)

        _append_job_log(job_id, f"Upload saved ({len(etm_paths)} ETM file(s))")
    except HTTPException as e:
        _update_job(job_id, status="failed", error=str(e.detail))
        raise
    except Exception as e:
        _update_job(job_id, status="failed", error=str(e))
        raise HTTPException(status_code=500, detail="Upload failed") from e

    t = threading.Thread(
        target=_run_job,
        kwargs={
            "job_id": job_id,
            "agency_id": agency_id,
            "etm_paths": etm_paths,
            "supporting_path": supporting_path,
            "stops_dir": stops_dir,
            "distance_path": distance_path,
        },
        daemon=True,
    )
    t.start()

    return {"job_id": job_id, "status": "queued"}


@app.get("/api/jobs/{job_id}")
def get_job(job_id: str) -> dict[str, Any]:
    if not re.fullmatch(r"[a-f0-9]{32}", job_id):
        raise HTTPException(status_code=404, detail="Job not found")
    with JOBS_LOCK:
        job = _registry_view().get(job_id)
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
        jobs = sorted(_registry_view().values(), key=lambda j: j.created_at, reverse=True)[:limit]
    return {"jobs": [asdict(j) for j in jobs]}


@app.get("/api/jobs/{job_id}/result")
def get_job_result(job_id: str) -> JSONResponse:
    if not re.fullmatch(r"[a-f0-9]{32}", job_id):
        raise HTTPException(status_code=404, detail="Job not found")
    with JOBS_LOCK:
        job = _registry_view().get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status != "succeeded" or not job.result_path:
        raise HTTPException(status_code=409, detail=f"Job status is {job.status}")

    p = Path(job.result_path).resolve()
    try:
        p.relative_to((_jobs_root() / job_id).resolve())
    except ValueError as e:
        raise HTTPException(status_code=500, detail="Invalid result path") from e
    if not p.exists():
        raise HTTPException(status_code=500, detail="Result file missing")
    return JSONResponse(content=json.loads(p.read_text(encoding="utf-8")))


_load_jobs()

# Railway builds the React app into webapp/dist and runs this API as the single
# public service. Mounting after the API routes preserves /api/* while serving
# the dashboard and its assets from the same origin.
_webapp_dist = _project_root() / "webapp" / "dist"
if _webapp_dist.is_dir():
    app.mount("/", StaticFiles(directory=_webapp_dist, html=True), name="webapp")
