# Phase 0 — Data quality contract

Every Excel load must emit a DQ report. Metrics and UI **consume** DQ status; they do not invent missing fields.

*Last synced to code: `etram/ingest/dq.py` + `etram/ingest/load.py`. If you add or change a rule in either file, update this doc in the same change — this table is read as ground truth by anyone auditing the pipeline without opening the code.*

## Severity levels

| Level | Meaning | Product behavior |
|-------|---------|------------------|
| BLOCK | Load rejected | User must fix file |
| WARN | Load accepted | Feature/page degraded or rows flagged for review; nothing is dropped or fabricated |
| INFO | Noted | Dashboard badge only |

## Rules (Bhavnagar baseline)

`required_columns_present` is checked in **`etram/ingest/load.py`**, before any of the other rules run — if a sheet is missing a mapped column, the table can't be built at all, so none of the row-level checks below are reachable for that load. Every other rule is checked in **`etram/ingest/dq.py`** by `build_dq_report()`, which assumes all five tables loaded successfully.

### tickets — structural

| id | Level | Condition |
|------|-------|-----------|
| `required_columns_present` | BLOCK | one rule per sheet with a missing mapped column; `load.py` tries all 5 sheets independently first, so every failing sheet is reported in the same load instead of one at a time |
| `row_count` | BLOCK if 0, else INFO | row count |
| `service_date_null_pct` | BLOCK if any null, else INFO | fraction of rows with a null Date |
| `route_code_null_pct` | BLOCK if any null, else INFO | fraction of rows with a null Route No. |

### tickets — coverage

| id | Level | Condition |
|------|-------|-----------|
| `gender_coverage` | WARN | fraction non-null Gender; Bhavnagar known ~0% |
| `driver_id_coverage` | WARN | fraction non-null Driver ID; Bhavnagar known ~0% |
| `conductor_id_coverage` | INFO | fraction non-null |
| `ticket_id_null_pct` | WARN | fraction with a null Ticket No. |
| `stage_km_null_pct` | WARN | fraction with a null stage_km (numeric coercion failed, or source cell blank); pax_km is null for these rows |
| `revenue_null_pct` | WARN | fraction with a null revenue (numeric coercion failed, or source cell blank) |

### tickets — cross-table matching

| id | Level | Condition |
|------|-------|-----------|
| `vehicle_id_not_in_vehicles` | WARN | count of tickets whose vehicle isn't in the vehicles table |
| `origin_abbr_not_in_stops` | WARN | count of tickets whose Pass. Origin isn't in the stops table |
| `destination_abbr_not_in_stops` | WARN | count of tickets whose Pass. Destination isn't in the stops table |

### tickets — outlier / internal-consistency checks

None of these fabricate or drop data — metrics still sum every row; these only surface a count for review.

