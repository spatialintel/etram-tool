"""Validate Phase 2 metrics against PBIX baseline fixtures."""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from etram.metrics.kpis import kpi_epkm, summarize_kpis


def approx(a, b, rel=0.001) -> bool:
    if a is None or b is None:
        return a == b
    if abs(b) < 1e-12:
        return abs(a - b) < 1e-9
    return abs(a - b) / abs(b) <= rel


def main() -> int:
    canon = ROOT / "data" / "canonical" / "bhavnagar"
    base = json.loads((ROOT / "tests" / "fixtures" / "pbix_baseline_bhavnagar.json").read_text(encoding="utf-8"))
    trip = pd.read_parquet(canon / "trip_summary.parquet")
    rd = pd.read_parquet(canon / "route_day_summary.parquet")
    ba = pd.read_parquet(canon / "ba_stop_trip.parquet")

    checks = []
    b = base["R1_2026-04-01"]
    sub = rd[(rd["service_date"].astype(str).str[:10] == "2026-04-01") & (rd["route_code"] == "R1")].iloc[0]
    checks += [
        ("R1 ridership", int(sub.ridership), b["ridership"], True),
        ("R1 revenue", float(sub.revenue), b["revenue"], True),
        ("R1 n_trips", int(sub.n_trips), b["n_trips"], True),
        ("R1 n_buses", int(sub.n_buses), b["n_buses"], True),
        ("R1 pax_km", float(sub.pax_km), b["pax_km"], False),
        ("R1 capacity_km", float(sub.capacity_km), b["capacity_km"], False),
        ("R1 LF", float(sub.load_factor_route), b["LF"], False),
        ("R1 ATL", float(sub.pax_km / sub.ridership), b["ATL"], False),
        ("R1 EPB", float(sub.revenue / sub.n_buses), b["EPB"], False),
    ]
    ts = trip[(trip["service_date"].astype(str).str[:10] == "2026-04-01") & (trip["route_code"] == "R1")]
    checks.append(("R1 EPKM", kpi_epkm(ts), b["EPKM_pbix_formula"], False))

    aw = base["agency_wide"]
    checks += [
        ("agency ridership", int(rd.ridership.sum()), aw["ridership"], True),
        ("agency revenue", float(rd.revenue.sum()), aw["revenue"], True),
        ("agency pax_km", float(rd.pax_km.sum()), aw["pax_km"], False),
        ("agency ATL", float(rd.pax_km.sum() / rd.ridership.sum()), aw["ATL"], False),
        ("agency trip_unique", len(trip), aw["trip_unique_grain"], True),
        ("agency route_days", len(rd), aw["route_day_rows"], True),
        ("agency capacity_unique_trips", float(trip.capacity_km.sum()), float(aw.get("capacity_km_unique_trips", trip.capacity_km.sum())), False),
    ]

    one = ba[
        (ba["service_date"].astype(str).str[:10] == "2026-04-12")
        & (ba["bus_trip_key"] == "GJ04AX2594-1")
        & (ba["route_direction_key"] == "R1-Gangajaliya Bus stop_Top 3 Bus depo")
    ]
    bb = base["BA_GJ04AX2594-1_2026-04-12"]
    checks.append(("BA rows (stops)", len(one), 17, True))
    checks.append(("BA sum boarding", int(one.boarding.sum()), bb["sum_boarding_unique"], True))
    checks.append(("BA sum alighting", int(one.alighting.sum()), bb["sum_alighting_unique"], True))
    checks.append(("BA stop1 boarding", int(one.loc[one.stop_no == 1, "boarding"].iloc[0]), 4, True))
    checks.append(("BA stop13 alighting", int(one.loc[one.stop_no == 13, "alighting"].iloc[0]), 2, True))
    checks.append(("BA stop15 alighting", int(one.loc[one.stop_no == 15, "alighting"].iloc[0]), 2, True))
    # passenger load after stop 1 should be 4
    checks.append(("BA load after stop1", int(one.loc[one.stop_no == 1, "passenger_load"].iloc[0]), 4, True))

    fail = 0
    for name, got, exp, exact in checks:
        ok = (got == exp) if exact else approx(got, exp)
        print(("PASS" if ok else "FAIL") + f": {name}: got={got} exp={exp}")
        if not ok:
            fail += 1
    print(f"\n{len(checks)-fail}/{len(checks)} passed")
    return 1 if fail else 0


if __name__ == "__main__":
    raise SystemExit(main())
