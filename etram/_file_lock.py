"""Cross-process file lock for the ingest pipeline.

The threading.Lock in etram.__init__.py covers only one process. When Railway
(or a local dev box) runs more than one uvicorn worker, two processes can race
into data/canonical/{agency}/ and clobber each other. This lock is the
cross-process safety net around the same critical section.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path
from types import TracebackType
from typing import Type


class FileLock:
    """Cross-process advisory lock on a regular file.

    POSIX: ``fcntl.flock`` (whole-file lock; the kernel drops it when the fd
    closes, so a crashed process does not strand the lock).
    Windows: ``msvcrt.locking`` (positional record lock; requires the file to
    contain at least 1 byte so the lock has somewhere to land).

    Both modes block by default. ``__enter__`` blocks until the lock is held.
    """

    def __init__(self, path: Path) -> None:
        self.path = path
        self._fd: int | None = None

    def __enter__(self) -> "FileLock":
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._fd = os.open(self.path, os.O_RDWR | os.O_CREAT, 0o644)
        try:
            if sys.platform == "win32":
                self._lock_windows()
            else:
                self._lock_posix()
        except Exception:
            os.close(self._fd)
            self._fd = None
            raise
        return self

    def __exit__(
        self,
        exc_type: Type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        if self._fd is None:
            return
        try:
            if sys.platform == "win32":
                self._unlock_windows()
            else:
                self._unlock_posix()
        finally:
            os.close(self._fd)
            self._fd = None

    def _lock_posix(self) -> None:
        import fcntl
        fcntl.flock(self._fd, fcntl.LOCK_EX)

    def _unlock_posix(self) -> None:
        import fcntl
        fcntl.flock(self._fd, fcntl.LOCK_UN)

    def _lock_windows(self) -> None:
        import msvcrt
        import time
        try:
            if os.fstat(self._fd).st_size == 0:
                os.write(self._fd, b"\x00")
        except OSError:
            pass
        os.lseek(self._fd, 0, os.SEEK_SET)
        # msvcrt.LK_LOCK only retries for ~10s before raising OSError, which
        # would turn a contended lock into a spurious job failure. Loop with
        # LK_NBLCK (non-blocking) instead so Windows blocks indefinitely, like
        # flock does on POSIX. A crashed holder releases the lock when its
        # process exits, so an unbounded wait cannot strand permanently.
        while True:
            try:
                msvcrt.locking(self._fd, msvcrt.LK_NBLCK, 1)
                return
            except OSError:
                time.sleep(0.1)

    def _unlock_windows(self) -> None:
        import msvcrt
        os.lseek(self._fd, 0, os.SEEK_SET)
        msvcrt.locking(self._fd, msvcrt.LK_UNLCK, 1)
