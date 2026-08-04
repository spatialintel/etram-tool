"""Canonical data loader for metrics."""
from __future__ import annotations

from pathlib import Path

import pandas as pd


def canonical_dir(root: Path, agency_id: str) -> Path:
    return root / "data" / "canonical" / agency_id


def load_canonical(root: Path, agency_id: str) -> dict[str, pd.DataFrame]:
    d = canonical_dir(root, agency_id)
    names = [
        "agencies",
        "stops",
        "routes",
        "vehicles",
        "tickets",
        "stop_sequence",
        "time_slots",
    ]
    out = {}
    for n in names:
        p = d / f"{n}.parquet"
        if not p.exists():
            raise FileNotFoundError(f"Missing {p}; run Phase 1 ingest first")
        out[n] = pd.read_parquet(p)
    return out
