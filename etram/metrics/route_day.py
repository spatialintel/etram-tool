"""Build route_day_summary ≈ Routewise_summary."""
from __future__ import annotations

import pandas as pd


def build_route_day_summary(
    tickets: pd.DataFrame,
    trip_summary: pd.DataFrame,
    routes: pd.DataFrame,
) -> pd.DataFrame:
    t = tickets.copy()
    t["service_date"] = pd.to_datetime(t["service_date"]).dt.normalize()

    base = (
        t.groupby(["agency_id", "service_date", "route_code"], dropna=False)
        .agg(
            ridership=("total_passengers", "sum"),
            revenue=("revenue", "sum"),
            pax_km_tickets=("pax_km", "sum"),
            n_buses=("vehicle_id", "nunique"),
            male_ridership=("total_passengers", lambda s: s[t.loc[s.index, "gender"].eq("M")].sum() if False else 0),
        )
        .reset_index()
    )
    # gender aggregates explicitly
    male = (
        t[t["gender"].astype(str) == "M"]
        .groupby(["agency_id", "service_date", "route_code"], dropna=False)["total_passengers"]
        .sum()
        .rename("male_ridership")
    )
    female = (
        t[t["gender"].astype(str) == "F"]
        .groupby(["agency_id", "service_date", "route_code"], dropna=False)["total_passengers"]
        .sum()
        .rename("female_ridership")
    )
    base = base.drop(columns=["male_ridership"], errors="ignore")
    base = base.merge(male, on=["agency_id", "service_date", "route_code"], how="left")
    base = base.merge(female, on=["agency_id", "service_date", "route_code"], how="left")
    base["male_ridership"] = base["male_ridership"].fillna(0).astype("Int64")
    base["female_ridership"] = base["female_ridership"].fillna(0).astype("Int64")

    ts = trip_summary.copy()
    ts["service_date"] = pd.to_datetime(ts["service_date"]).dt.normalize()
    trip_agg = (
        ts.groupby(["agency_id", "service_date", "route_code"], dropna=False)
        .agg(
            n_trips=("trip_id", "count"),
            pax_km=("pax_km", "sum"),
            capacity_km=("capacity_km", "sum"),
        )
        .reset_index()
    )
    out = base.drop(columns=["pax_km_tickets"]).merge(
        trip_agg, on=["agency_id", "service_date", "route_code"], how="left"
    )

    # route length (mean across directions for route_code)
    rl = (
        routes.groupby(["agency_id", "route_code"], dropna=False)["route_length_km"]
        .mean()
        .rename("route_length_route")
        .reset_index()
    )
    out = out.merge(rl, on=["agency_id", "route_code"], how="left")

    out["ridership_per_bus"] = out["ridership"] / out["n_buses"].replace(0, pd.NA)
    out["revenue_per_bus"] = out["revenue"] / out["n_buses"].replace(0, pd.NA)
    out["ridership_per_trip"] = out["ridership"] / out["n_trips"].replace(0, pd.NA)
    out["revenue_per_trip"] = out["revenue"] / out["n_trips"].replace(0, pd.NA)
    out["load_factor_route"] = out["pax_km"] / out["capacity_km"].replace(0, pd.NA)

    out["day_name"] = out["service_date"].dt.day_name()
    out["day_of_year"] = out["service_date"].dt.dayofyear
    out["week_no"] = out["service_date"].dt.isocalendar().week.astype(int)
    # PBIX uses WEEKNUM(Date,1) = week starting Sunday; pandas isocalendar is Mon-based.
    # Approximate with %U style: week number Sunday-based
    out["week_no"] = out["service_date"].apply(lambda d: int(d.strftime("%U"))).astype(int)
    out["year"] = out["service_date"].dt.year

    week_bounds = (
        out.groupby(["agency_id", "year", "week_no"], dropna=False)["service_date"]
        .agg(week_start="min", week_end="max")
        .reset_index()
    )
    out = out.merge(week_bounds, on=["agency_id", "year", "week_no"], how="left")
    out["week_label"] = (
        out["week_start"].dt.strftime("%Y-%m-%d") + "-" + out["week_end"].dt.strftime("%Y-%m-%d")
    )

    # ridership/day and revenue/day across all routes that day (PBIX filter by Date / DayNoOfYear)
    day_tot = (
        out.groupby(["agency_id", "service_date"], dropna=False)
        .agg(ridership_day=("ridership", "sum"), revenue_day=("revenue", "sum"))
        .reset_index()
    )
    out = out.merge(day_tot, on=["agency_id", "service_date"], how="left")

    out = out.sort_values(["service_date", "route_code"]).reset_index(drop=True)
    out["route_id"] = out.index + 1
    return out
