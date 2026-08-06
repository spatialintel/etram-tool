"""Measure Stage Km attach rate for May tickets using stop map + distance matrix."""
from __future__ import annotations

import re
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
MAY = ROOT / "Input files" / "May Data"


def load_od_distances(distance_xlsx: Path) -> dict[tuple[str, str], float]:
    od: dict[tuple[str, str], float] = {}
    for sheet in pd.ExcelFile(distance_xlsx).sheet_names:
        df = pd.read_excel(distance_xlsx, sheet_name=sheet)
        # expect col0 = "A - B", col with distance — try common layouts
        col0 = df.columns[0]
        # find numeric distance column
        dist_col = None
        for c in df.columns[1:]:
            if pd.api.types.is_numeric_dtype(df[c]) or "dist" in str(c).lower() or "km" in str(c).lower():
                dist_col = c
                break
        if dist_col is None:
            # first numeric-looking among remaining
            for c in df.columns[1:]:
                s = pd.to_numeric(df[c], errors="coerce")
                if s.notna().sum() > len(df) * 0.5:
                    dist_col = c
                    break
        if dist_col is None:
            continue
        for _, row in df.iterrows():
            raw = row[col0]
            if pd.isna(raw):
                continue
            parts = re.split(r"\s*-\s*", str(raw).strip())
            if len(parts) != 2:
                continue
            a, b = parts[0].strip().upper(), parts[1].strip().upper()
            d = pd.to_numeric(row[dist_col], errors="coerce")
            if pd.isna(d):
                continue
            od[(a, b)] = float(d)
            od.setdefault((b, a), float(d))
    return od


def main() -> None:
    mapping = pd.read_csv(MAY / "stop_name_to_matrix_abbr.csv")
    name2abbr = {
        r["ticket_stop_name"]: r["matrix_abbr"]
        for _, r in mapping.iterrows()
        if pd.notna(r["matrix_abbr"])
    }
    tickets = pd.read_csv(MAY / "All_Tickets_Bhavnagar_May_2026.csv", low_memory=False)
    tickets["pax"] = (
        pd.to_numeric(tickets["Total Adult"], errors="coerce").fillna(0)
        + pd.to_numeric(tickets["Total Child"], errors="coerce").fillna(0)
    )
    tickets.loc[tickets["pax"] <= 0, "pax"] = 1
    tickets["o"] = tickets["Origin"].astype(str).str.strip().map(name2abbr)
    tickets["d"] = tickets["Destination"].astype(str).str.strip().map(name2abbr)

    dist = MAY / "100 FLEET(STOP TO STOP DISTANCE)_29.07.2026.xlsx"
    # peek one sheet
    xl = pd.ExcelFile(dist)
    sample = pd.read_excel(dist, sheet_name=xl.sheet_names[0], nrows=5)
    print("sheets", len(xl.sheet_names), "sample", xl.sheet_names[:5])
    print("sample cols", list(sample.columns))
    print(sample.head(3).to_string())

    od = load_od_distances(dist)
    print(f"OD pairs loaded: {len(od)}")

    def lookup(row):
        a, b = row["o"], row["d"]
        if pd.isna(a) or pd.isna(b):
            return None
        if a == b:
            return 0.0
        return od.get((a, b))

    tickets["stage_km"] = tickets.apply(lookup, axis=1)
    both = tickets["o"].notna() & tickets["d"].notna()
    has = tickets["stage_km"].notna()
    pax = tickets["pax"]
    print(f"both ends mapped: {100 * both.mean():.1f}% tickets, {100 * pax[both].sum() / pax.sum():.1f}% pax")
    print(f"stage km found:   {100 * has.mean():.1f}% tickets, {100 * pax[has].sum() / pax.sum():.1f}% pax")
    mapped_no_dist = both & ~has
    print(f"mapped but no OD distance: {mapped_no_dist.sum()} tickets ({100 * mapped_no_dist.mean():.1f}%)")
    if mapped_no_dist.any():
        miss = (
            tickets.loc[mapped_no_dist]
            .groupby(["o", "d"], dropna=False)
            .agg(tickets=("Ticket No", "count"), pax=("pax", "sum"))
            .sort_values("pax", ascending=False)
            .head(20)
        )
        print("top missing OD pairs:")
        print(miss.to_string())


if __name__ == "__main__":
    main()
