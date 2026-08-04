"""Data quality checks and feature gates."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pandas as pd


def _coverage(s: pd.Series) -> float:
    if len(s) == 0:
        return 0.0
    return float(s.notna().mean())


def build_dq_report(
    agency_id: str,
    tables: dict[str, pd.DataFrame],
    *,
    gender_threshold: float = 0.5,
    driver_threshold: float = 0.5,
) -> dict[str, Any]:
    tickets = tables["tickets"]
    stops = tables["stops"]
    routes = tables["routes"]
    vehicles = tables["vehicles"]
    stop_sequence = tables["stop_sequence"]

    rules: list[dict[str, Any]] = []

    def add(table: str, rule_id: str, level: str, value: Any, message: str = ""):
        rules.append(
            {
                "table": table,
                "id": rule_id,
                "level": level,
                "value": value,
                "message": message,
            }
        )

    # tickets
    add("tickets", "row_count", "BLOCK" if len(tickets) == 0 else "INFO", len(tickets))
    add("tickets", "gender_coverage", "WARN", round(_coverage(tickets["gender"]), 4))
    add("tickets", "driver_id_coverage", "WARN", round(_coverage(tickets["driver_id"]), 4))
    add("tickets", "conductor_id_coverage", "INFO", round(_coverage(tickets["conductor_id"]), 4))
    add(
        "tickets",
        "service_date_null_pct",
        "BLOCK" if tickets["service_date"].isna().any() else "INFO",
        round(float(tickets["service_date"].isna().mean()), 4),
    )
    add(
        "tickets",
        "route_code_null_pct",
        "BLOCK" if tickets["route_code"].isna().any() else "INFO",
        round(float(tickets["route_code"].isna().mean()), 4),
    )

    veh_set = set(vehicles["vehicle_id"].dropna().astype(str))
    t_veh = tickets["vehicle_id"].dropna().astype(str)
    unmatched_veh = int((~t_veh.isin(veh_set)).sum()) if len(t_veh) else 0
    add("tickets", "vehicle_id_not_in_vehicles", "WARN", unmatched_veh)

    stop_set = set(stops["stop_abbr"].dropna().astype(str))
    o_miss = int((~tickets["origin_abbr"].dropna().astype(str).isin(stop_set)).sum())
    d_miss = int((~tickets["destination_abbr"].dropna().astype(str).isin(stop_set)).sum())
    add("tickets", "origin_abbr_not_in_stops", "WARN", o_miss)
    add("tickets", "destination_abbr_not_in_stops", "WARN", d_miss)

    add("stops", "row_count", "INFO", len(stops))
    add("stops", "missing_latlon", "WARN", int(stops["latitude"].isna().sum() + stops["longitude"].isna().sum()))
    add("routes", "row_count", "INFO", len(routes))
    add("routes", "route_length_le_0", "WARN", int((routes["route_length_km"].fillna(0) <= 0).sum()))
    add("vehicles", "row_count", "INFO", len(vehicles))
    add("vehicles", "capacity_le_0", "WARN", int((vehicles["capacity"].fillna(0) <= 0).sum()))
    add("stop_sequence", "row_count", "INFO", len(stop_sequence))

    ticket_dates = set(pd.to_datetime(tickets["service_date"]).dt.date.dropna())
    seq_dates = set(pd.to_datetime(stop_sequence["service_date"]).dt.date.dropna())
    missing_seq_dates = sorted(str(d) for d in (ticket_dates - seq_dates))
    add("stop_sequence", "ticket_dates_missing_sequence", "WARN", missing_seq_dates)

    gender_cov = _coverage(tickets["gender"])
    driver_cov = _coverage(tickets["driver_id"])
    conductor_cov = _coverage(tickets["conductor_id"])
    has_coords = stops["latitude"].notna().any() and stops["longitude"].notna().any()

    feature_gates = {
        "gender_charts": gender_cov >= gender_threshold,
        "driver_speed": driver_cov >= driver_threshold,
        "conductor_revenue": conductor_cov > 0,
        "ba_maps": bool(has_coords),
    }

    blocked = [r for r in rules if r["level"] == "BLOCK" and (
        (r["id"] == "row_count" and r["value"] == 0) or
        (r["id"].endswith("_null_pct") and r["value"] and r["value"] > 0)
    )]

    return {
        "agency_id": agency_id,
        "loaded_at": datetime.now(timezone.utc).isoformat(),
        "tables": {name: {"rows": len(df)} for name, df in tables.items()},
        "rules": rules,
        "feature_gates": feature_gates,
        "load_ok": len(blocked) == 0,
    }


def write_dq_report(report: dict[str, Any], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, indent=2), encoding="utf-8")
