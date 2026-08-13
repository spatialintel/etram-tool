"""KPI aggregations: period ratios from sums, not means of daily ratios."""

from __future__ import annotations

import pandas as pd

from etram.metrics.kpis import kpi_epkm, kpi_epkm_route, kpi_headway_mins, kpi_lf, kpi_vehicle_km


def test_kpi_epkm_one_row_per_trip_is_revenue_over_sum_length() -> None:
    ts = pd.DataFrame(
        {
            "route_length_km": [10.0, 40.0],
            "revenue_trip": [80.0, 20.0],
        }
    )
    assert kpi_epkm(ts) == 100.0 / 50.0


def test_kpi_epkm_route_multi_day_uses_sumx_vehicle_km() -> None:
    rd = pd.DataFrame(
        {
            "route_length_route": [10.0, 30.0],
            "n_trips": [1, 9],
            "revenue": [50.0, 150.0],
        }
    )
    # SUMX = 10*1 + 30*9 = 280; EPKM = 200/280
    # AVERAGE(length)×SUM(trips) = 20×10 = 200 would give 1.0
    assert kpi_vehicle_km(rd) == 280.0
    assert kpi_epkm_route(rd) == 200.0 / 280.0
    assert kpi_epkm_route(rd) != 200.0 / (20.0 * 10)


def test_kpi_lf_is_sum_over_sum() -> None:
    ts = pd.DataFrame(
        {
            "pax_km": [10.0, 10.0],
            "capacity_km": [10.0, 90.0],
        }
    )
    assert kpi_lf(ts) == 0.2


def test_kpi_headway_groups_by_route_direction_not_network_span() -> None:
    rows = []
    for i in range(10):
        rd = f"R{i}-UP"
        rows.append(
            {
                "service_date": "2026-05-01",
                "route_direction_key": rd,
                "trip_start_time": "2026-05-01 08:00:00",
            }
        )
        rows.append(
            {
                "service_date": "2026-05-01",
                "route_direction_key": rd,
                "trip_start_time": "2026-05-01 08:40:00",
            }
        )
    ts = pd.DataFrame(rows)
    assert kpi_headway_mins(ts) == 40.0
    # Pooled span/n would be 40/20 = 2; span/(n-1) still 40/19 ≈ 2.1
    assert kpi_headway_mins(ts) != 40.0 / 20
    assert kpi_headway_mins(ts) != 40.0 / 19


def test_kpi_headway_trip_weights_line_days() -> None:
    ts = pd.DataFrame(
        {
            "service_date": ["2026-05-01"] * 4,
            "route_direction_key": ["A-UP", "A-UP", "B-UP", "B-UP"],
            "trip_start_time": [
                "2026-05-01 06:00:00",
                "2026-05-01 07:00:00",
                "2026-05-01 06:00:00",
                "2026-05-01 06:10:00",
            ],
        }
    )
    # A: 60 min / 1 = 60, n=2; B: 10 min / 1 = 10, n=2; equal weight → 35
    assert kpi_headway_mins(ts) == 35.0
    ts3 = pd.DataFrame(
        {
            "service_date": ["2026-05-01"] * 5,
            "route_direction_key": ["A-UP", "A-UP", "B-UP", "B-UP", "B-UP"],
            "trip_start_time": [
                "2026-05-01 06:00:00",
                "2026-05-01 07:00:00",
                "2026-05-01 06:00:00",
                "2026-05-01 06:10:00",
                "2026-05-01 06:20:00",
            ],
        }
    )
    # A: 60, n=2; B: 20/2=10, n=3; weighted (60*2+10*3)/5 = 30
    assert kpi_headway_mins(ts3) == 30.0


def test_kpi_headway_skips_single_trip_lines() -> None:
    ts = pd.DataFrame(
        {
            "service_date": ["2026-05-01", "2026-05-01", "2026-05-01"],
            "route_direction_key": ["A-UP", "A-UP", "B-UP"],
            "trip_start_time": [
                "2026-05-01 08:00:00",
                "2026-05-01 08:30:00",
                "2026-05-01 08:00:00",
            ],
        }
    )
    assert kpi_headway_mins(ts) == 30.0
