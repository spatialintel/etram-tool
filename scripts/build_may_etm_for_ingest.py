"""Build May ETM CSV in April ingest schema, with Stage Km attached.

Reads Conductor Report (routed), HOD stop map, and the 100-FLEET distance
workbook. Writes a CSV whose columns match ``config/agencies/bhavnagar.yaml``.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from etram.ingest.stage_km import load_od_distances, stage_km_for_pair  # noqa: E402
from etram.ingest.stop_map import build_stop_name_map  # noqa: E402

MAY = ROOT / "Input files" / "May Data"
UPLOAD = MAY / "Upload"
WORKING = MAY / "Working"
SRC = WORKING / "ETM_Bhavnagar_May_2026_routed.csv"
OUT = WORKING / "ETM_Bhavnagar_May_2026_ingest.csv"
HOD = WORKING / "Supporting data by HOD.xlsx"
DIST = UPLOAD / "100 FLEET(STOP TO STOP DISTANCE)_29.07.2026.xlsx"
MAP_CSV = WORKING / "stop_name_to_matrix_abbr.csv"


def _trip_no_int(series: pd.Series) -> pd.Series:
    """Map opaque Trip Number strings to stable positive ints (ingest expects Int64)."""
    codes, _ = pd.factorize(series.astype(str), sort=False)
    return pd.Series(codes + 1, index=series.index, dtype="int64")


def main() -> None:
    print(f"Reading {SRC}")
    raw = pd.read_csv(SRC, low_memory=False)
    print(f"  rows={len(raw)}")

    names = sorted(
        set(raw["Pass Origin"].dropna().astype(str).str.strip())
        | set(raw["Pass Destination"].dropna().astype(str).str.strip())
    )
    if MAP_CSV.exists():
        mapping = pd.read_csv(MAP_CSV)
        # Rebuild if stop set drifted
        mapped_names = set(mapping["ticket_stop_name"].astype(str))
        if not set(names).issubset(mapped_names):
            print("Stop map incomplete vs tickets; rebuilding…")
            mapping = build_stop_name_map(names, hod_xlsx=HOD, distance_xlsx=DIST)
            mapping.to_csv(MAP_CSV, index=False)
    else:
        mapping = build_stop_name_map(names, hod_xlsx=HOD, distance_xlsx=DIST)
        mapping.to_csv(MAP_CSV, index=False)

    name2abbr = {
        str(r["ticket_stop_name"]): r["matrix_abbr"]
        for _, r in mapping.iterrows()
        if pd.notna(r.get("matrix_abbr"))
    }
    print(f"  stop map entries with abbr: {len(name2abbr)}")

    print(f"Loading OD distances from {DIST.name}")
    od = load_od_distances(DIST)
    print(f"  OD pairs: {len(od)}")

    origin = raw["Pass Origin"].astype(str).str.strip()
    dest = raw["Pass Destination"].astype(str).str.strip()
    o_abbr = origin.map(name2abbr)
    d_abbr = dest.map(name2abbr)
    stage = [
        stage_km_for_pair(o, d, od) for o, d in zip(o_abbr.tolist(), d_abbr.tolist())
    ]
    stage_s = pd.Series(stage, index=raw.index, dtype="float64")
    both = o_abbr.notna() & d_abbr.notna()
    has = stage_s.notna()
    print(
        f"  both ends mapped: {100 * both.mean():.1f}% | "
        f"stage_km: {100 * has.mean():.1f}%"
    )

    trip_no = _trip_no_int(raw["Trip Number"])

    out = pd.DataFrame(
        {
            "Date": pd.to_datetime(raw["Date"], errors="coerce").dt.strftime("%Y-%m-%d"),
            "Ticket No.": raw["Ticket Number"],
            "Route No.": raw["Route Number"].astype(str).str.strip(),
            "Route description": raw["Route Description"],
            "Depot": "Bhavnagar",
            "Vehicle/ Schedule no.": raw["Bus Number"],
            "Driver ID": pd.NA,
            "Conductor ID": raw["Conductor Name"],
            "Trip No.": trip_no,
            "Trip Start Time": raw["Trip Start Time"],
            "Trip End Time": raw["Trip End Time"],
            "Ticket Issue Time": raw["Ticket Issue Time"],
            "No. of pass.": pd.to_numeric(raw["No. of Pass"], errors="coerce").fillna(0).astype(int),
            "No. of child Pass.": pd.to_numeric(raw["No. of Child Pass"], errors="coerce")
            .fillna(0)
            .astype(int),
            "Pass. Category": raw["Pass Category"],
            "Origin Stop No.": pd.NA,
            "Destination Stop No.": pd.NA,
            "Pass. Origin": o_abbr,
            "Pass. Destination": d_abbr,
            "Stage Km": stage_s,
            "Revenue": pd.to_numeric(raw["Revenue"], errors="coerce"),
            "Gender": raw["Gender"] if "Gender" in raw.columns else pd.NA,
        }
    )

    # Drop rows without date or route (DQ BLOCK rules)
    before = len(out)
    out = out[out["Date"].notna() & out["Route No."].notna() & (out["Route No."] != "") & (out["Route No."] != "nan")]
    print(f"  dropped {before - len(out)} rows missing date/route; kept {len(out)}")

    out.to_csv(OUT, index=False)
    print(f"Wrote {OUT}")
    print(f"  stage_km non-null: {out['Stage Km'].notna().mean() * 100:.1f}%")
    print(f"  revenue sum: {out['Revenue'].sum():,.0f}")
    print(f"  passengers sum: {(out['No. of pass.'] + out['No. of child Pass.']).sum():,.0f}")


if __name__ == "__main__":
    main()
