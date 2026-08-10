"""Cross-process registry merge: newer-wins, disk preserved, round-trip."""
from __future__ import annotations

import json

import pytest

import etram as etram


def _job(
    job_id: str,
    status: str = "queued",
    updated: str = "2026-08-10T10:00:00+00:00",
) -> etram.Job:
    return etram.Job(
        id=job_id,
        agency_id="bhavnagar",
        status=status,
        created_at=updated,
        updated_at=updated,
        logs=[],
    )


def test_merge_newer_memory_wins_over_older_disk() -> None:
    disk = {"A": _job("A", status="queued", updated="2026-08-10T09:00:00+00:00")}
    memory = {"A": _job("A", status="running", updated="2026-08-10T10:00:00+00:00")}
    merged = etram._merge_jobs(disk, memory)
    assert merged["A"].status == "running"


def test_merge_older_memory_does_not_regress_disk() -> None:
    disk = {"A": _job("A", status="succeeded", updated="2026-08-10T11:00:00+00:00")}
    memory = {"A": _job("A", status="running", updated="2026-08-10T10:00:00+00:00")}
    merged = etram._merge_jobs(disk, memory)
    assert merged["A"].status == "succeeded"


def test_merge_preserves_disk_only_jobs() -> None:
    disk = {"B": _job("B", status="succeeded", updated="2026-08-10T09:00:00+00:00")}
    memory = {"A": _job("A", status="queued", updated="2026-08-10T10:00:00+00:00")}
    merged = etram._merge_jobs(disk, memory)
    assert set(merged) == {"A", "B"}


def test_merge_equal_timestamp_prefers_memory() -> None:
    disk = {"A": _job("A", status="queued", updated="2026-08-10T10:00:00+00:00")}
    memory = {"A": _job("A", status="failed", updated="2026-08-10T10:00:00+00:00")}
    merged = etram._merge_jobs(disk, memory)
    assert merged["A"].status == "failed"


@pytest.fixture
def isolated_jobs(tmp_path: pytest.TempPathFactory, monkeypatch: pytest.MonkeyPatch) -> None:
    jobs_dir = tmp_path / "jobs"
    monkeypatch.setattr(etram, "_jobs_root", lambda: jobs_dir)
    monkeypatch.setattr(etram, "_registry_path", lambda: jobs_dir / "registry.json")
    monkeypatch.setattr(etram, "_registry_lock_path", lambda: jobs_dir / ".registry.lock")
    monkeypatch.setattr(etram, "JOBS", {})
    yield jobs_dir


def test_persist_round_trip(isolated_jobs) -> None:
    etram.JOBS["A"] = _job("A", status="queued", updated="2026-08-10T10:00:00+00:00")
    etram._persist_jobs()
    loaded = etram._read_registry()
    assert set(loaded) == {"A"}
    assert loaded["A"].status == "queued"


def test_persist_merges_with_existing_disk(isolated_jobs) -> None:
    etram.JOBS["A"] = _job("A", status="running", updated="2026-08-10T10:00:00+00:00")
    etram._persist_jobs()
    # A second worker (fresh JOBS dict) adds B; A must survive on disk.
    etram.JOBS = {"B": _job("B", status="queued", updated="2026-08-10T11:00:00+00:00")}
    etram._persist_jobs()
    loaded = etram._read_registry()
    assert set(loaded) == {"A", "B"}
    assert loaded["A"].status == "running"


def test_registry_view_reads_disk_jobs(isolated_jobs) -> None:
    etram.JOBS["A"] = _job("A", status="queued", updated="2026-08-10T10:00:00+00:00")
    etram._persist_jobs()
    # Fresh in-memory dict (simulates another worker's process); view still sees A.
    etram.JOBS = {}
    view = etram._registry_view()
    assert set(view) == {"A"}
