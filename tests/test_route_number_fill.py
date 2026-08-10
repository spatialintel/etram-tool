"""Tests for Route Number fill-from-description (blank-only)."""
from __future__ import annotations

import pandas as pd

from etram.ingest.route_map import annotate_route_columns, is_blank_route


def test_annotate_fills_blanks_without_overwriting_existing():
    df = pd.DataFrame(
        {
            "Route Number": ["R1", None, "", "nan"],
            "Route Description": [
                "Route 99_ShouldNotOverwrite_X",
                "Route 02_Gangajaliya_Top 3",
                "Route_04 (E) Adhevada_Gangajaliya",
                "R_006_Avaniya Gam_TO_Gangajaliya",
            ],
        }
    )
    out = annotate_route_columns(df, only_blank=True)
    assert list(out["Route Number"]) == ["R1", "R2", "R4E", "R6"]
    assert out.attrs["route_numbers_filled"] == 3


def test_annotate_creates_column_when_missing():
    df = pd.DataFrame(
        {"Route Description": ["Route 01_A_B", "unparseable junk"]}
    )
    out = annotate_route_columns(df, only_blank=True)
    assert out["Route Number"].iloc[0] == "R1"
    assert pd.isna(out["Route Number"].iloc[1])
    assert is_blank_route(out["Route Number"]).sum() == 1


def test_annotate_only_blank_false_overwrites():
    df = pd.DataFrame(
        {
            "Route Number": ["R1"],
            "Route Description": ["Route 08_A_B"],
        }
    )
    out = annotate_route_columns(df, only_blank=False)
    assert out["Route Number"].iloc[0] == "R8"
