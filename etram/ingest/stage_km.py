"""Attach Stage Km from stop-to-stop distance workbook."""
from __future__ import annotations

import re
from pathlib import Path

import pandas as pd


def load_od_distances(distance_xlsx: Path) -> dict[tuple[str, str], float]:
    """Load undirected OD distances as {(A, B): km} with both orientations."""
    od: dict[tuple[str, str], float] = {}
    for sheet in pd.ExcelFile(distance_xlsx).sheet_names:
        df = pd.read_excel(distance_xlsx, sheet_name=sheet)
        if df.shape[1] < 2:
            continue
        col0 = df.columns[0]
        dist_col = None
        for c in df.columns[1:]:
            cname = str(c).lower()
            if "dist" in cname or "km" in cname or pd.api.types.is_numeric_dtype(df[c]):
                dist_col = c
                break
        if dist_col is None:
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
            d = float(d)
            od[(a, b)] = d
            od.setdefault((b, a), d)
    return od


def stage_km_for_pair(
    origin_abbr: object,
    dest_abbr: object,
    od: dict[tuple[str, str], float],
) -> float | None:
    if origin_abbr is None or dest_abbr is None or (isinstance(origin_abbr, float) and pd.isna(origin_abbr)):
        return None
    if isinstance(dest_abbr, float) and pd.isna(dest_abbr):
        return None
    a = str(origin_abbr).strip().upper()
    b = str(dest_abbr).strip().upper()
    if not a or not b or a in ("NAN", "NONE") or b in ("NAN", "NONE"):
        return None
    if a == b:
        return 0.0
    return od.get((a, b))
