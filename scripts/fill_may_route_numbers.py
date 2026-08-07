"""Fill May ETM Route Number (col C) from Route Description and map to KML.

Also documents the upload requirement: when multiple Conductor_Report CSVs are
uploaded, the tool must concatenate them and drop duplicate ticket rows before
ingest.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from etram.ingest.route_map import (  # noqa: E402
    annotate_route_columns,
    load_kml_route_lengths,
)

MAY = ROOT / "Input files" / "May Data"
UPLOAD = MAY / "Upload"
WORKING = MAY / "Working"
COMPILED = WORKING / "ETM_Bhavnagar_May_2026.csv"
KML = WORKING / "RAHUL MAP.kml"
NOTE = WORKING / "UPLOAD_PIPELINE_NOTES.md"


def main() -> None:
    kml_km = load_kml_route_lengths(KML)
    print(f"KML routes loaded: {len(kml_km)}")

    df = pd.read_csv(COMPILED, low_memory=False)
    df = annotate_route_columns(df)
    df["kml_route_length_km"] = df["kml_route_code"].map(kml_km)

    # Drop prior helper cols if re-run
    for col in ("parsed_route_code", "parsed_route_description"):
        if col in df.columns:
            df = df.drop(columns=[col])

    filled = df["Route Number"].notna().sum()
    missing = df["Route Number"].isna().sum()
    unmapped_kml = df["kml_route_length_km"].isna() & df["Route Number"].notna()
    print(f"Route Number filled: {filled:,} | blank: {missing:,}")
    print(f"KML length matched: {df['kml_route_length_km'].notna().sum():,} | unmatched: {unmapped_kml.sum():,}")
    print("\nRoute Number × KML mapping (ticket counts):")
    summary = (
        df.dropna(subset=["Route Number"])
        .groupby(["Route Number", "kml_route_code"], dropna=False)
        .agg(
            tickets=("Ticket Number", "count"),
            kml_km=("kml_route_length_km", "first"),
            sample_desc=("Route Description", "first"),
            first_stop=("route_first_stop", "first"),
            last_stop=("route_last_stop", "first"),
        )
        .reset_index()
        .sort_values("Route Number")
    )
    print(summary.to_string(index=False))

    out_path = COMPILED
    try:
        df.to_csv(out_path, index=False)
    except PermissionError:
        out_path = WORKING / "ETM_Bhavnagar_May_2026_routed.csv"
        df.to_csv(out_path, index=False)
        print(f"\nWARNING: {COMPILED.name} is locked; wrote {out_path.name} instead")
    print(f"\nUpdated {out_path}")

    # Also fill each weekly source CSV so column C is ready for re-upload.
    for path in sorted(MAY.glob("Conductor_Report_*.csv")):
        week = pd.read_csv(path, low_memory=False)
        week = annotate_route_columns(week)
        week["kml_route_code"] = week["kml_route_code"]
        week["kml_route_length_km"] = week["kml_route_code"].map(kml_km)
        week.to_csv(path, index=False)
        print(f"Updated {path.name}: Route Number filled {week['Route Number'].notna().sum():,}/{len(week):,}")

    NOTE.write_text(
        "\n".join(
            [
                "# Upload pipeline notes (May ETM)",
                "",
                "## Automatic combine + dedupe (required)",
                "",
                "When a user uploads one or more `Conductor_Report_*.csv` files",
                "(or a folder of weekly ETM extracts), the E-TRAM tool must:",
                "",
                "1. Concatenate all CSVs that share the Conductor Report schema.",
                "2. Drop duplicate tickets on",
                "   `(Date, Ticket Number, Bus Number, Trip Number, Ticket Issue Time,",
                "    Pass Origin, Pass Destination, Revenue)` keeping the first row.",
                "3. Parse **Route Number** from **Route Description** (column D → C)",
                "   using `etram.ingest.route_map.annotate_route_columns`.",
                "4. Map each route to a KML length via `kml_route_code`",
                "   (aliases: `R4E→R4Z`; Avaniya endpoints → `R6E`).",
                "",
                "This was done manually for May 2026 into `ETM_Bhavnagar_May_2026.csv`.",
                "Wire the same steps into the upload job before Phase 1 ingest.",
                "",
                "## Route ID mapping used",
                "",
                summary.to_string(index=False),
                "",
            ]
        ),
        encoding="utf-8",
    )
    print(f"Wrote {NOTE}")


if __name__ == "__main__":
    main()
