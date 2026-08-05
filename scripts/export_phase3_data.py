from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import pandas as pd


def _sanitize_for_json(x):
    # Python's json module would emit `NaN` which is invalid JSON for JS JSON.parse.
    if x is None:
        return None
    if isinstance(x, float):
        if math.isnan(x) or math.isinf(x):
            return None
    # pandas scalar NA handling
    try:
        if pd.isna(x):
            return None
    except Exception:
        pass
    return x


def sanitize_payload(obj):
    if isinstance(obj, list):
        return [_sanitize_for_json(v) if not isinstance(v, (list, dict)) else sanitize_payload(v) for v in obj]
    if isinstance(obj, dict):
        return {k: (_sanitize_for_json(v) if not isinstance(v, (list, dict)) else sanitize_payload(v)) for k, v in obj.items()}
    return _sanitize_for_json(obj)


def main(agency_id: str = "bhavnagar") -> None:
    root = Path(__file__).resolve().parents[1]
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

    route_day["service_date"] = pd.to_datetime(route_day["service_date"]).dt.strftime("%Y-%m-%d")
    trip["service_date"] = pd.to_datetime(trip["service_date"]).dt.strftime("%Y-%m-%d")
    ba["service_date"] = pd.to_datetime(ba["service_date"]).dt.strftime("%Y-%m-%d")

    daily = (
        route_day.groupby("service_date", as_index=False)
        .agg(
            ridership=("ridership", "sum"),
            revenue=("revenue", "sum"),
            pax_km=("pax_km", "sum"),
            capacity_km=("capacity_km", "sum"),
            trips=("n_trips", "sum"),
            buses=("n_buses", "sum"),
        )
        .sort_values("service_date")
    )
    daily["lf"] = daily["pax_km"] / daily["capacity_km"].replace(0, pd.NA)

    route_trend = route_day[
        [
            "service_date",
            "route_code",
            "ridership",
            "revenue",
            "load_factor_route",
            "n_trips",
            "n_buses",
        ]
    ].copy()

    trip["start_hour"] = pd.to_datetime(trip["trip_start_time"], errors="coerce").dt.hour
    temporal = (
        trip.dropna(subset=["start_hour"])
        .groupby(["service_date", "route_code", "start_hour"], as_index=False)
        .agg(ridership=("ridership_trip", "sum"), revenue=("revenue_trip", "sum"), trips=("trip_id", "count"))
        .sort_values(["service_date", "route_code", "start_hour"])
    )

    stop_agg = (
        ba.groupby(["service_date", "route_direction_key", "stop_abbr", "stop_name"], as_index=False)
        .agg(boarding=("boarding", "sum"), alighting=("alighting", "sum"), peak_load=("passenger_load", "max"))
    )
    stop_agg = stop_agg.merge(
        stops[["stop_abbr", "latitude", "longitude"]].drop_duplicates(),
        on="stop_abbr",
        how="left",
    )
    stop_agg = stop_agg.dropna(subset=["latitude", "longitude"])

    # Shrink payload:
    # Original `ba_line` shipped every bus_trip_key (195k rows). For the UI line chart we only need
    # one representative trip per (service_date, route_direction_key): the trip with max total
    # boarding+alighting across stops (same selection logic as the previous UI reducer).
    ba_scored = ba.copy()
    ba_scored["boarding_plus_alighting"] = ba_scored["boarding"] + ba_scored["alighting"]

    trip_scores = (
        ba_scored.groupby(["service_date", "route_direction_key", "bus_trip_key"], as_index=False)
        .agg(score=("boarding_plus_alighting", "sum"))
    )

    # Pick top scoring trip per date+direction; tie-break by bus_trip_key for determinism.
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
            "route_directions": sorted(ba["route_direction_key"].dropna().unique().tolist()),
        },
        "feature_gates": dq.get("feature_gates", {}),
        "daily": daily.to_dict(orient="records"),
        "route_trend": route_trend.to_dict(orient="records"),
        "temporal": temporal.to_dict(orient="records"),
        "stop_map": stop_agg.to_dict(orient="records"),
        "ba_line_best_trip": ba_line_best_trip.to_dict(orient="records"),
    }

    payload = sanitize_payload(payload)

    # Defensive: ensure we never write invalid JSON.
    out_file = out_dir / f"{agency_id}-dashboard.json"
    out_file.write_text(
        json.dumps(payload, ensure_ascii=False, allow_nan=False), encoding="utf-8"
    )
    # Keep legacy filename for local static UI default load
    if agency_id == "bhavnagar":
        (out_dir / "bhavnagar-dashboard.json").write_text(
            json.dumps(payload, ensure_ascii=False, allow_nan=False), encoding="utf-8"
        )
    print(f"Wrote {out_file}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Export Phase 3 dashboard JSON")
    parser.add_argument("--agency-id", default="bhavnagar")
    args = parser.parse_args()
    main(agency_id=args.agency_id)
