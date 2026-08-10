"""_save_upload: failed uploads never leave a partial file at the final path."""
from __future__ import annotations

import asyncio

import pytest
from fastapi import HTTPException

import etram as etram


class _FakeUpload:
    def __init__(self, size: int, chunk: int = 1024) -> None:
        self._remaining = size
        self._chunk = chunk
        self.closed = False

    async def read(self, size: int = -1) -> bytes:
        n = min(self._remaining, size if size > 0 else self._chunk)
        if n <= 0:
            return b""
        self._remaining -= n
        return b"x" * n

    async def close(self) -> None:
        self.closed = True


@pytest.fixture
def isolated_jobs(tmp_path: pytest.TempPathFactory, monkeypatch: pytest.MonkeyPatch):
    jobs_dir = tmp_path / "jobs"
    monkeypatch.setattr(etram, "_jobs_root", lambda: jobs_dir)
    monkeypatch.setattr(etram, "MAX_UPLOAD_BYTES", 1024)
    return jobs_dir


def test_oversized_upload_raises_413_and_leaves_no_file(isolated_jobs) -> None:
    dest = isolated_jobs / "job1" / "input" / "big.csv"
    with pytest.raises(HTTPException) as exc:
        asyncio.run(etram._save_upload(dest, _FakeUpload(size=2048)))
    assert exc.value.status_code == 413
    assert not dest.exists()
    assert not dest.with_name(dest.name + ".part").exists()


def test_empty_upload_raises_400_and_leaves_no_file(isolated_jobs) -> None:
    dest = isolated_jobs / "job1" / "input" / "empty.csv"
    with pytest.raises(HTTPException) as exc:
        asyncio.run(etram._save_upload(dest, _FakeUpload(size=0)))
    assert exc.value.status_code == 400
    assert not dest.exists()
    assert not dest.with_name(dest.name + ".part").exists()


def test_successful_upload_lands_at_final_path(isolated_jobs) -> None:
    dest = isolated_jobs / "job1" / "input" / "ok.csv"
    file = _FakeUpload(size=512)
    size = asyncio.run(etram._save_upload(dest, file))
    assert size == 512
    assert dest.exists()
    assert dest.read_bytes() == b"x" * 512
    assert not dest.with_name(dest.name + ".part").exists()
    assert file.closed


def test_upload_rejects_path_outside_jobs_root(isolated_jobs, tmp_path) -> None:
    dest = tmp_path / "escape.csv"
    with pytest.raises(HTTPException) as exc:
        asyncio.run(etram._save_upload(dest, _FakeUpload(size=10)))
    assert exc.value.status_code == 400
    assert not dest.exists()
