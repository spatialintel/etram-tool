"""Compile and clean uploaded ETM extracts into the canonical ingest schema.

Handles:
- one or many Conductor Report CSVs (May-style)
- April-style Excel / CSV already in mapping columns
- route-number fill, dedupe, optional Stage Km from a distance workbook
"""
from __future__ import annotations

from pathlib import Path
from typing import Callable

import pandas as pd

from etram.ingest.route_map import annotate_route_columns, is_blank_route
from etram.ingest.stage_km import load_od_distances, stage_km_for_pair
from etram.ingest.stop_map import build_stop_name_map

LogFn = Callable[[str], None]

CONDUCTOR_MARKERS = {
    "Pass Origin",
    "Pass Destination",
    "Route Description",
    "Ticket Number",
    "No. of Pass",
}
APRIL_MARKERS = {
    "Pass. Origin",
    "Pass. Destination",
    "Route No.",
    "Ticket No.",
    "Stage Km",
}

DEDUPE_CONDUCTOR = [
    "Date",
    "Ticket Number",
    "Bus Number",
    "Trip Number",
    "Ticket Issue Time",
    "Pass Origin",
    "Pass Destination",
    "Revenue",
]


def _log(log: LogFn | None, msg: str) -> None:
    if log:
        log(msg)


def _read_any(path: Path) -> pd.DataFrame:
    if path.suffix.lower() == ".csv":
        return pd.read_csv(path, low_memory=False)
    return pd.read_excel(path)


def detect_schema(columns: list[str]) -> str:
    cols = set(columns)
    if len(CONDUCTOR_MARKERS & cols) >= 4:
        return "conductor"
    if len(APRIL_MARKERS & cols) >= 4:
        return "april"
    return "unknown"


def _trip_no_int(series: pd.Series) -> pd.Series:
    codes, _ = pd.factorize(series.astype(str), sort=False)
    return pd.Series(codes + 1, index=series.index, dtype="int64")


def conductor_to_april_schema(
    raw: pd.DataFrame,
    *,
    supporting_path: Path,
    distance_path: Path | None,
    log: LogFn | None = None,
) -> pd.DataFrame:
    """Convert Conductor Report rows to April ingest column names."""
    df = raw.copy()
    if "Route Description" not in df.columns:
        raise ValueError("Conductor Report missing Route Description")

    # Always fill blank Route Numbers from description; never overwrite existing codes.
    before_blank = (
        int(is_blank_route(df["Route Number"]).sum())
        if "Route Number" in df.columns
        else len(df)
    )
    df = annotate_route_columns(df, description_col="Route Description", only_blank=True)
    filled = int(df.attrs.get("route_numbers_filled", 0))
    after_blank = int(is_blank_route(df["Route Number"]).sum())
    _log(
        log,
        f"Route Number fill: {before_blank} blank → filled {filled}; "
        f"{after_blank} still blank after parse",
    )

    names = sorted(
        set(df["Pass Origin"].dropna().astype(str).str.strip())
        | set(df["Pass Destination"].dropna().astype(str).str.strip())
    )
    # Prefer a distance workbook for abbr validity when present; else supporting only.
    distance_for_map = distance_path if distance_path and distance_path.exists() else supporting_path
    # build_stop_name_map requires a distance xlsx with OD sheets; if only supporting
    # is available, still map via HOD-like StopsList aliases without matrix filter.
    if distance_path and distance_path.exists():
        mapping = build_stop_name_map(
            names, hod_xlsx=supporting_path, distance_xlsx=distance_path
        )
        name2abbr = {
            str(r["ticket_stop_name"]): r["matrix_abbr"]
            for _, r in mapping.iterrows()
            if pd.notna(r.get("matrix_abbr"))
        }
        _log(log, f"Stop map: {len(name2abbr)}/{len(names)} names to matrix abbrs")
        od = load_od_distances(distance_path)
        _log(log, f"Loaded {len(od)} OD distance pairs")
    else:
        # Map using supporting StopsList names → Final_Abbr without matrix gate.
        from etram.ingest.stop_map import load_hod_stops, normalize_stop_name

        hod = load_hod_stops(supporting_path)
        by_norm = {r["name_n"]: r["abbr"] for _, r in hod.iterrows() if r["name_n"]}
        name2abbr = {}
        for n in names:
            key = normalize_stop_name(n)
            if key in by_norm:
                name2abbr[n] = by_norm[key]
        od = {}
        _log(
            log,
            f"No distance workbook: mapped {len(name2abbr)}/{len(names)} stops by name; Stage Km skipped",
        )

    o_abbr = df["Pass Origin"].astype(str).str.strip().map(name2abbr)
    d_abbr = df["Pass Destination"].astype(str).str.strip().map(name2abbr)
    if od:
        stage = [
            stage_km_for_pair(o, d, od) for o, d in zip(o_abbr.tolist(), d_abbr.tolist())
        ]
        stage_s = pd.Series(stage, index=df.index, dtype="float64")
        _log(log, f"Stage Km coverage: {100 * stage_s.notna().mean():.1f}%")
    else:
        stage_s = pd.Series([pd.NA] * len(df), index=df.index, dtype="Float64")

    trip_src = df["Trip Number"] if "Trip Number" in df.columns else df.get("Conductor Trip Number")
    trip_no = _trip_no_int(trip_src) if trip_src is not None else pd.Series(range(1, len(df) + 1))

    route_no = df["Route Number"].astype("string").str.strip()
    out = pd.DataFrame(
        {
            "Date": pd.to_datetime(df["Date"], errors="coerce").dt.strftime("%Y-%m-%d"),
            "Ticket No.": df["Ticket Number"],
            "Route No.": route_no,
            "Route description": df["Route Description"],
            "Depot": "Depot",
            "Vehicle/ Schedule no.": df["Bus Number"],
            "Driver ID": pd.NA,
            "Conductor ID": df["Conductor Name"] if "Conductor Name" in df.columns else pd.NA,
            "Trip No.": trip_no,
            "Trip Start Time": df.get("Trip Start Time"),
            "Trip End Time": df.get("Trip End Time"),
            "Ticket Issue Time": df.get("Ticket Issue Time"),
            "No. of pass.": pd.to_numeric(df.get("No. of Pass"), errors="coerce").fillna(0).astype(int),
            "No. of child Pass.": pd.to_numeric(df.get("No. of Child Pass"), errors="coerce")
            .fillna(0)
            .astype(int),
            "Pass. Category": df.get("Pass Category"),
            "Origin Stop No.": pd.NA,
            "Destination Stop No.": pd.NA,
            "Pass. Origin": o_abbr,
            "Pass. Destination": d_abbr,
            "Stage Km": stage_s,
            "Revenue": pd.to_numeric(df.get("Revenue"), errors="coerce"),
            "Gender": df["Gender"] if "Gender" in df.columns else pd.NA,
        }
    )
    n_before_route_filter = len(out)
    route_ok = ~is_blank_route(out["Route No."])
    dropped_no_route = int((~route_ok).sum())
    out = out[out["Date"].notna() & route_ok]
    if dropped_no_route:
        _log(
            log,
            f"Dropped {dropped_no_route}/{n_before_route_filter} rows with blank Route No. "
            "after fill (unparseable Route Description)",
        )
    return out.reset_index(drop=True)


