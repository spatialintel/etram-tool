from __future__ import annotations

import argparse
import json
import math
import sys
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from etram.metrics.kpis import summarize_kpis  # noqa: E402

MAX_PAYLOAD_BYTES = 16 * 1024 * 1024
OD_PAIRS_PER_SLICE = 80


def _sanitize_for_json(x):
    # Python's json module would emit `NaN` which is invalid JSON for JS JSON.parse.
    if x is None:
        return None
    if isinstance(x, float):
        if math.isnan(x) or math.isinf(x):
            return None
    try:
        if pd.isna(x):
            return None
    except Exception:
        pass
    if hasattr(x, "item") and not isinstance(x, (bytes, str)):
        try:
            return _sanitize_for_json(x.item())
        except Exception:
            pass
    return x


def sanitize_payload(obj):
    if isinstance(obj, list):
        return [
            _sanitize_for_json(v) if not isinstance(v, (list, dict)) else sanitize_payload(v)
            for v in obj
        ]
    if isinstance(obj, dict):
        return {
            k: (_sanitize_for_json(v) if not isinstance(v, (list, dict)) else sanitize_payload(v))
            for k, v in obj.items()
        }
    return _sanitize_for_json(obj)


def _records(df: pd.DataFrame) -> list[dict]:
    return sanitize_payload(df.to_dict(orient="records"))


def _day_name_map(dates: pd.Series) -> dict[str, str]:
    out: dict[str, str] = {}
    for d in dates.dropna().unique():
        ts = pd.Timestamp(d)
        out[ts.strftime("%Y-%m-%d")] = ts.day_name()
    return out


def _bin_histogram(series: pd.Series, *, metric: str, bins: int = 20) -> list[dict]:
    s = pd.to_numeric(series, errors="coerce").dropna()
    if s.empty:
        return []
    counts, _edges = pd.cut(s, bins=bins, retbins=True, include_lowest=True)
    vc = counts.value_counts(sort=False)
    rows: list[dict] = []
    for interval, count in vc.items():
        if count == 0:
            continue
        rows.append(
            {
                "metric": metric,
                "bin_lo": float(interval.left),
                "bin_hi": float(interval.right),
                "count": int(count),
            }
        )
    return rows


