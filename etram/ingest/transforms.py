"""Column transforms shared by agency ingest."""
from __future__ import annotations

import re
from datetime import datetime, time, timedelta

import pandas as pd


def normalize_route_description(description: str | None) -> str:
    """Collapse ETM vs supporting-sheet wording so direction keys align."""
    if description is None or (isinstance(description, float) and pd.isna(description)):
        return ""
    s = str(description).lower().strip()
    s = re.sub(r"\([^)]*\)", "", s)
    s = s.replace(" to ", " ").replace("_to_", "_").replace("to_", "")
    # Strip Route/R number prefix while separators still exist (avoid eating stop names).
    s = re.sub(r"^(?:route|r)[_\s]*0*\d+\s*", "", s)
    s = re.sub(r"^[_\s]+", "", s)
    s = re.sub(r"\s+", " ", s)
    s = s.replace(" ", "").replace("adhewada", "adhevada")
    return s


def route_direction_key(route_code: str | None, route_description: str | None) -> str:
    code = "" if route_code is None else str(route_code).strip()
    desc = normalize_route_description(route_description)
    return f"{code}-{desc}" if desc else code


def _blank_to_na(s: pd.Series) -> pd.Series:
    if s.dtype == object or str(s.dtype) == "string":
        s = s.replace(r"^\s*$", pd.NA, regex=True)
        s = s.replace({"None": pd.NA, "nan": pd.NA, "NaT": pd.NA})
    return s


def coerce_time(series: pd.Series) -> pd.Series:
    """Normalize Excel time / datetime / blank / space to pandas Timestamp (time-of-day)."""
    s = _blank_to_na(series)

    def one(v):
        if v is None or (isinstance(v, float) and pd.isna(v)) or pd.isna(v):
            return pd.NaT
        if isinstance(v, str):
            v = v.strip()
            if v == "":
                return pd.NaT
            # try parse
            ts = pd.to_datetime(v, errors="coerce")
            return ts if not pd.isna(ts) else pd.NaT
        if isinstance(v, time):
            return pd.Timestamp.combine(datetime(1899, 12, 30).date(), v)
        if isinstance(v, datetime):
            return pd.Timestamp(v)
        if isinstance(v, pd.Timestamp):
            return v
        # Excel serial fraction of day
        try:
            fv = float(v)
            if 0 <= fv < 1.5:  # time fraction (allow small >1)
                secs = int(round((fv % 1) * 24 * 3600))
                h = secs // 3600
                m = (secs % 3600) // 60
                sec = secs % 60
                return pd.Timestamp(datetime(1899, 12, 30, h, m, sec))
        except Exception:
            pass
        ts = pd.to_datetime(v, errors="coerce")
        return ts if not pd.isna(ts) else pd.NaT

    out = s.map(one)
    return pd.to_datetime(out, errors="coerce")


def fill_down_trip_times(df: pd.DataFrame) -> pd.DataFrame:
    """Match PBIX Table.FillDown on Trip Start/End Time (file order)."""
    df = df.copy()
    for col in ("trip_start_time", "trip_end_time"):
        if col in df.columns:
            df[col] = coerce_time(df[col])
            df[col] = df[col].ffill()
    return df


def make_time_slots() -> pd.DataFrame:
    rows = []
    for i, mins in enumerate(range(0, 1410 + 1, 30), start=1):
        start = pd.Timedelta(minutes=mins)
        end = start + pd.Timedelta(minutes=30)

        def fmt(td: pd.Timedelta) -> str:
            total = int(td.total_seconds() // 60) % (24 * 60)
            h, m = divmod(total, 60)
            return f"{h:02d}:{m:02d}"

        start_s = fmt(start)
        end_s = fmt(end)
        rows.append(
            {
                "slot_index": i,
                "start_time": start_s,
                "end_time": end_s,
                "time_slot_label": f"{start_s} - {end_s}",
            }
        )
    return pd.DataFrame(rows)
