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
    stage_km_tolerance: float = 1.05,
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
    add(
        "tickets",
        "ticket_id_null_pct",
        "WARN",
        round(float(tickets["ticket_id"].isna().mean()), 4),
        "missing Ticket No.",
    )
    add(
        "tickets",
        "stage_km_null_pct",
        "WARN",
        round(float(tickets["stage_km"].isna().mean()), 4),
        "numeric coercion failed or source cell blank; pax_km is null for these rows",
    )
    add(
        "tickets",
        "revenue_null_pct",
        "WARN",
        round(float(tickets["revenue"].isna().mean()), 4),
        "numeric coercion failed or source cell blank",
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

    # --- Outlier / internal-consistency checks -----------------------------
    # All WARN (row-level anomalies), not BLOCK, matching the contract's
    # split: BLOCK is for structural/completeness failures, WARN flags rows
    # for review without stopping the load. None of these fabricate or drop
    # data; metrics still sum every row, this only surfaces the count.
    add(
        "tickets",
        "negative_revenue",
        "WARN",
        int((tickets["revenue"] < 0).sum()),
        "fare cannot be negative",
    )
    add(
        "tickets",
        "negative_stage_km",
        "WARN",
        int((tickets["stage_km"] < 0).sum()),
        "distance cannot be negative",
    )
    add(
        "tickets",
        "zero_passenger_positive_revenue",
        "WARN",
        int(((tickets["total_passengers"] == 0) & (tickets["revenue"] > 0)).sum()),
        "revenue recorded with zero passengers on the ticket",
    )
    # A single-leg fare stage cannot exceed the full route it runs on. Join on
    # route_direction_key (falls back to the route-code average, same fallback
    # trip_summary.py uses) and allow `stage_km_tolerance` slack for
    # measured-vs-mapped rounding drift (default 5%).
    route_len_by_direction = (
        routes.dropna(subset=["route_direction_key"])
        .drop_duplicates(subset=["route_direction_key"])
        .set_index("route_direction_key")["route_length_km"]
    )
    route_len_by_code = routes.groupby("route_code", dropna=False)["route_length_km"].mean()
    ticket_route_len = tickets["route_direction_key"].map(route_len_by_direction)
    ticket_route_len = ticket_route_len.fillna(tickets["route_code"].map(route_len_by_code))
    stage_exceeds_route = (
        tickets["stage_km"].notna()
        & ticket_route_len.notna()
        & (ticket_route_len > 0)
        & (tickets["stage_km"] > ticket_route_len * stage_km_tolerance)
    )
    add(
        "tickets",
        "stage_km_exceeds_route_length",
        "WARN",
        int(stage_exceeds_route.sum()),
        f"stage_km > route length (+{round((stage_km_tolerance - 1) * 100)}% tolerance)",
    )
    # Same ticket number reused on the same bus on the same day (post-dedup —
    # upload_prepare already drops exact Date+Ticket+Vehicle+Trip duplicates,
    # so a hit here means a genuinely different trip/time reused the number).
    dup_key_rows = tickets.dropna(subset=["vehicle_id", "ticket_id"])
    add(
        "tickets",
        "duplicate_ticket_per_vehicle_day",
        "WARN",
        int(dup_key_rows.duplicated(subset=["agency_id", "service_date", "vehicle_id", "ticket_id"], keep=False).sum()),
        "same ticket_id issued more than once on the same vehicle/day",
    )

    add("stops", "row_count", "INFO", len(stops))
    add("stops", "missing_latlon", "WARN", int(stops["latitude"].isna().sum() + stops["longitude"].isna().sum()))
    add("routes", "row_count", "INFO", len(routes))
    add("routes", "route_length_le_0", "WARN", int((routes["route_length_km"].fillna(0) <= 0).sum()))
    add("vehicles", "row_count", "INFO", len(vehicles))
    add("vehicles", "capacity_le_0", "WARN", int((vehicles["capacity"].fillna(0) <= 0).sum()))
    add("stop_sequence", "row_count", "INFO", len(stop_sequence))
    seq_stop_missing = int(
        (~stop_sequence["stop_abbr"].dropna().astype(str).isin(stop_set)).sum()
    )
    add(
        "stop_sequence",
        "stop_abbr_not_in_stops",
        "WARN",
        seq_stop_missing,
        "stop_sequence.stop_abbr not found in the stops table",
    )
    # NOTE: the contract doc also calls for "stop_no monotonic per route-date".
    # load_stop_sequence() sorts by stop_no before assigning seq_index, so
    # seq_index is monotonic with stop_no by construction — checking that here
    # would always report 0 and give false assurance. What IS still visible
    # post-sort, and a real signal, is two rows claiming the same stop_no
    # within one route-date-direction sequence.
    seq_group_cols = ["service_date", "route_code", "route_description"]
    dup_stop_no = (
        stop_sequence["stop_no"].notna()
        & stop_sequence.duplicated(subset=[*seq_group_cols, "stop_no"], keep=False)
    )
    add(
        "stop_sequence",
        "duplicate_stop_no",
        "WARN",
        int(dup_stop_no.sum()),
        "stop_no repeated within the same route-date-direction sequence",
    )

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
