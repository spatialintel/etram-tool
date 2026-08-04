# Phase 0 — Data quality contract

Every Excel load must emit a DQ report. Metrics and UI **consume** DQ status; they do not invent missing fields.

## Severity levels

| Level | Meaning | Product behavior |
|-------|---------|------------------|
| BLOCK | Load rejected | User must fix file |
| WARN | Load accepted | Feature/page degraded or hidden |
| INFO | Noted | Dashboard badge only |

## Rules (Bhavnagar baseline)

### tickets
| Rule | Level | Condition |
|------|-------|-----------|
| row_count_gt_0 | BLOCK | at least 1 data row |
| required_columns_present | BLOCK | all mapped ticket columns exist in header |
| service_date_not_null | BLOCK | Date present |
| route_code_not_null | BLOCK | Route No. present |
| ticket_id_not_null | WARN | missing Ticket No. |
| stage_km_numeric | WARN | coerce fail → null pax_km |
| revenue_numeric | WARN | |
| gender_coverage | WARN | % non-null Gender; Bhavnagar known ~0% |
| driver_id_coverage | WARN | % non-null Driver ID; Bhavnagar known ~0% |
| conductor_id_coverage | INFO | % non-null |
| vehicle_id_in_vehicles | WARN | ticket vehicle not in vehicles table |
| origin_abbr_in_stops | WARN | Pass. Origin not in stops |
| destination_abbr_in_stops | WARN | Pass. Destination not in stops |
| trip_times_fillable | WARN | Trip Start/End blank and cannot fill-down |

### stops / routes / vehicles
| Rule | Level |
|------|-------|
| stops lat/lon present for map pages | WARN — disable map markers for missing coords |
| route_length_km > 0 | WARN — LF/EPKM undefined for that route |
| vehicle capacity > 0 | WARN — capacity_km/LF undefined for those trips |

### stop_sequence
| Rule | Level |
|------|-------|
| files cover ticket date range | WARN — BA pattern incomplete for missing dates |
| stop_abbr matches stops | WARN |
| stop_no monotonic per route-date | WARN |

## Feature gates (UI)

| Feature / page | Requires |
|----------------|----------|
| Gender Classification | gender_coverage ≥ threshold (default 50%) else hide chart |
| Driver-Speed Analysis | driver_id_coverage ≥ threshold else page disabled with message |
| Conductor-Revenue Analysis | conductor_id present |
| BA stop maps | stops.latitude/longitude |
| LF / EPKM | capacity > 0 and route_length > 0 |

Bhavnagar **expected at Phase 1**: Gender and Driver pages gated OFF based on current Input files.

## Load report schema (JSON)

```json
{
  "agency_id": "bhavnagar",
  "loaded_at": "...",
  "tables": {
    "tickets": {"rows": 280375, "rules": [{"id": "gender_coverage", "level": "WARN", "value": 0.0}]}
  },
  "feature_gates": {
    "gender_charts": false,
    "driver_speed": false,
    "conductor_revenue": true,
    "ba_maps": true
  }
}
```

Path: `data/canonical/{agency_id}/dq_report.json`
