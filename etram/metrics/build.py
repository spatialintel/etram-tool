"""Orchestrate Phase 2 metrics build and write Parquet."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pandas as pd

from etram.metrics.ba_pattern import build_ba_stop_trip
from etram.metrics.canonical import canonical_dir, load_canonical
from etram.metrics.kpis import summarize_kpis
from etram.metrics.route_day import build_route_day_summary
from etram.metrics.trip_summary import build_trip_summary


def _project_root() -> Path:
    return Path(__file__).resolve().parents[2]


def run_metrics(agency_id: str = "bhavnagar", root: Path | None = None) -> dict[str, Any]:
    root = root or _project_root()
    tables = load_canonical(root, agency_id)

    trip_summary = build_trip_summary(tables["tickets"], tables["vehicles"], tables["routes"])
    # attach route_length_km name expected by kpi_epkm
    if "route_length_km" not in trip_summary.columns:
        raise KeyError("trip_summary missing route_length_km")

    route_day = build_route_day_summary(tables["tickets"], trip_summary, tables["routes"])
    ba = build_ba_stop_trip(tables["tickets"], trip_summary, tables["stop_sequence"])

    out = canonical_dir(root, agency_id)
    trip_summary.to_parquet(out / "trip_summary.parquet", index=False)
    route_day.to_parquet(out / "route_day_summary.parquet", index=False)
    ba.to_parquet(out / "ba_stop_trip.parquet", index=False)

    # snapshot KPIs for accuracy gate
    agency_kpis = summarize_kpis(trip_summary, route_day)
    route_kpis = summarize_kpis(
        trip_summary, route_day, service_date="2026-04-01", route_code="R1"
    )
    snapshot = {
        "agency_id": agency_id,
        "row_counts": {
            "trip_summary": len(trip_summary),
            "route_day_summary": len(route_day),
            "ba_stop_trip": len(ba),
        },
        "agency_wide": agency_kpis,
        "R1_2026-04-01": route_kpis,
    }
    (out / "metrics_snapshot.json").write_text(json.dumps(snapshot, indent=2), encoding="utf-8")
    return snapshot