def main(agency_id: str = "bhavnagar", out_path: Path | None = None) -> None:
    root = ROOT
    agency_id = agency_id.strip().lower()
    canon = root / "data" / "canonical" / agency_id
    out_dir = root / "webapp" / "public" / "data"
    out_dir.mkdir(parents=True, exist_ok=True)
    if not canon.exists():
        raise FileNotFoundError(f"Canonical data not found for agency: {agency_id}")

    route_day = pd.read_parquet(canon / "route_day_summary.parquet")
    trip = pd.read_parquet(canon / "trip_summary.parquet")
    ba = pd.read_parquet(canon / "ba_stop_trip.parquet")
    stops = pd.read_parquet(canon / "stops.parquet")
    dq = json.loads((canon / "dq_report.json").read_text(encoding="utf-8"))

    route_day_ts = route_day.copy()
    trip_ts = trip.copy()
    route_day_ts["service_date"] = pd.to_datetime(route_day_ts["service_date"])
    trip_ts["service_date"] = pd.to_datetime(trip_ts["service_date"])

    route_day["service_date"] = pd.to_datetime(route_day["service_date"]).dt.strftime("%Y-%m-%d")
    trip["service_date"] = pd.to_datetime(trip["service_date"]).dt.strftime("%Y-%m-%d")
    ba["service_date"] = pd.to_datetime(ba["service_date"]).dt.strftime("%Y-%m-%d")

    day_names = _day_name_map(route_day["service_date"])

    daily_agg = {
        "ridership": ("ridership", "sum"),
        "revenue": ("revenue", "sum"),
        "pax_km": ("pax_km", "sum"),
        "capacity_km": ("capacity_km", "sum"),
        "trips": ("n_trips", "sum"),
        "buses": ("n_buses", "sum"),
    }
    for col in ("male_ridership", "female_ridership"):
        if col in route_day.columns:
            daily_agg[col] = (col, "sum")
    for col in ("day_name", "week_no", "week_label", "week_start", "week_end"):
        if col in route_day.columns:
            daily_agg[col] = (col, "first")

    daily = (
        route_day.groupby("service_date", as_index=False)
        .agg(**{k: v for k, v in daily_agg.items()})
        .sort_values("service_date")
    )
    if "day_name" not in daily.columns:
        daily["day_name"] = daily["service_date"].map(day_names)
    for col in ("week_start", "week_end"):
        if col in daily.columns:
            daily[col] = pd.to_datetime(daily[col], errors="coerce").dt.strftime("%Y-%m-%d")
    daily["lf"] = daily["pax_km"] / daily["capacity_km"].replace(0, pd.NA)

    route_cols = [
        "service_date",
        "route_code",
        "ridership",
        "revenue",
        "load_factor_route",
        "n_trips",
        "n_buses",
        "ridership_per_bus",
        "revenue_per_bus",
        "ridership_per_trip",
        "revenue_per_trip",
        "route_length_route",
        "pax_km",
        "capacity_km",
    ]
    route_trend = route_day[[c for c in route_cols if c in route_day.columns]].copy()

    trip["start_hour"] = pd.to_datetime(trip["trip_start_time"], errors="coerce").dt.hour
    temporal = (
        trip.dropna(subset=["start_hour"])
        .groupby(["service_date", "route_code", "start_hour"], as_index=False)
        .agg(
            ridership=("ridership_trip", "sum"),
            revenue=("revenue_trip", "sum"),
            trips=("trip_id", "count"),
        )
        .sort_values(["service_date", "route_code", "start_hour"])
    )
    temporal["day_name"] = temporal["service_date"].map(day_names)

    stop_group_cols = ["service_date", "route_direction_key", "stop_abbr", "stop_name"]
    if "route_code" in ba.columns:
        stop_group_cols = [
            "service_date",
            "route_code",
            "route_direction_key",
            "stop_abbr",
            "stop_name",
        ]
    stop_aggs = {
        "boarding": ("boarding", "sum"),
        "alighting": ("alighting", "sum"),
        "peak_load": ("passenger_load", "max"),
    }
    if "total_passengers_at_stop" in ba.columns:
        stop_aggs["total_passengers_at_stop"] = ("total_passengers_at_stop", "max")
    stop_agg = ba.groupby(stop_group_cols, as_index=False).agg(**stop_aggs)
    stop_agg = stop_agg.merge(
        stops[["stop_abbr", "latitude", "longitude"]].drop_duplicates(),
        on="stop_abbr",
        how="left",
    )
    stop_agg = stop_agg.dropna(subset=["latitude", "longitude"])
    # Drop inert day×stop rows (keeps May BA payload manageable).
    if {"boarding", "alighting"}.issubset(stop_agg.columns):
        stop_agg = stop_agg.loc[
            (stop_agg["boarding"].fillna(0) + stop_agg["alighting"].fillna(0)) > 0
        ].copy()

    ba_scored = ba.copy()
    ba_scored["boarding_plus_alighting"] = ba_scored["boarding"] + ba_scored["alighting"]
    trip_scores = ba_scored.groupby(
        ["service_date", "route_direction_key", "bus_trip_key"], as_index=False
    ).agg(score=("boarding_plus_alighting", "sum"))
    best_trip = (
        trip_scores.sort_values(
            ["service_date", "route_direction_key", "score", "bus_trip_key"],
            ascending=[True, True, False, True],
        )
        .groupby(["service_date", "route_direction_key"], as_index=False)
        .head(1)
    )
    ba_best = ba_scored.merge(
        best_trip[["service_date", "route_direction_key", "bus_trip_key"]],
        on=["service_date", "route_direction_key", "bus_trip_key"],
        how="inner",
    )
    ba_line_best_trip = ba_best[
        [
            "service_date",
            "route_direction_key",
            "bus_trip_key",
            "stop_no",
            "stop_name",
            "boarding",
            "alighting",
            "passenger_load",
        ]
    ].copy()
    ba_line_best_trip = ba_line_best_trip.sort_values(
        ["service_date", "route_direction_key", "bus_trip_key", "stop_no"]
    )

    kpi_daily = []
    for d in sorted(daily["service_date"].unique()):
        kpi_daily.append(summarize_kpis(trip_ts, route_day_ts, service_date=d))

    slot_summary = pd.DataFrame()
    if "time_slot_label" in trip.columns:
        slot_summary = (
            trip.dropna(subset=["time_slot_label"])
            .groupby(["service_date", "route_code", "time_slot_label"], as_index=False)
            .agg(
                trips=("trip_id", "count"),
                ridership=("ridership_trip", "sum"),
                revenue=("revenue_trip", "sum"),
                pax_km=("pax_km", "sum"),
                capacity_km=("capacity_km", "sum"),
            )
            .sort_values(["service_date", "route_code", "time_slot_label"])
        )

    vehicle_summary = pd.DataFrame()
    if "vehicle_id" in trip.columns:
        veh_aggs = {
            "trips": ("trip_id", "count"),
            "ridership": ("ridership_trip", "sum"),
            "revenue": ("revenue_trip", "sum"),
            "pax_km": ("pax_km", "sum"),
            "capacity_km": ("capacity_km", "sum"),
        }
        if "veh_capacity" in trip.columns:
            veh_aggs["veh_capacity"] = ("veh_capacity", "first")
        if "route_length_km" in trip.columns:
            veh_aggs["vehicle_km"] = ("route_length_km", "sum")
        vehicle_summary = (
            trip.dropna(subset=["vehicle_id"])
            .groupby(["service_date", "vehicle_id"], as_index=False)
            .agg(**veh_aggs)
            .sort_values(["service_date", "vehicle_id"])
        )

    feature_gates = dq.get("feature_gates", {}) or {}
    crew_summary = []
    crew_roles: list[tuple[str, str]] = []
    if feature_gates.get("conductor_revenue"):
        crew_roles.append(("conductor", "conductor_id"))
    if feature_gates.get("driver_speed"):
        crew_roles.append(("driver", "driver_id"))
    for role, col in crew_roles:
        if col not in trip.columns:
            continue
        sub = trip.dropna(subset=[col])
        if sub.empty:
            continue
        crew_aggs = {
            "trips": ("trip_id", "count"),
            "ridership": ("ridership_trip", "sum"),
            "revenue": ("revenue_trip", "sum"),
            "pax_km": ("pax_km", "sum"),
        }
        if "route_length_km" in trip.columns:
            crew_aggs["vehicle_km"] = ("route_length_km", "sum")
        g = (
            sub.groupby(["service_date", col], as_index=False)
            .agg(**crew_aggs)
            .rename(columns={col: "crew_id"})
        )
        g["role"] = role
        crew_summary.extend(_records(g))

    # OD pairs sliced by route and by week. A daily slice runs to ~17k rows
    # (2.2 MB) and blows the payload budget, while a single all-time block
    # cannot answer "has this flow changed"; ISO weeks land between the two at
    # roughly 0.5 MB and let the Stops page honour a date filter to week
    # resolution. Keeping the busiest OD_PAIRS_PER_SLICE pairs per route-week
    # holds ~80% of ridership, enough for the flow matrix to read as a matrix
    # rather than a scatter of isolated cells.
    od_top: list[dict] = []
    tickets_path = canon / "tickets.parquet"
    if tickets_path.exists():
        try:
            tickets = pd.read_parquet(
                tickets_path,
                columns=[
                    "service_date",
                    "route_code",
                    "origin_abbr",
                    "destination_abbr",
                    "total_passengers",
                    "revenue",
                ],
            )
            dates = pd.to_datetime(tickets["service_date"])
            clean = tickets.dropna(subset=["origin_abbr", "destination_abbr", "route_code"]).copy()
            # Monday-anchored week so a partial first or last week still lands
            # in a bucket the UI can compare against the selected range.
            clean["week_start"] = (
                dates.loc[clean.index] - pd.to_timedelta(dates.loc[clean.index].dt.weekday, unit="D")
            ).dt.strftime("%Y-%m-%d")
            clean["week_end"] = (
                pd.to_datetime(clean["week_start"]) + pd.Timedelta(days=6)
            ).dt.strftime("%Y-%m-%d")
            od = (
                clean.groupby(
                    ["route_code", "week_start", "week_end", "origin_abbr", "destination_abbr"],
                    as_index=False,
                )
                .agg(
                    ridership=("total_passengers", "sum"),
                    revenue=("revenue", "sum"),
                )
                .sort_values("ridership", ascending=False)
                .groupby(["route_code", "week_start"], as_index=False)
                .head(OD_PAIRS_PER_SLICE)
                .sort_values("ridership", ascending=False)
            )
            od_top = _records(od)
        except Exception:
            od_top = []

    trip_lf = trip["pax_km"] / trip["capacity_km"].replace(0, pd.NA)
    trip_distribution = _bin_histogram(trip["ridership_trip"], metric="ridership_trip", bins=20)
    trip_distribution.extend(_bin_histogram(trip_lf, metric="trip_lf", bins=20))

    stop_sequence_geo = []
    seq_path = canon / "stop_sequence.parquet"
    if seq_path.exists():
        seq = pd.read_parquet(seq_path)
        keep = ["route_direction_key", "stop_no", "stop_abbr"]
        if "route_code" in seq.columns:
            keep = ["route_code"] + keep
        seq = seq[[c for c in keep if c in seq.columns]].drop_duplicates(
            subset=["route_direction_key", "stop_no"]
        )
        seq = seq.merge(
            stops[["stop_abbr", "latitude", "longitude"]].drop_duplicates(),
            on="stop_abbr",
            how="left",
        )
        seq = seq.dropna(subset=["latitude", "longitude"]).sort_values(
            ["route_direction_key", "stop_no"]
        )
        stop_sequence_geo = _records(seq)

    agency_name = agency_id.replace("_", " ").title()
    agencies_path = canon / "agencies.parquet"
    if agencies_path.exists():
        try:
            ag = pd.read_parquet(agencies_path)
            if len(ag) and "agency_name" in ag.columns:
                agency_name = str(ag.iloc[0]["agency_name"])
        except Exception:
            pass

    payload = {
        "agency": {
            "agency_id": agency_id,
            "agency_name": agency_name,
            "date_min": str(daily["service_date"].min()),
            "date_max": str(daily["service_date"].max()),
            "routes": sorted(route_day["route_code"].dropna().unique().tolist()),
            "route_directions": sorted(
                (
                    ba["route_direction_key"]
                    if len(ba) and "route_direction_key" in ba.columns
                    else trip["route_direction_key"]
                )
                .dropna()
                .unique()
                .tolist()
            ),
        },
        "meta": {
            "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "schema_version": 2,
            "source_rows": {
                "route_day": int(len(route_day)),
                "trip": int(len(trip)),
                "ba": int(len(ba)),
            },
            "load_ok": dq.get("load_ok"),
            "dq_rules": dq.get("rules", []),
            "dq_tables": dq.get("tables", {}),
        },
        "feature_gates": feature_gates,
        "daily": _records(daily),
        "route_trend": _records(route_trend),
        "kpi_daily": sanitize_payload(kpi_daily),
        "temporal": _records(temporal),
        "slot_summary": _records(slot_summary) if len(slot_summary) else [],
        "vehicle_summary": _records(vehicle_summary) if len(vehicle_summary) else [],
        "crew_summary": crew_summary,
        "trip_distribution": sanitize_payload(trip_distribution),
        "stop_map": _records(stop_agg),
        "stop_sequence_geo": stop_sequence_geo,
        "ba_line_best_trip": _records(ba_line_best_trip),
        "od_top": od_top,
    }

    payload = sanitize_payload(payload)
    text = json.dumps(payload, ensure_ascii=False, allow_nan=False)
    size = len(text.encode("utf-8"))
    if size > MAX_PAYLOAD_BYTES:
        raise SystemExit(
            f"Dashboard JSON is {size / 1e6:.2f} MB (limit {MAX_PAYLOAD_BYTES / 1e6:.0f} MB). "
            "Trim slot_summary/vehicle_summary or add slice API endpoints."
        )

    out_file = Path(out_path) if out_path else (out_dir / f"{agency_id}-dashboard.json")
    out_file.parent.mkdir(parents=True, exist_ok=True)
    out_file.write_text(text, encoding="utf-8")
    # Only refresh the static public copy when exporting in-place (dev). Job
    # exports pass --out so concurrent uploads do not leak into the portal shell.
    if out_path is None and agency_id == "bhavnagar":
        (out_dir / "bhavnagar-dashboard.json").write_text(text, encoding="utf-8")
    print(f"Wrote {out_file} ({size / 1e6:.2f} MB, schema_version=2)")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Export Phase 3 dashboard JSON")
    parser.add_argument("--agency-id", default="bhavnagar")
    parser.add_argument(
        "--out",
        default=None,
        help="Optional output JSON path (defaults to webapp/public/data/{agency}-dashboard.json)",
    )
    args = parser.parse_args()
    main(agency_id=args.agency_id, out_path=Path(args.out) if args.out else None)