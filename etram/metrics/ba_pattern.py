"""Build ba_stop_trip ≈ BA Pattern & Paxload (clean grain)."""
from __future__ import annotations

import pandas as pd

from etram.metrics.trip_summary import _floor_30min, _fmt_hhmm


def build_ba_stop_trip(
    tickets: pd.DataFrame,
    trip_summary: pd.DataFrame,
    stop_sequence: pd.DataFrame,
) -> pd.DataFrame:
    """One row per trip × stop along matching date + route_direction.

    Boarding/Alighting formulas match PBIX DAX.
    """
    trips = trip_summary.copy()
    trips["service_date"] = pd.to_datetime(trips["service_date"]).dt.normalize()

    seq = stop_sequence.copy()
    seq["service_date"] = pd.to_datetime(seq["service_date"]).dt.normalize()
    # Phase 1 stop_sequence files can repeat the same calendar dates; keep one stop chain
    seq = seq.drop_duplicates(
        subset=["agency_id", "service_date", "route_direction_key", "stop_no", "stop_abbr"],
        keep="first",
    )

    skel = trips.merge(
        seq[
            [
                "agency_id",
                "service_date",
                "route_direction_key",
                "stop_no",
                "stop_id",
                "stop_name",
                "stop_abbr",
                "segment",
                "seq_index",
                "stop_abbr_key",
            ]
        ],
        on=["agency_id", "service_date", "route_direction_key"],
        how="inner",
    )

    t = tickets.copy()
    t["service_date"] = pd.to_datetime(t["service_date"]).dt.normalize()

    board = (
        t.groupby(
            ["agency_id", "service_date", "route_direction_key", "bus_trip_key", "stop_origin_key"],
            dropna=False,
        )["total_passengers"]
        .sum()
        .rename("boarding")
        .reset_index()
        .rename(columns={"stop_origin_key": "stop_abbr_key"})
    )
    alight = (
        t.groupby(
            [
                "agency_id",
                "service_date",
                "route_direction_key",
                "bus_trip_key",
                "stop_destination_key",
            ],
            dropna=False,
        )["total_passengers"]
        .sum()
        .rename("alighting")
        .reset_index()
        .rename(columns={"stop_destination_key": "stop_abbr_key"})
    )

    out = skel.merge(
        board,
        on=["agency_id", "service_date", "route_direction_key", "bus_trip_key", "stop_abbr_key"],
        how="left",
    )
    out = out.merge(
        alight,
        on=["agency_id", "service_date", "route_direction_key", "bus_trip_key", "stop_abbr_key"],
        how="left",
    )
    out["boarding"] = out["boarding"].fillna(0).astype("Int64")
    out["alighting"] = out["alighting"].fillna(0).astype("Int64")

    out = out.sort_values(
        ["service_date", "route_direction_key", "bus_trip_key", "stop_no", "seq_index"]
    )
    g = out.groupby(
        ["agency_id", "service_date", "route_direction_key", "bus_trip_key"], dropna=False
    )
    out["cumulative_boarding"] = g["boarding"].cumsum()
    out["cumulative_alighting"] = g["alighting"].cumsum()
    out["passenger_load"] = out["cumulative_boarding"] - out["cumulative_alighting"]

    out["timeslot_1"] = _floor_30min(out["trip_start_time"])
    out["start_time"] = _fmt_hhmm(out["timeslot_1"])
    out["end_time"] = _fmt_hhmm(out["timeslot_1"] + pd.Timedelta(minutes=30))
    out["time_slot_label"] = out["start_time"] + " - " + out["end_time"]
    out["total_passengers_at_stop"] = out["boarding"]

    out = out.rename(
        columns={
            "pax_km": "trip_pax_km",
            "veh_capacity": "trip_veh_capacity",
            "route_length_km": "trip_route_length_km",
        }
    )
    return out.reset_index(drop=True)
