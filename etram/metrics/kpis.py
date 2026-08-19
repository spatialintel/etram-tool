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
    # Spec text uses AVERAGE(length) × trip count. That matches SUM(length)
    # only when every trip has the same length. Mixed lengths must use
    # Σ revenue ÷ Σ route_length (one row per trip = vehicle-km).
    vkm = trip_summary["route_length_km"].astype(float).sum()
    if vkm == 0 or pd.isna(vkm):
        return None
    return float(trip_summary["revenue_trip"].sum() / vkm)


def kpi_atl(route_day: pd.DataFrame) -> float | None:
    r = route_day["ridership"].sum()
    if r == 0:
        return None
    return float(route_day["pax_km"].sum() / r)


def kpi_epkm_route(route_day: pd.DataFrame) -> float | None:
    vkm = kpi_vehicle_km(route_day)
    if vkm is None or vkm == 0:
        return None
    return float(route_day["revenue"].sum() / vkm)


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
    # docs/phase0/03-metric-spec.md literally reads:
    #   "Vehicle KM = SUM(route_length_route) x SUM(n_trips)"
    # That's the correct DAX only when route_length_route lives on a routes
    # DIMENSION table (one row per route). Here it's denormalized onto the
    # route_day FACT table (route_day.py repeats the same length on every
    # day-row for a route). Taking that literally — SUM(length) x SUM(trips)
    # over a multi-day window — sums the same route length once per day
    # before multiplying, inflating the result by a spurious extra factor of
    # "number of days". The row-wise SUMX below (length_i x trips_i, summed)
    # is the metrically correct one and is what's implemented; do not "fix"
    # this back to a literal SUM(a)*SUM(b) — that reintroduces the bug.
    # Verified equivalent to the spec text only in the single-row case
    # (one route, one day), where both formulas coincide.
    if route_day.empty:
        return None
    return float((route_day["route_length_route"].astype(float) * route_day["n_trips"].astype(float)).sum())


def kpi_vehicle_km_per_bus(route_day: pd.DataFrame) -> float | None:
    buses = route_day["n_buses"].sum()
    if buses == 0:
        return None
    vkm = kpi_vehicle_km(route_day)
    return None if vkm is None else vkm / buses


def _line_day_headway(starts: pd.Series) -> tuple[float | None, int]:
    """Mean interval on one route-direction-day: (last start − first start) / (n − 1)."""
    s = pd.to_datetime(starts, errors="coerce").dropna().sort_values()
    n = int(len(s))
    if n < 2:
        return None, n
    span_min = (s.iloc[-1] - s.iloc[0]).total_seconds() / 60.0
    if span_min <= 0:
        return None, n
    return float(span_min / (n - 1)), n


def kpi_headway_mins(trip_summary: pd.DataFrame) -> float | None:
    """Observed headway: trip-weighted mean of per route-direction-day intervals.

    Pooling every route into one clock span / trip count understates headway
    (parallel services look like a metro). Each line-day uses
    (MAX(trip_start) − MIN(trip_start)) / (n − 1) with n ≥ 2; the network
    figure weights those by trip count.
    """
    if trip_summary.empty:
        return None
    df = trip_summary
    if "trip_start_time" in df.columns:
        starts = pd.to_datetime(df["trip_start_time"], errors="coerce")
    else:
        starts = pd.Series(pd.NaT, index=df.index)
    if starts.notna().sum() == 0 and "timeslot_1" in df.columns:
        starts = pd.to_datetime(df["timeslot_1"], errors="coerce")
    work = df.assign(_start=starts).dropna(subset=["_start"])
    if work.empty:
        return None

    keys: list[str] = []
    if "service_date" in work.columns:
        keys.append("service_date")
    if "route_direction_key" in work.columns:
        keys.append("route_direction_key")
    elif "route_code" in work.columns:
        keys.append("route_code")

    weighted = 0.0
    weight = 0.0
    if keys:
        grouped = work.groupby(keys, dropna=False, sort=False)["_start"]
    else:
        grouped = [(None, work["_start"])]
    for _, g in grouped:
        hw, n = _line_day_headway(g)
        if hw is None:
            continue
        weighted += hw * n
        weight += n
    if weight == 0:
        return None
    return float(weighted / weight)


def kpi_commercial_speed_kmh(trip_summary: pd.DataFrame) -> float | None:
    """Network commercial speed: Σ route_length_km / Σ trip hours.

    Drops trips with missing times, non-positive duration, or duration outside
    3 minutes–6 hours (clock / fill-down errors).
    """
    if trip_summary.empty or "route_length_km" not in trip_summary.columns:
        return None
    start = pd.to_datetime(trip_summary["trip_start_time"], errors="coerce")
    end = pd.to_datetime(trip_summary["trip_end_time"], errors="coerce")
    hours = (end - start).dt.total_seconds() / 3600.0
    length = pd.to_numeric(trip_summary["route_length_km"], errors="coerce")
    ok = hours.notna() & length.notna() & (hours > 0.05) & (hours < 6.0) & (length > 0)
    if int(ok.sum()) == 0:
        return None
    denom = float(hours[ok].sum())
    if denom <= 0:
        return None
    return float(length[ok].sum() / denom)


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
        "commercial_speed_kmh": kpi_commercial_speed_kmh(ts),
    }
