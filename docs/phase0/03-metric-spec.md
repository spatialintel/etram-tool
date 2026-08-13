# Phase 0 — Metric specification (from E-TRAM Tool_V7.pbix DAX)

Source of truth: DAX extracted from `E-TRAM Tool_V7.pbix` via pbixray.  
Python Phase 2 must implement these formulas **literally**, then cross-check numeric outputs.

Orphan measures (no input data) — **do not implement** until sources exist:
- `% Overlap` → `Corridorwise_overlap/day`, `Corridor_Length`
- `<2.5km` → `Overlap Summary`

---

## A. Time Slot table (calculated)

```text
series = 0, 30, 60, …, 1410 minutes
Time = TIME(0, value, 0)
Start Time = format(Time, HH:MM)
End Time = format(Time + 30min, HH:MM)
Time Slot label = Start Time & " - " & End Time
Index = rank by value ascending (1..48)
```

---

## B. Ticket / ETM calculated columns

| Name | Formula |
|------|---------|
| Pass.Origin | LOOKUP stops.stop_name WHERE stop_abbr = origin_abbr |
| Pass.destination | LOOKUP stops.stop_name WHERE stop_abbr = destination_abbr |
| Day | weekday name of service_date |
| Travel Time | trip_end_time − trip_start_time |
| Travel Time_mins | HOUR(Travel Time)*60 + MINUTE(Travel Time) + SECOND(trip_start_time)/60  *(port carefully; verify vs PBIX)* |
| Route Length | LOOKUP routes.route_length_km on route_direction_key |
| Travel Speed | Route Length / (Travel Time_mins / 60) |
| MROUND | floor trip_start_time to 1 hour |
| Start/End/Time Slot | 30-min labels from MROUND *(used for some temporal views)* |
| 30 mins_ticket issue time | floor ticket_issue_time to 30 min |
| hour_ticket issue time | floor ticket_issue_time to 1 hour |
| Stop No.-Origin | `{origin_stop_no}-{origin_abbr}` |
| Stop No.-Destination | `{destination_stop_no}-{destination_abbr}` |
| Passenger km (measure) | SUM(pax_km) with current Date & Route filters |

**Ingest-side (Power Query) fields to reproduce in Phase 1:**
- Fill down Trip Start/End Time within trip groups
- Total passengers, Pax.km — confirm exact PQ expression against sample rows in Phase 1

---

## C. Tripwise_Summary(LF) columns & measures

| Name | Formula |
|------|---------|
| Capacity km | route_length_km × veh_capacity |
| timeslot_1 | FLOOR(trip_start_time, 30 min) |
| Timeslot_2 | timeslot_1 + 30 min |
| Start/End/Time Slot | format labels from timeslot_1 |
| Selected time interval | MAX(Timeslot_2) − MIN(timeslot_1) over filter context |
| Selected time interval_min | HOUR(interval)*60 + MINUTE(interval) |
| Headway (mins) | Selected time interval_min / COUNT(bus_trip_key) |
| Selected time interval1 | MAX(Time Slot[End Time1]) − MIN(Time Slot[Time]) *(slicer-driven)* |
| Headway (mins)1 | same pattern using interval1 |

Note: PBIX divides by **COUNT** (n departures), not (n−1). That matches Python
`kpi_headway_mins` and Temporal peak/off-peak headway. Mean inter-departure
gap would be span/(n−1); do not mix the two.

---

## D. Routewise_summary columns & measures

| Name | Formula |
|------|---------|
| Ridership/bus | Ridership / No. of buses |
| Revenue/bus | Revenue / No. of buses |
| Ridership/trip | Ridership / No. of trips |
| Revenue/trip | Revenue / No. of trips |
| Day of the week_name | FORMAT(Date, dddd) |
| DayNoOfYear | day-of-year |
| WeekNo | WEEKNUM(Date, 1) |
| Year | YEAR(Date) |
| Start Date / End Date | MIN/MAX Date within same WeekNo |
| Week | Start Date & "-" & End Date |
| Revenue/Day | SUM Revenue for same DayNoOfYear |
| Ridership/day | SUM Ridership for same Date |
| Pax.km | SUM trip_summary.pax_km for same Date + Route No. |
| Capacitykm | SUM trip_summary.capacity_km for same Date + Route No. |
| Load Factor_route | Pax.km / Capacitykm |
| Route Length | LOOKUP Route_Description by Route No. |
| Male Ridership | SUM tickets.total_passengers WHERE Gender = "M" |
| Female Ridership | SUM tickets.total_passengers WHERE Gender = "F" |

