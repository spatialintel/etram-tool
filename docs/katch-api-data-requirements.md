# E-TRAM feed from Katch — notes for the API developer

Hi — we run an analytics dashboard for Bhavnagar city buses (E-TRAM). Today the city uploads Excel. We want to **GET JSON from your API every ~30 minutes** instead.

Katch already holds the ticketing **and** the supporting master data we currently get from Excel (stop shortcodes, lat/lon, route lengths, fleet/capacity, stop sequence, stop-to-stop distances). Please **expose all of that** on the API — not tickets alone. We will map JSON into our tables and compute KPIs (ridership, load factor, EPKM, headway, etc.). Please **do not** add KPI endpoints for us.

We will **not** connect to your SQL database. A normal REST API is enough. Field names can be camelCase or snake_case; just keep them stable and send a short key list if they differ from the examples below.

---

## How we will call you

1. Store your base URL + token on our server (Railway). Not in the browser.
2. Every 30 minutes, `GET` tickets since the last successful pull.
3. Pull master data daily (or when it changes): stops, routes, vehicles, stop sequences, distance matrix.
4. Map JSON → our tables → rebuild dashboard payloads.
5. If a pull fails, we keep the last good dashboard.

Need from you to start: **base URL, how auth works, a test token, and sample responses** for tickets **and** the master-data endpoints below.

Auth example we can work with:

```http
GET /v1/tickets?from=2026-05-11T10:00:00&to=2026-05-11T10:30:00
Authorization: Bearer <token>
Accept: application/json
```

`updated_since=...` is equally fine if that is easier for you.

Timezone: **Asia/Kolkata**. Dates `YYYY-MM-DD`. Times `HH:MM:SS` or ISO datetime. Revenue as a **number**, not `"12.00"`. Empty window → `200` and `"data": []`.

Please paginate lists (whatever shape you like, as long as we can walk all pages):

```json
{
  "page": 1,
  "page_size": 500,
  "total": 1840,
  "data": []
}
```

Tickets every 30 min should be **incremental** (new/changed in that window), not the whole month. Same `ticket_id` twice = same ticket; we upsert.

Master data (stops, routes, vehicles, sequences, distances) can be a daily dump. No need to resend the full matrix every 30 minutes unless it actually changed.

Suggested resources (names up to you): `GET /tickets`, `/stops`, `/routes`, `/vehicles`, `/stop-sequences`, `/stage-km`.

---

## Tickets — every 30 minutes

One object per **issued ticket**. A day-total like `{ "date": "...", "passengers": 15000 }` is not usable.

```json
{
  "ticket_id": "T-18422",
  "service_date": "2026-05-11",
  "issued_at": "2026-05-11T10:14:22",
  "route_code": "R1",
  "route_description": "Gangajaliya Bus stop_Top 3 Bus depo",
  "vehicle_id": "GJ04AX2594",
  "trip_no": 3,
  "trip_start_time": "10:05:00",
  "trip_end_time": "10:55:00",
  "ticket_issue_time": "10:14:22",
  "passengers": 2,
  "child_passengers": 0,
  "origin_stop_id": "ST-012",
  "origin_stop_code": "GNJ",
  "origin_stop_name": "Gangajaliya Bus stop",
  "destination_stop_id": "ST-041",
  "destination_stop_code": "T3D",
  "destination_stop_name": "Top 3 Bus depo",
  "stage_km": 4.2,
  "revenue": 12.0,
  "conductor_id": "C-118",
  "driver_id": "D-044",
  "gender": "M",
  "pass_category": "Adult",
  "depot": "Depot"
}
```

Must-have so charts work:

- `ticket_id` — unique
- `service_date`
- `route_code` — stable (`R1`, `R4E`, …)
- `route_description` — direction; Up and Down should not be the same string
- `vehicle_id` — same format every time (trim spaces)
- `trip_no` + `trip_start_time` — so we can group a bus-trip
- `ticket_issue_time` or `issued_at` — hourly demand
- `passengers` (int); `child_passengers` if you split, else `0`
- origin + destination — **stable stop id and shortcode** plus name (same codes as `/stops`)
- `revenue`
- `stage_km` on the ticket **and** the full matrix on `/stage-km` (ticket-level km is handy; the matrix is what we use when a pair is missing)

Nice to have: trip end, conductor, driver, gender, category, depot. Null/blank is OK.

---

## Master data Katch already stores — please expose these too

Today the city uploads these as Excel. You already have the same objects in the app. We need **read APIs** for each.

### Stops (shortcodes, names, map)

Replaces Supporting workbook sheet **StopsList**.

Every stop used on a ticket, with the **shortcode** you use in the POS / distance file, plus lat/lon.

```json
{
  "stop_id": "ST-012",
  "stop_code": "GNJ",
  "stop_name": "Gangajaliya Bus stop",
  "latitude": 21.7645,
  "longitude": 72.1519
}
```

`stop_code` is the short abbreviation (what we call Final_Abbr). `stop_id` and `stop_code` must be the same values used on tickets (`origin_stop_id` / `origin_stop_code`).

### Routes (including length)

Replaces Supporting sheet **Route_Description**.

```json
{
  "route_code": "R1",
  "route_name": "Route 1",
  "route_description": "Gangajaliya Bus stop_Top 3 Bus depo",
  "route_length_km": 18.4,
  "route_category": "City"
}
```

`route_length_km` is needed for vehicle-km, EPKM, and load factor.

### Vehicles (fleet + seating)

Replaces Supporting sheet **Veh_Type**.

```json
{
  "vehicle_id": "GJ04AX2594",
  "vehicle_type": "Mini bus",
  "capacity": 32
}
```

`capacity` = seats. Needed for load factor.

### Stop sequence (order along each route / direction)

Replaces the **Stops sequence** Excel folder (`StopsSeq`).

One object per stop **in order** on that route and direction. `stop_no` = 1, 2, 3… If the path never changes, skip `service_date`. If it changes by day, include it.

```json
{
  "service_date": "2026-05-11",
  "route_code": "R1",
  "route_description": "Gangajaliya Bus stop_Top 3 Bus depo",
  "stop_no": 1,
  "stop_id": "ST-012",
  "stop_code": "GNJ",
  "stop_name": "Gangajaliya Bus stop"
}
```

We use this for boarding / alighting / passenger load along the line. Without ordered stops, the map line and BA pattern cannot be built.

### Stop-to-stop distance matrix

Replaces **`100 FLEET(STOP TO STOP DISTANCE)`** workbook.

Please expose the full OD matrix you already store (not only `stage_km` on the ticket). Same shortcodes as `/stops`.

```json
{
  "origin_stop_id": "ST-012",
  "origin_stop_code": "GNJ",
  "destination_stop_id": "ST-041",
  "destination_stop_code": "T3D",
  "distance_km": 4.2
}
```

Include every pair a passenger can buy. We use this for passenger-km, load factor, and ATL.

---

## Skip these

You do not need to expose: daily totals, load factor, EPKM, headway, busiest day.  
First version also does not need GPS, schedule, or OTP.

---

## What to send us so we can write the client

A Postman collection or a few saved responses is perfect:

- test token + base URL (not the website login)
- tickets for one half-hour that actually has sales
- tickets for one full day
- **stops** (shortcodes + lat/lon) for those tickets
- **routes** (with `route_length_km`)
- **vehicles** (with seating capacity)
- **stop sequences** for those route-directions
- **distance matrix** rows for the OD pairs in the sample
- at least two routes, both directions, 50+ tickets

Once we have that, we map fields and hook the 30-minute job. If anything is missing we will say so against this sample rather than guessing.
