"""Agency / filter-context KPI measures from metric spec."""
from __future__ import annotations

from typing import Any

import pandas as pd


def filter_trips(
    trip_summary: pd.DataFrame,
    *,
    service_date: str | None = None,
    route_code: str | None = None,
    route_direction_key: str | None = None,
) -> pd.DataFrame:
    df = trip_summary
    if service_date is not None:
        d = pd.Timestamp(service_date).normalize()
        df = df[pd.to_datetime(df["service_date"]).dt.normalize() == d]
    if route_code is not None:
        df = df[df["route_code"] == route_code]
    if route_direction_key is not None:
        df = df[df["route_direction_key"] == route_direction_key]
    return df


def filter_route_day(
    route_day: pd.DataFrame,
    *,
    service_date: str | None = None,
    route_code: str | None = None,
) -> pd.DataFrame:
    df = route_day
    if service_date is not None:
        d = pd.Timestamp(service_date).normalize()
        df = df[pd.to_datetime(df["service_date"]).dt.normalize() == d]
    if route_code is not None:
        df = df[df["route_code"] == route_code]
    return df


def kpi_lf(trip_summary: pd.DataFrame) -> float | None:
    cap = trip_summary["capacity_km"].sum()
    if cap == 0 or pd.isna(cap):
        return None
    return float(trip_summary["pax_km"].sum() / cap)


def kpi_epkm(trip_summary: pd.DataFrame) -> float | None:
    n = trip_summary["trip_id"].nunique()
    avg_len = trip_summary["route_length_km"].mean()
    if n == 0 or pd.isna(avg_len) or avg_len == 0:
        return None
    return float(trip_summary["revenue_trip"].sum() / (avg_len * n))


def kpi_atl(route_day: pd.DataFrame) -> float | None:
    r = route_day["ridership"].sum()
    if r == 0:
        return None
    return float(route_day["pax_km"].sum() / r)


def kpi_epkm_route(route_day: pd.DataFrame) -> float | None:
    avg_len = route_day["route_length_route"].mean()
    n_trips = route_day["n_trips"].sum()
    if pd.isna(avg_len) or avg_len == 0 or n_trips == 0:
        return None
    return float(route_day["revenue"].sum() / (avg_len * n_trips))


def kpi_epb(route_day: pd.DataFrame) -> float | None:
    buses = route_day["n_buses"].sum()
    if buses == 0:
        return None
    return float(route_day["revenue"].sum() / buses)


def kpi_trips_per_bus(route_day: pd.DataFrame) -> float | None:
    buses = route_day["n_buses"].sum()
    if buses == 0:
        return None
    return float(route_day["n_trips"].sum() / buses)


def kpi_vehicle_km(route_day: pd.DataFrame) -> float | None:
    return float(route_day["route_length_route"].sum() * route_day["n_trips"].sum())


def kpi_vehicle_km_per_bus(route_day: pd.DataFrame) -> float | None:
    buses = route_day["n_buses"].sum()
    if buses == 0:
        return None
    vkm = kpi_vehicle_km(route_day)
    return None if vkm is None else vkm / buses


def kpi_headway_mins(trip_summary: pd.DataFrame) -> float | None:
    if trip_summary.empty:
        return None
    t1 = pd.to_datetime(trip_summary["timeslot_1"], errors="coerce").dropna()
    t2 = pd.to_datetime(trip_summary["timeslot_2"], errors="coerce").dropna()
    if t1.empty or t2.empty:
        return None
    span_min = (t2.max() - t1.min()).total_seconds() / 60.0
    n_departures = len(trip_summary)
    if n_departures < 2:
        return None
    return float(span_min / (n_departures - 1))


def summarize_kpis(
    trip_summary: pd.DataFrame,
    route_day: pd.DataFrame,
    *,
    service_date: str | None = None,
    route_code: str | None = None,
) -> dict[str, Any]:
    ts = filter_trips(trip_summary, service_date=service_date, route_code=route_code)
    rd = filter_route_day(route_day, service_date=service_date, route_code=route_code)
    return {
        "service_date": service_date,
        "route_code": route_code,
        "ridership": int(rd["ridership"].sum()) if len(rd) else 0,
        "revenue": float(rd["revenue"].sum()) if len(rd) else 0.0,
        "n_trips": int(rd["n_trips"].sum()) if len(rd) else 0,
        "n_buses": int(rd["n_buses"].sum()) if len(rd) else 0,
        "pax_km": float(rd["pax_km"].sum()) if len(rd) else 0.0,
        "capacity_km": float(rd["capacity_km"].sum()) if len(rd) else 0.0,
        "LF": kpi_lf(ts),
        "EPKM": kpi_epkm(ts),
        "ATL": kpi_atl(rd),
        "EPKM_route": kpi_epkm_route(rd),
        "EPB": kpi_epb(rd),
        "trips_per_bus": kpi_trips_per_bus(rd),
        "vehicle_km": kpi_vehicle_km(rd) if len(rd) else None,
        "vehicle_km_per_bus": kpi_vehicle_km_per_bus(rd) if len(rd) else None,
        "headway_mins": kpi_headway_mins(ts),
    }
