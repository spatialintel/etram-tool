"""Cross-process FileLock: serializes critical sections across threads and
processes, and is safe to release on exception.
"""
from __future__ import annotations

import threading
import time
from pathlib import Path

import pytest

from etram._file_lock import FileLock


def test_file_lock_serializes_threads(tmp_path: Path) -> None:
    lock_path = tmp_path / "test.lock"
    current = 0
    peak = 0
    state_lock = threading.Lock()

    def worker() -> None:
        nonlocal current, peak
        with FileLock(lock_path):
            with state_lock:
                current += 1
                peak = max(peak, current)
            time.sleep(0.05)
            with state_lock:
                current -= 1

    threads = [threading.Thread(target=worker) for _ in range(4)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert peak == 1, f"Lock failed to serialize: peak={peak}"


def test_file_lock_releases_on_exception(tmp_path: Path) -> None:
    lock_path = tmp_path / "test.lock"
    with pytest.raises(RuntimeError):
        with FileLock(lock_path):
            raise RuntimeError("boom")

    acquired = False
    with FileLock(lock_path):
        acquired = True
    assert acquired


def test_file_lock_creates_parent_directory(tmp_path: Path) -> None:
    lock_path = tmp_path / "nested" / "deeper" / "x.lock"
    assert not lock_path.parent.exists()
    with FileLock(lock_path):
        assert lock_path.exists()
    assert lock_path.parent.is_dir()


def test_file_lock_reusable_across_acquires(tmp_path: Path) -> None:
    lock_path = tmp_path / "test.lock"
    lock = FileLock(lock_path)
    for _ in range(3):
        with lock:
            pass
    assert lock_path.exists()
