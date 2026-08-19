"""Regression coverage for etram.ingest.dq (rule values) and the
etram.ingest.load required-columns failure path.

Neither had test coverage before this file. `_clean_tables()` is a baseline
with zero anomalies on any rule — every test below copies it and mutates
exactly the field(s) relevant to the rule under test, so a failure always
points at one specific rule.
"""
from __future__ import annotations

import json

import pandas as pd
import pytest
import yaml

from etram.ingest.dq import build_dq_report
from etram.ingest.load import MissingColumnsError, _rename, _required_columns_report, run_ingest


def _clean_tables() -> dict[str, pd.DataFrame]:
    tickets = pd.DataFrame(
        {
            "agency_id": ["bhavnagar"] * 3,
            "service_date": pd.to_datetime(["2026-04-01"] * 3),
            "route_code": ["R1"] * 3,
            "route_direction_key": ["R1-up"] * 3,
            "ticket_id": ["T1", "T2", "T3"],
            "vehicle_id": ["V1", "V1", "V1"],
            "gender": ["M", "F", "M"],
            "driver_id": ["D1", "D1", "D1"],
            "conductor_id": ["C1", "C1", "C1"],
            "origin_abbr": ["A", "A", "A"],
            "destination_abbr": ["B", "B", "B"],
            "stage_km": [2.0, 3.0, 2.5],
            "revenue": [10.0, 15.0, 12.0],
            "total_passengers": [2, 3, 2],
        }
    )
    stops = pd.DataFrame({"stop_abbr": ["A", "B"], "latitude": [21.0, 21.1], "longitude": [72.0, 72.1]})
    routes = pd.DataFrame({"route_code": ["R1"], "route_direction_key": ["R1-up"], "route_length_km": [7.0]})
    vehicles = pd.DataFrame({"vehicle_id": ["V1"], "capacity": [40]})
    stop_sequence = pd.DataFrame(
        {
            "service_date": pd.to_datetime(["2026-04-01", "2026-04-01"]),
            "route_code": ["R1", "R1"],
            "route_description": ["up", "up"],
            "stop_abbr": ["A", "B"],
            "stop_no": [1, 2],
        }
    )
    return {"tickets": tickets, "stops": stops, "routes": routes, "vehicles": vehicles, "stop_sequence": stop_sequence}


def _rule(report: dict, table: str, rule_id: str) -> dict:
    for r in report["rules"]:
        if r["table"] == table and r["id"] == rule_id:
            return r
    raise AssertionError(f"rule {table}.{rule_id} not found in report")


# --- Baseline sanity -------------------------------------------------------


def test_clean_baseline_has_zero_on_every_new_rule_and_load_ok_true():
    report = build_dq_report("bhavnagar", _clean_tables())
    assert report["load_ok"] is True
    new_rule_ids = [
        ("tickets", "ticket_id_null_pct"),
        ("tickets", "stage_km_null_pct"),
        ("tickets", "revenue_null_pct"),
        ("tickets", "negative_revenue"),
        ("tickets", "negative_stage_km"),
        ("tickets", "zero_passenger_positive_revenue"),
        ("tickets", "stage_km_exceeds_route_length"),
        ("tickets", "duplicate_ticket_per_vehicle_day"),
        ("stop_sequence", "stop_abbr_not_in_stops"),
        ("stop_sequence", "duplicate_stop_no"),
    ]
    for table, rule_id in new_rule_ids:
        assert _rule(report, table, rule_id)["value"] == 0, f"{table}.{rule_id} should be 0 on a clean baseline"


# --- New rules: missing/null coverage --------------------------------------


def test_ticket_id_null_pct():
    tables = _clean_tables()
    tables["tickets"].loc[0, "ticket_id"] = None
    report = build_dq_report("bhavnagar", tables)
    assert _rule(report, "tickets", "ticket_id_null_pct")["value"] == pytest.approx(1 / 3, abs=1e-4)


def test_stage_km_null_pct():
    tables = _clean_tables()
    tables["tickets"].loc[0, "stage_km"] = None
    report = build_dq_report("bhavnagar", tables)
    assert _rule(report, "tickets", "stage_km_null_pct")["value"] == pytest.approx(1 / 3, abs=1e-4)


def test_revenue_null_pct():
    tables = _clean_tables()
    tables["tickets"].loc[0, "revenue"] = None
    report = build_dq_report("bhavnagar", tables)
    assert _rule(report, "tickets", "revenue_null_pct")["value"] == pytest.approx(1 / 3, abs=1e-4)


# --- New rules: outliers ----------------------------------------------------


