"""One stop-sequence upload applies to every ticket date that lacks its own file."""
from __future__ import annotations

import pandas as pd

from etram.ingest.load import broadcast_stop_sequence_to_ticket_dates


def _seq(*dates: str, stop_abbr: str = "A") -> pd.DataFrame:
    rows = []
    for d in dates:
        rows.append(
            {
                "agency_id": "bhavnagar",
                "service_date": pd.Timestamp(d),
                "route_direction_key": "R1-up",
                "stop_no": 1,
                "stop_abbr": stop_abbr,
                "seq_index": 1,
            }
        )
    return pd.DataFrame(rows)


def test_single_file_covers_every_ticket_date() -> None:
    seq = _seq("2026-05-01")
    tickets = pd.DataFrame({"service_date": pd.to_datetime(["2026-05-01", "2026-05-15", "2026-05-31"])})
    out = broadcast_stop_sequence_to_ticket_dates(seq, tickets)
    got = set(pd.to_datetime(out["service_date"]).dt.normalize())
    assert got == {
        pd.Timestamp("2026-05-01"),
        pd.Timestamp("2026-05-15"),
        pd.Timestamp("2026-05-31"),
    }
    assert (out["stop_abbr"] == "A").all()


def test_existing_date_specific_rows_are_kept() -> None:
    seq = pd.concat([_seq("2026-05-01", stop_abbr="A"), _seq("2026-05-02", stop_abbr="B")], ignore_index=True)
    tickets = pd.DataFrame({"service_date": pd.to_datetime(["2026-05-01", "2026-05-02", "2026-05-03"])})
    out = broadcast_stop_sequence_to_ticket_dates(seq, tickets)
    by_date = {
        pd.Timestamp(d).normalize(): set(g["stop_abbr"])
        for d, g in out.groupby("service_date")
    }
    assert by_date[pd.Timestamp("2026-05-01")] == {"A"}
    assert by_date[pd.Timestamp("2026-05-02")] == {"B"}
    assert by_date[pd.Timestamp("2026-05-03")] == {"A"}


def test_dateless_sequence_is_stamped_onto_ticket_dates() -> None:
    seq = _seq("2026-05-01")
    seq["service_date"] = pd.NaT
    tickets = pd.DataFrame({"service_date": pd.to_datetime(["2026-05-10", "2026-05-11"])})
    out = broadcast_stop_sequence_to_ticket_dates(seq, tickets)
    got = set(pd.to_datetime(out["service_date"]).dt.normalize())
    assert got == {pd.Timestamp("2026-05-10"), pd.Timestamp("2026-05-11")}
    assert out["service_date"].notna().all()


def test_no_broadcast_when_every_ticket_date_already_present() -> None:
    seq = _seq("2026-05-01", "2026-05-02")
    tickets = pd.DataFrame({"service_date": pd.to_datetime(["2026-05-01", "2026-05-02"])})
    out = broadcast_stop_sequence_to_ticket_dates(seq, tickets)
    assert len(out) == len(seq)
