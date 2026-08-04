# Phase 0 — Canonical schema

All metrics and UI read **only** these tables. Agency Excel column names never appear downstream of ingest.

Storage: Parquet files in `data/canonical/{agency_id}/` queried via DuckDB.
Primary key convention: snake_case. Timestamps stored as UTC-naive local agency time unless noted.

---

## 1. Dimension tables (from Supporting data + derived)

### agencies
| Column | Type | Notes |
|--------|------|-------|
| agency_id | text PK | e.g. `bhavnagar` |
| agency_name | text | Display name |
| timezone | text | default `Asia/Kolkata` |

### routes
| Column | Type | Source (Bhavnagar) |
|--------|------|-------------------|
| agency_id | text | const |
| route_code | text | Route_Description.Route_Code |
| route_name | text | Route_Description.Route |
| route_description | text | Route_Description.Route_description |
| route_length_km | float | Route_Description.Route Length |
| route_category | text | Route_Description.Route Category |
| route_direction_key | text | `{route_code}-{route_description}` (PBIX `Route-direction`) |

PK: `(agency_id, route_code, route_description)` or unique `route_direction_key` per agency.

### stops
| Column | Type | Source |
|--------|------|--------|
| agency_id | text | const |
| stop_abbr | text | StopsList.Final_Abbr |
| stop_name | text | StopsList.Final_Name |
| stop_code_alt | text | StopsList.Codes (nullable) |
| latitude | float | StopsList.Latitude |
| longitude | float | StopsList.Longitude |

PK: `(agency_id, stop_abbr)`

### vehicles
| Column | Type | Source |
|--------|------|--------|
| agency_id | text | const |
| vehicle_id | text | Veh_Type.Vehicle no./ Schedule No. (spaces stripped) |
| vehicle_type | text | Veh_Type.Veh. Type |
| capacity | int | Veh_Type.Veh. Capacity |

PK: `(agency_id, vehicle_id)`

### time_slots
Generated (not from Excel). 30-minute bins from 00:00 to 23:30 (48 rows).

| Column | Type | Notes |
|--------|------|-------|
| slot_index | int | 1..48 |
| start_time | time | |
| end_time | time | start + 30 min |
| time_slot_label | text | `HH:MM - HH:MM` |

---

## 2. Fact tables (from ETM + Stops sequence)

### tickets
One row per ETM ticket / passenger record.

| Column | Type | Source (Bhavnagar ETM) |
|--------|------|------------------------|
| agency_id | text | const |
| ticket_id | text | Ticket No. |
| service_date | date | Date |
| route_code | text | Route No. |
| route_description | text | Route description |
| depot | text | Depot |
| vehicle_id | text | Vehicle/ Schedule no. |
| driver_id | text | Driver ID (nullable) |
| conductor_id | text | Conductor ID |
| trip_no | int | Trip No. |
| trip_start_time | time | Trip Start Time (fill-down in PBIX) |
| trip_end_time | time | Trip End Time (fill-down) |
| ticket_issue_time | time | Ticket Issue Time |
| passengers | int | No. of pass. |
| child_passengers | int | No. of child Pass. |
| pass_category | text | Pass. Category |
| origin_stop_no | int | Origin Stop No. |
| destination_stop_no | int | Destination Stop No. |
| origin_abbr | text | Pass. Origin |
| destination_abbr | text | Pass. Destination |
| stage_km | float | Stage Km |
| revenue | float | Revenue |
| gender | text | Gender (nullable; often blank) |
| total_passengers | int | derived in PBIX as Total passengers |
| pax_km | float | derived: passengers × stage_km (verify PQ formula in Phase 1) |

Derived keys (materialized at ingest for join fidelity with PBIX):

| Column | Formula (match PBIX) |
|--------|----------------------|
| bus_trip_key | `{vehicle_id}-{trip_no}` |
| route_direction_key | `{route_code}-{route_description}` |
| stop_origin_key | `{origin_stop_no}-{origin_abbr}` |
| stop_destination_key | `{destination_stop_no}-{destination_abbr}` |

### stop_sequence
One row per route stop ordered along the route for a date (from Stops sequence folder).

| Column | Type | Source |
|--------|------|--------|
| agency_id | text | const |
| service_date | date | Date |
| route_code | text | Route No. |
| route_description | text | Route_Description |
| stop_no | int | Stop no. |
| stop_id | text | Stop id |
| stop_name | text | Stop Name |
| stop_abbr | text | Stop code |
| segment | text | Segment (nullable on first stop) |
| seq_index | int | row order / PBIX Index (critical for BA cumulative) |
| stop_abbr_key | text | `{stop_no}-{stop_abbr}` (PBIX Stop No.-Abbre.) |

---

## 3. Derived analytical tables (built in metrics engine — Phase 2)

These mirror PBIX tables but are **computed**, not uploaded.

### trip_summary  (≈ Tripwise_Summary(LF))
Grain: one row per agency + date + route_direction + bus_trip (or Trip ID).

| Column | Meaning |
|--------|---------|
| trip_id | surrogate |
| service_date, route_code, route_direction_key, vehicle_id, trip_no, bus_trip_key | keys |
| ridership_trip | sum passengers |
| revenue_trip | sum revenue |
| trip_start_time | |
| pax_km | sum ticket pax_km |
| veh_capacity | from vehicles |
| route_length_km | from routes |
| capacity_km | route_length_km × veh_capacity |
| timeslot_1 / time_slot_label | 30-min floor of trip start |
| driver_id, conductor_id | |

### route_day_summary  (≈ Routewise_summary)
Grain: agency + date + route_code.

| Column | Meaning |
|--------|---------|
| n_trips, n_buses, ridership, revenue | aggregates |
| ridership_per_bus, revenue_per_bus, ridership_per_trip, revenue_per_trip | ratios |
| pax_km, capacity_km, load_factor_route | from trip_summary |
| route_length_km / route_length_route | from routes |
| male_ridership, female_ridership | Gender filter (0 if Gender blank) |
| week metadata | week_no, start_date, end_date, day_name |

### ba_stop_trip  (≈ BA Pattern & Paxload)
Grain: agency + date + route_direction + bus_trip + stop along sequence.

| Column | Meaning |
|--------|---------|
| boarding | passengers boarding at stop (ETM origin match) |
| alighting | passengers alighting at stop (ETM destination match) |
| cumulative_boarding, cumulative_alighting | running sum by bus_trip ordered by seq_index |
| passenger_load | cumulative_boarding − cumulative_alighting |
| time_slot_label, trip links to trip_summary | |

### Relationships (logical — DuckDB joins)

```text
tickets.vehicle_id          → vehicles.vehicle_id
tickets.origin_abbr         → stops.stop_abbr
tickets.destination_abbr    → stops.stop_abbr
tickets.route_code          → routes.route_code  (via route_direction_key preferred)
stop_sequence.stop_abbr     → stops.stop_abbr
ba_stop_trip.trip_id        → trip_summary.trip_id
trip_summary → route_day_summary via (service_date, route_code)
```

Inactive / unused in UI for now (existed in PBIX but not required): M:M Routewise↔ETM on Route No. alone.

---

## 4. Accuracy note

PBIX computed many columns inside Power Query *and* DAX. Phase 1 loads raw dimensions + tickets + stop_sequence only. Phase 2 rebuilds derived tables with formulas from `03-metric-spec.md` and cross-checks against PBIX exported values.