def test_negative_revenue_counted_but_zero_revenue_is_not():
    tables = _clean_tables()
    tables["tickets"].loc[0, "revenue"] = -5.0
    tables["tickets"].loc[1, "revenue"] = 0.0  # legitimate: pass-holder, must NOT be flagged
    report = build_dq_report("bhavnagar", tables)
    assert _rule(report, "tickets", "negative_revenue")["value"] == 1


def test_negative_stage_km():
    tables = _clean_tables()
    tables["tickets"].loc[0, "stage_km"] = -1.0
    report = build_dq_report("bhavnagar", tables)
    assert _rule(report, "tickets", "negative_stage_km")["value"] == 1


def test_zero_passenger_positive_revenue():
    tables = _clean_tables()
    tables["tickets"].loc[0, "total_passengers"] = 0
    tables["tickets"].loc[0, "revenue"] = 10.0  # revenue > 0 with 0 passengers -> flagged
    tables["tickets"].loc[1, "total_passengers"] = 0
    tables["tickets"].loc[1, "revenue"] = 0.0  # 0 passengers, 0 revenue -> NOT flagged
    report = build_dq_report("bhavnagar", tables)
    assert _rule(report, "tickets", "zero_passenger_positive_revenue")["value"] == 1


def test_stage_km_exceeds_route_length_respects_tolerance():
    tables = _clean_tables()  # route_length_km = 7.0, default tolerance = 1.05 -> threshold 7.35
    tables["tickets"].loc[0, "stage_km"] = 7.3  # within tolerance -> not flagged
    tables["tickets"].loc[1, "stage_km"] = 8.0  # clearly over -> flagged
    report = build_dq_report("bhavnagar", tables)
    assert _rule(report, "tickets", "stage_km_exceeds_route_length")["value"] == 1


def test_stage_km_tolerance_is_configurable():
    tables = _clean_tables()
    tables["tickets"].loc[0, "stage_km"] = 7.3
    report = build_dq_report("bhavnagar", tables, stage_km_tolerance=1.0)
    # with zero tolerance, the same 7.3 km on a 7.0 km route now counts
    assert _rule(report, "tickets", "stage_km_exceeds_route_length")["value"] == 1


def test_duplicate_ticket_per_vehicle_day():
    tables = _clean_tables()
    tables["tickets"].loc[1, "ticket_id"] = "T1"  # same ticket_id as row 0, same vehicle/day
    report = build_dq_report("bhavnagar", tables)
    assert _rule(report, "tickets", "duplicate_ticket_per_vehicle_day")["value"] == 2  # both rows counted


def test_duplicate_ticket_different_vehicle_is_not_flagged():
    tables = _clean_tables()
    tables["tickets"].loc[1, "ticket_id"] = "T1"
    tables["tickets"].loc[1, "vehicle_id"] = "V2"  # different bus -> legitimate, not a duplicate
    report = build_dq_report("bhavnagar", tables)
    assert _rule(report, "tickets", "duplicate_ticket_per_vehicle_day")["value"] == 0


def test_stop_abbr_not_in_stops():
    tables = _clean_tables()
    tables["stop_sequence"].loc[0, "stop_abbr"] = "Z"  # not in the stops table
    report = build_dq_report("bhavnagar", tables)
    assert _rule(report, "stop_sequence", "stop_abbr_not_in_stops")["value"] == 1


def test_duplicate_stop_no():
    tables = _clean_tables()
    tables["stop_sequence"].loc[1, "stop_no"] = 1  # collides with row 0's stop_no in the same sequence
    report = build_dq_report("bhavnagar", tables)
    assert _rule(report, "stop_sequence", "duplicate_stop_no")["value"] == 2  # both rows counted


# --- Pre-existing rules (undocumented before this file; locking in now) ----


def test_row_count_blocks_on_empty_tickets():
    tables = _clean_tables()
    tables["tickets"] = tables["tickets"].iloc[0:0]
    report = build_dq_report("bhavnagar", tables)
    row_count = _rule(report, "tickets", "row_count")
    assert row_count["level"] == "BLOCK"
    assert report["load_ok"] is False


def test_service_date_null_blocks():
    tables = _clean_tables()
    tables["tickets"].loc[0, "service_date"] = pd.NaT
    report = build_dq_report("bhavnagar", tables)
    assert _rule(report, "tickets", "service_date_null_pct")["level"] == "BLOCK"
    assert report["load_ok"] is False


def test_vehicle_id_not_in_vehicles():
    tables = _clean_tables()
    tables["tickets"].loc[0, "vehicle_id"] = "V9"
    report = build_dq_report("bhavnagar", tables)
    assert _rule(report, "tickets", "vehicle_id_not_in_vehicles")["value"] == 1