def prepare_etm_for_ingest(
    etm_paths: list[Path],
    *,
    supporting_path: Path,
    out_csv: Path,
    distance_path: Path | None = None,
    log: LogFn | None = None,
) -> Path:
    """Combine uploads → clean → write April-schema CSV for ``load_tickets``."""
    if not etm_paths:
        raise ValueError("No ETM files provided")

    frames: list[pd.DataFrame] = []
    schemas: list[str] = []
    for p in etm_paths:
        _log(log, f"Reading {p.name}")
        part = _read_any(p)
        schema = detect_schema(list(part.columns))
        schemas.append(schema)
        part["_source_file"] = p.name
        frames.append(part)
        _log(log, f"  schema={schema} rows={len(part)}")

    if any(s == "unknown" for s in schemas):
        bad = [p.name for p, s in zip(etm_paths, schemas) if s == "unknown"]
        raise ValueError(f"Unrecognized ETM schema in: {', '.join(bad)}")
    if len(set(schemas)) > 1:
        raise ValueError(f"Mixed ETM schemas in one job: {schemas}")

    schema = schemas[0]
    combined = pd.concat(frames, ignore_index=True)
    _log(log, f"Combined rows: {len(combined)}")

    if schema == "conductor":
        keys = [c for c in DEDUPE_CONDUCTOR if c in combined.columns]
        before = len(combined)
        if keys:
            combined = combined.drop_duplicates(subset=keys, keep="first")
            _log(log, f"Deduped {before - len(combined)} rows on {keys}")
        april = conductor_to_april_schema(
            combined,
            supporting_path=supporting_path,
            distance_path=distance_path,
            log=log,
        )
    else:
        # Already April-like; light cleanup
        april = combined.copy()
        if "Date" in april.columns:
            april["Date"] = pd.to_datetime(april["Date"], errors="coerce").dt.strftime("%Y-%m-%d")
        before = len(april)
        dedupe_cols = [c for c in ["Date", "Ticket No.", "Vehicle/ Schedule no.", "Trip No."] if c in april.columns]
        if dedupe_cols:
            april = april.drop_duplicates(subset=dedupe_cols, keep="first")
            _log(log, f"Deduped {before - len(april)} April-schema rows")

    out_csv.parent.mkdir(parents=True, exist_ok=True)
    april.to_csv(out_csv, index=False)
    _log(log, f"Wrote ingest CSV ({len(april)} rows) -> {out_csv.name}")
    return out_csv
