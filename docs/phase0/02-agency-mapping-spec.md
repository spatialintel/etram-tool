# Phase 0 — Agency mapping spec

## Purpose

Each agency has one YAML file under `docs/phase0/` (later `config/agencies/{agency_id}.yaml`) that maps **their** Excel headers to the **canonical** schema in `01-canonical-schema.md`.

Metric code and React **never** read raw Excel headers.

## Rules

1. One file per agency (`02-agency-mapping-{agency_id}.yaml`).
2. All required canonical fields for `tickets`, `stops`, `routes`, `vehicles`, `stop_sequence` must be mapped or explicitly marked `null` with a DQ reason.
3. Transforms that affect accuracy (fill-down trip times, pax_km formula) are listed under `transforms` and must be validated against PBIX in Phase 1–2.
4. Adding a second agency = new YAML only; no changes to metrics engine.

## Bhavnagar reference

See `02-agency-mapping-bhavnagar.yaml` — built from actual headers in:

- `Input files/ETM Data/ETM_Bhavnagar_Apr.xlsx` sheet `Bus Ticket Data`
- `Input files/Supporting data.xlsx` sheets `StopsList`, `Route_Description`, `Veh_Type`
- `Input files/Stops sequence/*.xlsx` sheet `StopsSeq`

## Template for a new city

```yaml
agency_id: surat
agency_name: Surat
sources: { ... }
tickets:
  TheirRouteCol: route_code
  # ...
```

If a city lacks Driver ID or Gender, omit or map to null and set DQ flags (see `04-data-quality-contract.md`).