def test_gender_feature_gate_threshold():
    tables = _clean_tables()  # 3/3 gender present -> gate on at default 0.5 threshold
    report = build_dq_report("bhavnagar", tables)
    assert report["feature_gates"]["gender_charts"] is True
    report_strict = build_dq_report("bhavnagar", tables, gender_threshold=1.1)
    assert report_strict["feature_gates"]["gender_charts"] is False


def test_child_share_and_pass_mix_gates():
    tables = _clean_tables()
    report = build_dq_report("bhavnagar", tables)
    assert report["feature_gates"]["child_share"] is False
    assert report["feature_gates"]["pass_mix"] is False

    tables["tickets"]["child_passengers"] = [0, 0, 2]
    tables["tickets"]["pass_category"] = ["General", "Pass", None]
    report2 = build_dq_report("bhavnagar", tables)
    assert report2["feature_gates"]["child_share"] is True
    assert report2["feature_gates"]["pass_mix"] is True


# --- load.py: required-columns failure path ---------------------------------


def test_rename_succeeds_when_columns_present():
    df = pd.DataFrame({"Stop Code": ["A", "B"], "Stop Name": ["Alpha", "Beta"]})
    out = _rename(df, {"Stop Code": "stop_abbr", "Stop Name": "stop_name"})
    assert list(out.columns) == ["stop_abbr", "stop_name"]
    assert out["stop_abbr"].tolist() == ["A", "B"]


def test_rename_raises_missing_columns_error_with_details():
    df = pd.DataFrame({"Stop Code": ["A"], "Stop Name": ["Alpha"]})
    with pytest.raises(MissingColumnsError) as exc:
        _rename(df, {"Stop Code": "stop_abbr", "Latitude": "latitude"})
    assert exc.value.missing == ["Latitude"]
    assert exc.value.have == ["Stop Code", "Stop Name"]
    assert isinstance(exc.value, KeyError)  # anything catching KeyError still works


def test_required_columns_report_schema_matches_build_dq_report():
    loaded = {"stops": pd.DataFrame({"x": [1, 2, 3]})}
    failures = [{"table": "tickets", "missing": ["Trip Start Time"], "have": ["Date", "Route No."]}]
    degraded = _required_columns_report("bhavnagar", loaded, failures)
    clean = build_dq_report("bhavnagar", _clean_tables())
    assert set(degraded.keys()) == set(clean.keys())
    assert degraded["load_ok"] is False
    assert degraded["tables"]["stops"] == {"rows": 3}
    assert degraded["tables"]["tickets"] == {"rows": None}
    rule = degraded["rules"][0]
    assert rule["level"] == "BLOCK"
    assert rule["id"] == "required_columns_present"
    assert "Trip Start Time" in rule["message"]


def test_run_ingest_reports_every_failing_sheet_in_one_pass(tmp_path, monkeypatch):
    mapping_path = tmp_path / "mapping.yaml"
    mapping_path.write_text(yaml.safe_dump({"agency_id": "test_agency"}), encoding="utf-8")

    def fake_stops(cfg, root):
        raise MissingColumnsError(["Latitude"], ["Stop Code", "Stop Name"])

    def fake_tickets(cfg, root):
        raise MissingColumnsError(["Trip Start Time"], ["Date", "Route No."])

    monkeypatch.setattr("etram.ingest.load.load_stops", fake_stops)
    monkeypatch.setattr("etram.ingest.load.load_tickets", fake_tickets)
    monkeypatch.setattr("etram.ingest.load.load_routes", lambda cfg, root: pd.DataFrame({"route_code": ["R1"]}))
    monkeypatch.setattr("etram.ingest.load.load_vehicles", lambda cfg, root: pd.DataFrame({"vehicle_id": ["V1"]}))
    monkeypatch.setattr("etram.ingest.load.load_stop_sequence", lambda cfg, root: pd.DataFrame({"stop_no": [1]}))

    report = run_ingest(mapping_path, root=tmp_path)

    assert report["load_ok"] is False
    failed_tables = {r["table"] for r in report["rules"]}
    assert failed_tables == {"stops", "tickets"}
    assert report["tables"]["routes"] == {"rows": 1}  # this one loaded fine
    assert report["tables"]["stops"] == {"rows": None}

    dq_path = tmp_path / "data" / "canonical" / "test_agency" / "dq_report.json"
    assert dq_path.exists()
    assert json.loads(dq_path.read_text()) == report

    canon_dir = tmp_path / "data" / "canonical" / "test_agency"
    assert list(canon_dir.glob("*.parquet")) == []  # rejected load must not write partial parquet
