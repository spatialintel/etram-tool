"""KPI aggregations: period ratios from sums, not means of daily ratios."""

from __future__ import annotations

import pandas as pd

from etram.metrics.kpis import kpi_epkm, kpi_epkm_route, kpi_lf, kpi_vehicle_km


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