Base grain aggregates (from PQ — rebuild in Phase 2 from tickets):
- No. of trips, No. of buses, Ridership, Revenue per route-day

---

## E. BA Pattern & Paxload columns & measures

Boarding / Alighting at stop for a trip (DAX — port as filtered sums):

```text
Boarding =
  SUM tickets.total_passengers
  WHERE date, route_direction_key, bus_trip_key match
    AND stop_origin_key = ba.stop_abbr_key

Alighting =
  SUM tickets.total_passengers
  WHERE date, route_direction_key, bus_trip_key match
    AND stop_destination_key = ba.stop_abbr_key
```

| Name | Formula |
|------|---------|
| Cumulative Boarding | SUMX boarding for same bus_trip_key with Index ≤ current Index |
| Cumulative Alighting | same for alighting |
| Passenger Load | Cumulative Boarding − Cumulative Alighting |
| timeslot_1 / Time Slot / Start / End | 30-min floor of Trip Starting Time |
| Stop No.-Abbre. | `{stop_no}-{stop_abbr}` |
| LF | SUM(trip_summary.pax_km) / SUM(trip_summary.capacity_km) |
| EPKM | SUM(revenue_trip) / (AVERAGE(route_length_km) × DISTINCTCOUNT(trip_id)) |
| ATL | SUM(route_day.pax_km) / SUM(route_day.ridership) |
| EPKM_route | SUM(route_day.revenue) / (AVERAGE(route_length_route) × SUM(n_trips)) |
| EPB | SUM(revenue) / SUM(n_buses) |
| No. of trip/bus | SUM(n_trips) / SUM(n_buses) |
| Vehicle KM | SUMX(route_day, route_length_route × n_trips) |
| Vehicle KM/Bus | Vehicle KM / SUM(n_buses) |

**Vehicle KM note.** The PBIX measure reads `SUM(route_length_route) × SUM(n_trips)`, but that
form is only correct when `route_length_route` sits on a routes *dimension* table (one row per
route). In our canonical model `route_length_route` is denormalized onto the `route_day_summary`
*fact* table, so the length repeats on every day-row for a route; taking `SUM(length) × SUM(trips)`
literally over a multi-day window inflates the result by a spurious factor of "number of days".
Python therefore implements the row-wise `SUMX` form — Σ per route-day of `length × trips` —
which equals the PBIX formula in the single-route/single-day case and is the metrically correct
aggregation otherwise. Do not "correct" `kpi_vehicle_km` back to the literal `SUM(a) × SUM(b)`
form; `etram/metrics/kpis.py` carries the same warning comment.

---

## F. Page → metric map (UI Phase 3)

| Page | Primary metrics |
|------|-----------------|
| Overall Summary | Ridership/day, Revenue/day, Ridership/bus/day, Weekly LF, category/gender shares |
| Route Performance | LF, EPKM, ATL, Vehicle KM/Bus, ridership & revenue by route |
| Route Performance Trend | same over date |
| Temporal 30min / 1hr | ridership by ticket_issue time bins |
| BA Pattern hourly/tripwise | Boarding/Alighting/Load, Headway, LF, EPKM |
| Line Loading | Passenger Load along stop sequence |
| BA at stops + map | boarding/alighting by stop + lat/lon |
| Speed and TT | Travel Speed, Travel Time_mins |
| Driver-Speed | **requires driver_id** — disable if DQ fails |
| Conductor-Revenue | conductor_id + revenue |

---

## G. Phase 2 accuracy gate (mandatory fixtures)

Before closing Phase 2, record PBIX values and assert Python within tolerance:

1. Agency-wide Apr 2026: total ridership, total revenue, overall LF
2. One route (e.g. R1) on one date: ridership, revenue, LF, EPKM, ATL
3. One bus_trip_key: headway context, passenger load at 3 stop indices
4. One stop on map day: boarding sum, alighting sum

Tolerance: exact for integer counts; relative ≤ 0.1% for floats (or document PBIX rounding differences).

Fixture file location (Phase 2): `tests/fixtures/pbix_baseline_bhavnagar.json`
