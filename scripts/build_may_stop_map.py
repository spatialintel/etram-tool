"""Rebuild May stop-name → matrix-abbr map using HOD supporting data."""
from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from etram.ingest.stop_map import build_stop_name_map  # noqa: E402

MAY = ROOT / "Input files" / "May Data"
UPLOAD = MAY / "Upload"
WORKING = MAY / "Working"


def main() -> None:
    hod_x = WORKING / "Supporting data by HOD.xlsx"
    dist = UPLOAD / "100 FLEET(STOP TO STOP DISTANCE)_29.07.2026.xlsx"
    tickets = pd.read_csv(WORKING / "All_Tickets_Bhavnagar_May_2026.csv", low_memory=False)
    tickets["pax"] = (
        pd.to_numeric(tickets["Total Adult"], errors="coerce").fillna(0)
        + pd.to_numeric(tickets["Total Child"], errors="coerce").fillna(0)
    )
    tickets.loc[tickets["pax"] <= 0, "pax"] = 1

    names = sorted(
        set(tickets["Origin"].dropna().astype(str).str.strip())
        | set(tickets["Destination"].dropna().astype(str).str.strip())
    )
    print(f"unique stop names: {len(names)}")

    mapping = build_stop_name_map(names, hod_xlsx=hod_x, distance_xlsx=dist)
    mapping.to_csv(WORKING / "stop_name_to_matrix_abbr.csv", index=False)

    vol: dict[str, dict[str, float]] = {}
    for col in ["Origin", "Destination"]:
        g = tickets.groupby(tickets[col].astype(str).str.strip()).agg(
            tickets=("Ticket No", "count"), pax=("pax", "sum")
        )
        for n, r in g.iterrows():
            e = vol.setdefault(n, {"tickets": 0.0, "pax": 0.0})
            e["tickets"] += float(r["tickets"])
            e["pax"] += float(r["pax"])

    unres = mapping[mapping["matrix_abbr"].isna()].copy()
    unres["tickets_touch"] = unres["ticket_stop_name"].map(lambda x: vol.get(x, {}).get("tickets", 0))
    unres["pax_touch"] = unres["ticket_stop_name"].map(lambda x: vol.get(x, {}).get("pax", 0))
    unres = unres.sort_values("pax_touch", ascending=False)
    unres.to_csv(WORKING / "stop_mapping_unresolved.csv", index=False)

    mapped = mapping[mapping["matrix_abbr"].notna()]
    print(f"mapped names: {len(mapped)} / {len(mapping)} ({100 * len(mapped) / len(mapping):.1f}%)")
    print("by method:")
    print(mapping["match_method"].value_counts().to_string())

    name2abbr = dict(zip(mapping["ticket_stop_name"], mapping["matrix_abbr"]))
    tickets["o"] = tickets["Origin"].astype(str).str.strip().map(name2abbr)
    tickets["d"] = tickets["Destination"].astype(str).str.strip().map(name2abbr)
    both = tickets["o"].notna() & tickets["d"].notna()
    pax_both = tickets.loc[both, "pax"].sum()
    pax_all = tickets["pax"].sum()
    print(
        f"tickets both ends mapped: {int(both.sum())} / {len(tickets)} "
        f"({100 * both.mean():.1f}%)"
    )
    print(f"pax both ends mapped: {pax_both:.0f} / {pax_all:.0f} ({100 * pax_both / pax_all:.1f}%)")
    print("top unresolved:")
    print(unres[["ticket_stop_name", "pax_touch", "tickets_touch"]].head(30).to_string(index=False))


if __name__ == "__main__":
    main()
