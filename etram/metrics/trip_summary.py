"""Build trip_summary ≈ Tripwise_Summary(LF)."""
from __future__ import annotations

import pandas as pd


def _floor_30min(series: pd.Series) -> pd.Series:
    """Floor time-of-day to 30-minute bins; returns datetime64."""
    ts = pd.to_datetime(series, errors="coerce")
    # keep date component if present; for time-only excel epoch, still works
    minutes = ts.dt.hour * 60 + ts.dt.minute
    floored = (minutes // 30) * 30
    # rebuild on same calendar day as ts
    base = ts.dt.normalize()
    return base + pd.to_timedelta(floored, unit="m")


def _fmt_hhmm(ts: pd.Series) -> pd.Series:
    t = pd.to_datetime(ts, errors="coerce")
    return t.dt.strftime("%H:%M")


def build_trip_summary(
    tickets: pd.DataFrame,
    vehicles: pd.DataFrame,
    routes: pd.DataFrame,
) -> pd.DataFrame:
    t = tickets.copy()
    t["service_date"] = pd.to_datetime(t["service_date"]).dt.normalize()
    # Conductor packs often have no trip end; commercial speed then stays blank.
    if "trip_end_time" not in t.columns:
        t["trip_end_time"] = pd.NaT

    gcols = ["agency_id", "service_date", "route_code", "route_direction_key", "bus_trip_key"]
    agg = (
        t.groupby(gcols, dropna=False)
        .agg(
            vehicle_id=("vehicle_id", "first"),
            trip_no=("trip_no", "first"),
            ridership_trip=("total_passengers", "sum"),
            revenue_trip=("revenue", "sum"),
            pax_km=("pax_km", "sum"),
            trip_start_time=("trip_start_time", "min"),
            trip_end_time=("trip_end_time", "max"),
            driver_id=("driver_id", "first"),
            conductor_id=("conductor_id", "first"),
        )
        .reset_index()
    )

    veh = vehicles[["agency_id", "vehicle_id", "capacity"]].drop_duplicates()
    agg = agg.merge(veh, on=["agency_id", "vehicle_id"], how="left")
    agg = agg.rename(columns={"capacity": "veh_capacity"})

    rt = routes[["agency_id", "route_direction_key", "route_length_km"]].drop_duplicates()
    agg = agg.merge(rt, on=["agency_id", "route_direction_key"], how="left")
    # ETM and supporting sheets sometimes label the same direction differently.
    rt_code = (
        routes.groupby(["agency_id", "route_code"], dropna=False)["route_length_km"]
        .mean()
        .reset_index()
        .rename(columns={"route_length_km": "route_length_km_fallback"})
    )
    agg = agg.merge(rt_code, on=["agency_id", "route_code"], how="left")
    agg["route_length_km"] = agg["route_length_km"].fillna(agg["route_length_km_fallback"])
    agg = agg.drop(columns=["route_length_km_fallback"])

    agg["capacity_km"] = agg["route_length_km"].astype(float) * agg["veh_capacity"].astype(float)
    agg["timeslot_1"] = _floor_30min(agg["trip_start_time"])
    agg["timeslot_2"] = agg["timeslot_1"] + pd.Timedelta(minutes=30)
    agg["start_time"] = _fmt_hhmm(agg["timeslot_1"])
    agg["end_time"] = _fmt_hhmm(agg["timeslot_2"])
    agg["time_slot_label"] = agg["start_time"] + " - " + agg["end_time"]

    # stable trip_id surrogate
    agg = agg.sort_values(
        ["service_date", "route_direction_key", "bus_trip_key"]
    ).reset_index(drop=True)
    agg["trip_id"] = agg.index + 1

    return agg
