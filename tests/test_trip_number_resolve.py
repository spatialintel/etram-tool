"""Tests for trip-number resolution (no silent merge of unrelated trips)."""
from __future__ import annotations

import pandas as pd

from etram.ingest.upload_prepare import resolve_trip_numbers


def test_keeps_numeric_trip_numbers():
    df = pd.DataFrame(
        {
            "Date": ["2026-05-01", "2026-05-01"],
            "Bus Number": ["B1", "B1"],
            "Route Number": ["R1", "R1"],
            "Trip Number": [1, 2],
            "Trip Start Time": [None, None],
        }
    )
    out = resolve_trip_numbers(df)
    assert list(out) == [1, 2]


def test_blanks_same_bus_separated_by_start_time():
    df = pd.DataFrame(
        {
            "Date": ["2026-05-01"] * 4,
            "Bus Number": ["B1"] * 4,
            "Route Number": ["R1"] * 4,
            "Trip Number": [None, None, None, None],
            "Trip Start Time": [
                "2026-05-01 08:00:00",
                "2026-05-01 08:00:00",
                "2026-05-01 10:00:00",
                "2026-05-01 10:00:00",
            ],
        }
    )
    out = resolve_trip_numbers(df)
    assert out.iloc[0] == out.iloc[1]
    assert out.iloc[2] == out.iloc[3]
    assert out.iloc[0] != out.iloc[2]


def test_blanks_different_buses_do_not_share_id():
    df = pd.DataFrame(
        {
            "Date": ["2026-05-01", "2026-05-01"],
            "Bus Number": ["B1", "B2"],
            "Route Number": ["R1", "R1"],
            "Trip Number": [None, None],
            "Trip Start Time": [None, None],
            "Ticket Issue Time": [None, None],
        }
    )
    out = resolve_trip_numbers(df)
    assert out.iloc[0] != out.iloc[1]


def test_blank_nan_string_not_one_global_id():
    """Old bug: astype(str) made every NaN the label 'nan' → one factorize code."""
    df = pd.DataFrame(
        {
            "Date": ["2026-05-01", "2026-05-02"],
            "Bus Number": ["B1", "B1"],
            "Route Number": ["R1", "R1"],
            "Trip Number": [float("nan"), float("nan")],
            "Trip Start Time": [None, None],
        }
    )
    out = resolve_trip_numbers(df)
    # Different dates → different synthetic trips even with no times.
    assert out.iloc[0] != out.iloc[1]


def test_issue_time_used_when_start_missing():
    df = pd.DataFrame(
        {
            "Date": ["2026-05-01", "2026-05-01"],
            "Bus Number": ["B1", "B1"],
            "Route Number": ["R1", "R1"],
            "Trip Number": [None, None],
            "Ticket Issue Time": ["09:00:00", "11:00:00"],
        }
    )
    out = resolve_trip_numbers(df)
    assert out.iloc[0] != out.iloc[1]