| id | Level | Condition |
|------|-------|-----------|
| `negative_revenue` | WARN | revenue < 0 (fare can't be negative). Deliberately **not** flagging revenue == 0 — that's a legitimate bus-pass fare |
| `negative_stage_km` | WARN | stage_km < 0 (distance can't be negative) |
| `zero_passenger_positive_revenue` | WARN | revenue > 0 recorded with 0 passengers on the ticket |
| `stage_km_exceeds_route_length` | WARN | a ticket's stage_km exceeds the full length of the route it's on (joined via `route_direction_key`, falling back to the route-code average — same fallback `trip_summary.py` uses), with `stage_km_tolerance` (default 5%) slack for measured-vs-mapped rounding drift. A leg can't be longer than the whole route |
| `duplicate_ticket_per_vehicle_day` | WARN | same ticket_id issued more than once on the same vehicle on the same day. Checked *after* `upload_prepare`'s exact Date+Ticket+Vehicle+Trip dedup, so a hit here is a genuinely different trip reusing the number, not a re-upload duplicate |

### stops / routes / vehicles

| id | Table | Level | Condition |
|------|-------|-------|-----------|
| `row_count` | stops / routes / vehicles | INFO | row count |
| `missing_latlon` | stops | WARN | count of null latitude/longitude cells — disables map markers for those stops |
| `route_length_le_0` | routes | WARN | route_length_km ≤ 0 — LF/EPKM undefined for that route |
| `capacity_le_0` | vehicles | WARN | capacity ≤ 0 — capacity_km/LF undefined for those trips |

### stop_sequence

| id | Level | Condition |
|------|-------|-----------|
| `row_count` | INFO | row count |
| `stop_abbr_not_in_stops` | WARN | count of stop_sequence rows whose stop_abbr isn't in the stops table |
| `duplicate_stop_no` | WARN | count of rows where two stops in the same route-date-direction sequence claim the same stop_no. **Replaces** the previously-documented "stop_no monotonic per route-date": `load_stop_sequence()` sorts by stop_no before assigning `seq_index`, so a monotonic check on the loaded table is tautological (always 0, false assurance). Duplicate stop_no is the real signal still visible after that sort |
| `ticket_dates_missing_sequence` | WARN | list of ticket service_dates with no matching stop_sequence upload — BA pattern incomplete for those dates |

### Known gaps — documented, not yet implemented

| id | Level | Why it's not in code yet |
|------|-------|---------------------------|
| `trip_times_fillable` | WARN | Trip Start/End blank and un-fillable by fill-down. `transforms.py` performs the fill-down but doesn't currently count rows where it fails; would need a companion counter threaded through from `transforms.py` into `dq.py`. Not implemented as of this sync — tracked here rather than silently dropped from the contract |

## Feature gates (UI)

| Feature / page | Requires |
|----------------|----------|
| Gender Classification | `gender_coverage` ≥ `gender_threshold` (default 50%) else hide chart |
| Driver-Speed Analysis | `driver_id_coverage` ≥ `driver_threshold` (default 50%) else page disabled with message |
| Conductor-Revenue Analysis | `conductor_id_coverage` > 0 |
| BA stop maps | stops.latitude/longitude present on at least one stop |
| LF / EPKM | capacity > 0 and route_length > 0 (checked per-row downstream in metrics, not gated here) |

Bhavnagar **expected at Phase 1**: Gender and Driver pages gated OFF based on current input files.

## Load report schema (JSON)

Two possible shapes, same top-level keys either way — a consumer reads `load_ok` and `rules` the same way regardless of which path produced the file:

**Success** (`build_dq_report()` in `dq.py`) — `tables` has one entry per table actually loaded (in practice: agencies, stops, routes, vehicles, tickets, stop_sequence, time_slots):

```json
{
  "agency_id": "bhavnagar",
  "loaded_at": "...",
  "tables": {
    "tickets": {"rows": 280375}
  },
  "rules": [
    {"table": "tickets", "id": "gender_coverage", "level": "WARN", "value": 0.0, "message": ""}
  ],
  "feature_gates": {
    "gender_charts": false,
    "driver_speed": false,
    "conductor_revenue": true,
    "ba_maps": true
  },
  "load_ok": true
}
```

**Rejected** (`_required_columns_report()` in `load.py`) — one `required_columns_present` rule per sheet that failed; `tables` shows `null` rows for sheets that never loaded, real row counts for any that did:

```json
{
  "agency_id": "bhavnagar",
  "loaded_at": "...",
  "tables": {
    "stops": {"rows": null},
    "routes": {"rows": 42},
    "vehicles": {"rows": 18},
    "tickets": {"rows": null},
    "stop_sequence": {"rows": 310}
  },
  "rules": [
    {"table": "stops", "id": "required_columns_present", "level": "BLOCK", "value": ["Latitude"], "message": "Missing source columns: ['Latitude']. Have: [...]"},
    {"table": "tickets", "id": "required_columns_present", "level": "BLOCK", "value": ["Trip Start Time"], "message": "Missing source columns: ['Trip Start Time']. Have: [...]"}
  ],
  "feature_gates": {"gender_charts": false, "driver_speed": false, "conductor_revenue": false, "ba_maps": false},
  "load_ok": false
}
```

Path: `data/canonical/{agency_id}/dq_report.json` — written on both success and rejection.

## Test coverage

`tests/test_dq_rules.py` covers every rule above except `trip_times_fillable` (not implemented). Extend that file, not a new one, when adding a rule.
