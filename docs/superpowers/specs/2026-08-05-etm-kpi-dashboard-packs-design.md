# ETM KPI Dashboard Packs — Design

Date: 2026-08-05
Source catalogue: `docs/phase0/05-etm-od-gis-kpi-catalogue.md`
Constraint: ETM (+ stops/routes/vehicles/stop sequence) only; no AVL/schedule required.

## Goal

Ship decision-useful dashboard surfaces from the KPI catalogue in three phases so operators can slice by entity first, then run control-room / planning views, then open deeper catalogue metrics — without dumping 100 KPI cards at once.

## Phase 1 — Entities pack

**Nav:** new page `Entities` (Menu section, after Route Performance).

**Tabs:** Vehicles | Drivers | Conductors | Stops

**Shared behaviour**
- Respect global date range (+ route filter where the row has `route_code`).
- KPI strip for the filtered set: entity count, trips, ridership, revenue, vehicle-km (or boarding for stops).
- Searchable sortable `DataTable` with totals.
- Row click → `Drawer` with period totals + sparkline of daily ridership/revenue.
- Feature gates:
  - Drivers tab requires `driver_speed`
  - Conductors tab requires `conductor_revenue`
  - Stops tab requires `ba_maps` (or non-empty `stop_map`)

**Columns**

| Tab | ID | Metrics |
|-----|-----|---------|
| Vehicles | vehicle_id | trips, vehicle_km, ridership, revenue, pax_km, LF, days active |
| Drivers | crew_id (role=driver) | trips, vehicle_km, ridership, revenue, pax_km, days |
| Conductors | crew_id (role=conductor) | trips, vehicle_km, ridership, revenue, pax_km, days |
| Stops | stop_abbr / stop_name | boarding, alighting, net, peak_load, days |

**Export extensions (schema still v2)**
- `vehicle_summary`: add `vehicle_km` = sum of `route_length_km` per vehicle-day.
- `crew_summary`: add `vehicle_km`; export driver when `driver_speed`, conductor when `conductor_revenue`.

**Note:** ETM `driver_id` may contain schedule labels; Drivers tab shows raw field with a short Callout.

## Phase 2 — Control room + planning

**A. Overview enhancements**
- Day anomaly badges: ridership z-score vs same weekday mean (|z| >= 2).
- 7-day moving average overlay on ridership chart (daily granularity).
- Data-health chip from DQ / BA coverage.

**B. Planning**
- Routes: EPKM vs LF scatter mode.
- Temporal: bunching proxy = CV of hourly trips in peak hours.
- Stops: max-load point hint on best-trip / drawer.

## Phase 3 — Catalogue expansion (curated)

1. Gender donut on Overview when `gender_charts`.
2. Commercial strip: revenue per boarding; conductor yield outliers.
3. OD lite: top OD pairs export `od_top` (top 50) on Stops page if size allows.

Out of scope until AVL/schedule/cost: OTP, deadhead, wait time, farebox recovery, true transfers.

## Success criteria

- Phase 1: Vehicle / Driver / Conductor / Stop → trips, km, ridership, revenue.
- Phase 2: anomalous days + EPKM–LF scatter.
- Phase 3: gender + commercial outlier + OD top pairs if feasible.