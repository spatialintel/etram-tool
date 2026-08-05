# Dashboard Elements Upgrade — Full Build Spec (E-TRAM Transit Performance)

> **Handoff document.** Written for an implementing AI with no prior context on this repo.
> Read this file top to bottom before touching code. Every item states WHAT to build,
> WHERE it goes (exact path), and WHAT DATA backs it.

**Date:** 2026-08-05
**Predecessors:** `docs/superpowers/specs/2026-08-05-donezo-ui-redesign.md`, `docs/superpowers/plans/2026-08-05-donezo-ui-redesign.md`
**Current state:** Donezo-style forest-green UI shipped (light sidebar, `components/ui` primitives, ECharts + MapLibre, Overview bento).

---

## 0. Environment rules (READ FIRST — non-negotiable)

| Rule | Detail |
|------|--------|
| Edit location | Work in `C:\temp\etram-webapp` (npm on the G: Google-Drive mirror throws EBADF/EPERM) |
| Canonical source | `G:\...\E-TRAM Tool_V7\webapp\` — sync back with `.\scripts\sync_webapp_local.ps1 -Pull` from project root |
| Encoding trap | The editor Write tool emits **UTF-16** on this machine and breaks `tsc`/Vite. Write files via Python `pathlib.Path.write_text(..., encoding='utf-8')` or `[System.IO.File]::WriteAllText($p,$s,[System.Text.UTF8Encoding]::new($false))`, then verify first bytes are ASCII and `read_bytes().count(0) == 0` |
| Verify | `cd C:\temp\etram-webapp; npx tsc -b --pretty false` must exit 0 after every task |
| Dev server | Vite already runs on `http://localhost:5173/`; proxy `/api` -> `127.0.0.1:8000` |
| Backend | Start from project root: `.\scripts\run_api.ps1` (never from `webapp/`) |
| Commits | Do NOT commit unless the user explicitly asks |
| No fake data | Every widget must be backed by a real column. If data is missing, add it to the exporter (Section 6) or gate the widget off |

---

## 1. Reference skills found (registry search results)

Searched `npx skills find dashboard`. Highest-signal, verified by install count and repo stars:

| Skill | Installs | Repo stars | Value here |
|-------|----------|-----------|------------|
| `wshobson/agents@kpi-dashboard-design` | 12.3K | 38.5K | KPI hierarchy (strategic/tactical/operational), 5-7 KPI rule, trend + target context, drilldown patterns |
| `anthropics/knowledge-work-plugins@build-dashboard` | 7.2K | 23.3K | Widget/filter/table composition checklist for interactive dashboards |
| `grafana/skills@dashboarding` | 3.3K | — | Threshold/reference-line conventions, panel taxonomy, time-range semantics |
| `firecrawl/firecrawl-workflows@firecrawl-dashboard-reporting` | 30K | — | Reporting/export flows (lower relevance: scraping-oriented) |

Install (optional, global):

```powershell
npx skills add wshobson/agents@kpi-dashboard-design -g -y
npx skills add anthropics/knowledge-work-plugins@build-dashboard -g -y
```

Locally installed skills that MUST be used during execution:
- `frontend-ui-engineering` (component architecture, a11y, no "AI aesthetic")
- `incremental-implementation` (land in reviewable slices)
- `code-review-and-quality` (before declaring done)

Consensus rules extracted from the above + current published dashboard-UX guidance (2026):
1. **3-7 KPIs max** on the primary view; one hero metric.
2. **Every metric needs context**: delta vs prior period, vs target, or a sparkline.
3. **Order: metric -> trend -> detail.** Tables live below or behind a tab.
4. **Filter state must be visible** (active-filter chips), consistently placed, instant-apply.
5. **Max 3-4 series per chart**; direct labels beat legends; no 3D, no decoration.
6. **Reference lines** (average / target / threshold) turn a trend into a judgement.
7. **Deliberate loading / empty / error / stale states**, with an action in the empty state.
8. Colour = meaning, not decoration; colourblind-safe; 4.5:1 contrast.
9. Sub-2s first paint, <100ms interaction; skeletons, not spinners.
10. Every number needs a **unit** and a **definition** reachable in one hover/click.

---

## 2. Canonical anatomy of a dashboard (full element taxonomy)

This is the checklist the user asked for: everything a dashboard is normally made of.
Status column = current E-TRAM state. `MISSING` items are the work.

### 2.1 Shell, navigation, structure

| Element | Status | Where it lives now |
|---|---|---|
| Left sidebar nav with sections | DONE | `src/components/ui/Sidebar.tsx` |
| Collapsible / icon-rail sidebar | MISSING | Sidebar.tsx |
| Page header: title + subtitle + actions | DONE | `ui/PageHeader.tsx` |
| Breadcrumbs / context path | MISSING | new `ui/Breadcrumbs.tsx` |
| Tabs within a page (Chart / Table / Map) | MISSING | new `ui/Tabs.tsx` |
| Sub-navigation / segmented control | MISSING | new `ui/SegmentedControl.tsx` |
| Global search (routes, stops, metrics) | MISSING | new `ui/CommandSearch.tsx` |
| Command palette (Ctrl+K) | MISSING (optional) | CommandSearch.tsx |
| Toolbar row (export, refresh, settings, fullscreen) | MISSING | new `ui/Toolbar.tsx` |
| Sticky header on scroll | PARTIAL | `ui/ui.css` `.ui-shell-header` |
| Responsive breakpoints (1440 / 1100 / 768 / 375) | PARTIAL (1100 only) | `App.css` |
| Print / PDF stylesheet | MISSING | `App.css` `@media print` |
| Footer with data provenance | PARTIAL (sidebar footer) | Sidebar.tsx |

### 2.2 Metric / summary elements

| Element | Status | Notes |
|---|---|---|
| KPI card (label + big value) | DONE | `ui/StatCard.tsx` |
| Hero / inverted primary KPI | DONE | `variant="primary"` |
| Delta vs prior period + arrow | PARTIAL (prior *day* only) | needs prior *period* when range filter lands |
| Delta vs target / threshold | MISSING | needs target store (Section 5.7) |
| Sparkline inside KPI card | MISSING | new `ui/Sparkline.tsx` |
| Progress bar / bullet chart vs goal | MISSING | new chart helper |
| Gauge (semi-circle) | DONE | Overview LF gauge |
| Big-number + unit + definition tooltip | PARTIAL (no units/definitions) | Section 5.6 |
| Stat group / comparison table | PARTIAL | Overview "Ops snapshot" |
| Status pill / badge | DONE | `ui/StatusBadge.tsx` |
| Alert / callout / information box | MISSING | new `ui/Callout.tsx` |
| Trend micro-summary sentence ("+3.2% vs prior week") | PARTIAL | text only, no logic for ranges |

### 2.3 Chart types (and when each is right)

| Chart | Status | Use in E-TRAM | Data source |
|---|---|---|---|
| Vertical bar | DONE | Ridership by route / by hour | `route_trend`, `temporal` |
| Horizontal bar | MISSING | Top-N routes/stops ranking (better labels) | `route_trend`, `stop_map` |
| Stacked bar | DONE (BA chart) | Boarding vs alighting | `ba_line_best_trip` |
| 100% stacked bar | MISSING | Route share of ridership per day | `route_trend` |
| Grouped bar | MISSING | Period-vs-period comparison | `daily` |
| Line | DONE | Trends over dates/hours | `daily`, `route_trend`, `temporal` |
| Multi-line (max 4) | DONE | Top-4 route trends | `route_trend` |
| Area / stacked area | PARTIAL | Cumulative load | `ba_line_best_trip` |
| Combo bar + line (dual axis) | DONE | Ridership + revenue | `daily` |
| Pie | AVOID | — | — |
| **Donut** (with centre total) | MISSING | Revenue share by route; gender split (gated) | `route_trend`; `male/female_ridership` (needs export) |
| Gauge | DONE | Load factor | `daily.lf` |
| Radar | DONE | Route efficiency fingerprint | `route_trend` |
| Scatter / bubble | MISSING | LF vs ridership per route (bubble = trips) | `route_trend` |
| Heatmap matrix | MISSING | Hour x Route demand; Hour x Weekday | `temporal` |
| **Calendar heatmap** | MISSING | Daily ridership across the month | `daily` |
| Waterfall | MISSING (optional) | Day-over-day ridership bridge | `daily` |
| Boxplot | MISSING (optional) | Trip-level ridership distribution | needs trip export |
| Sankey / flow | MISSING (optional) | Stop-to-stop flow | needs OD data (not available) |
| Funnel | N/A | — | — |
| Treemap | MISSING (optional) | Route contribution | `route_trend` |
| Sparkline | MISSING | Inside KPI cards + table rows | `daily`, `route_trend` |
| Bullet chart | MISSING | Actual vs target per route | `route_trend` + targets |
| Histogram | MISSING (optional) | Load-factor distribution across trips | needs trip export |
| **Map: point markers** | DONE | Stops | `stop_map` |
| Map: graduated/proportional symbols | PARTIAL (size by peak load) | tighten scale + legend | `stop_map` |
| Map: heat layer | MISSING | Boarding density | `stop_map` |
| Map: route polylines | MISSING | Route alignment | needs stop_sequence export |
| Map: cluster markers | MISSING | Dense stop areas | `stop_map` |
| Map: choropleth (ward/zone) | MISSING (optional) | needs boundary GeoJSON | external |

### 2.4 Chart decorations (the "lines" the user asked about)

| Decoration | Status | Implementation |
|---|---|---|
| **Average line** | MISSING | ECharts `markLine: { data: [{ type: 'average' }] }` |
| **Median / min / max line** | MISSING | `markLine` types `median`/`min`/`max` |
| **Target line** (user-set) | MISSING | `markLine` with `yAxis: <target>` from prefs store |
| **Threshold band** (good/warn/bad) | MISSING | `markArea` with 3 bands + `visualMap.piecewise` for colour-by-threshold |
| **Trend line** (linear regression) | MISSING | compute OLS in `src/lib/stats.ts`, render as dashed `line` series |
| Moving average (7-day) | MISSING | compute in `src/lib/stats.ts` |
| Forecast / projection band | MISSING (optional) | `markArea` + dashed continuation |
| Event / annotation markers | MISSING | `markPoint` + `markLine` at dates (holidays, strikes) |
| Weekend / non-service shading | MISSING | `markArea` over Sat/Sun using `day_name` (needs export) |
| Peak / trough callouts | MISSING | `markPoint` types `max`/`min` |
| Value labels on data points | MISSING (currently off) | `series.label.show` driven by a global toggle |
| Axis titles + units | PARTIAL | `categoryAxis(name)` / `valueAxis(name)` exist, inconsistently used |
| Legend (toggleable series) | PARTIAL | ECharts legend on; no custom chips |
| Data zoom (slider + wheel) | MISSING | `dataZoom: [{type:'slider'},{type:'inside'}]` |
| Brush range selection | MISSING | `brush: { toolbox:['lineX','clear'], xAxisIndex:0 }` |
| Toolbox (save PNG, restore, magic type) | MISSING | `toolbox.feature.saveAsImage/restore/magicType` |
| Tooltip: axis-trigger, formatted, units | PARTIAL | no unit formatting, no comparison in tooltip |
| Cross-chart hover sync | MISSING | `echarts.connect()` group |
| Empty-series / no-data state per chart | PARTIAL | page-level only |
| Colourblind decals | MISSING | `aria: { enabled: true, decal: { show: true } }` |

### 2.5 Filters, selections, inputs

| Control | Status | Required behaviour |
|---|---|---|
| Single-date select | DONE (`<select>`) | keep as fallback |
| **Date RANGE picker + calendar** | MISSING | 2-month calendar, start/end, keyboard, clamp to `date_min..date_max` |
| Range presets | MISSING | Last 7 days, Last 14, Last 30, This week, This month, All, Custom |
| Compare-to-period toggle | MISSING | "vs previous period" / "vs same period last month" |
| Single-select dropdown | DONE (`<select>` route/direction) | restyle to `ui/Select.tsx` |
| **Multi-select dropdown with checkboxes** | MISSING | routes (multi), directions (multi), with search + select-all + counts |
| Checkbox (single) | MISSING | e.g. "Show weekends only" |
| Checkbox group (multi) | MISSING | day-of-week filter, time-slot filter |
| Radio group | MISSING | metric selector (Ridership / Revenue / LF) |
| Segmented control | MISSING | Daily / Weekly / Monthly granularity (replaces the ad-hoc weekly toggle) |
| Toggle switch | MISSING | Show values, Show average line, Show target line, Compact density |
| Slider / range slider | MISSING | min ridership threshold for Top-N, hour range 0-23 |
| Search input | MISSING | route/stop search with debounce |
| Top-N selector | MISSING | 5 / 10 / 20 / All for ranking charts |
| **Active filter chips + Clear all** | MISSING | always visible under PageHeader |
| Filter persistence in URL | MISSING | `#/page?date=..&routes=..` shareable |
| Saved views / presets | MISSING | localStorage, name + restore |
| Reset to defaults | MISSING | button in Toolbar |
| Cross-filtering (click chart -> filter) | MISSING | click route bar -> set route filter |
| Drill-down navigation | MISSING | click route -> Trends page pre-filtered |

### 2.6 Tables and detail

| Element | Status |
|---|---|
| Basic data table | DONE (Routes, Stops, Jobs) |
| Column sorting | MISSING |
| Sticky header | MISSING |
| Zebra -> subtle dividers | PARTIAL |
| Numeric right-align + tabular figures | PARTIAL |
| In-cell bar / sparkline | MISSING |
| Conditional formatting (colour by threshold) | MISSING |
| Pagination or virtualized rows | MISSING (hard-capped at 20) |
| Column visibility toggle | MISSING |
| Row click -> drill-down | MISSING |
| CSV / XLSX export | MISSING |
| Copy-to-clipboard | MISSING |
| Totals / footer row | MISSING |
| Search within table | MISSING |

### 2.7 States, feedback, meta

| Element | Status |
|---|---|
| Skeleton loading (per card) | MISSING (global spinner only) |
| Chart-level loading | MISSING (`showLoading` on ECharts) |
| Empty state with next action | PARTIAL (`ui/EmptyState.tsx`, no CTA) |
| Error state + retry | PARTIAL (full-page only) |
| Stale-data indicator | MISSING |
| Last-updated timestamp | MISSING (needs `generated_at` in export) |
| Toast notifications | MISSING |
| Confirmation modal | MISSING |
| Inline help / info tooltip on metrics | MISSING |
| Metric glossary page | MISSING |
| Data-quality / gate transparency panel | PARTIAL (count only) |
| Keyboard shortcuts help | MISSING |

### 2.8 Formatting, units, theming, a11y

| Element | Status |
|---|---|
| Central number formatter | MISSING (ad-hoc `fI/fM/fP` inside App.tsx) |
| Indian digit grouping (already `en-IN`) | DONE |
| Lakh / crore compaction option | MISSING |
| Currency symbol + decimals policy | PARTIAL |
| Units on every axis/label (pax, ₹, km, %, min) | PARTIAL |
| Percent vs ratio consistency | PARTIAL (LF stored 0-1, shown %) |
| Null / no-data rendering ("—") | PARTIAL |
| Design tokens | DONE (`src/index.css`) |
| Dark mode | MISSING |
| Density toggle (comfortable/compact) | MISSING |
| Colourblind-safe palette + decals | PARTIAL |
| Focus-visible rings | DONE |
| ARIA labels on charts/controls | PARTIAL |
| `aria-live` on filter change | MISSING |
| Reduced-motion support | MISSING |
---

## 3. Current codebase inventory (verified 2026-08-05)

### 3.1 Files

```
C:\temp\etram-webapp\src\
  App.tsx            ~1400 lines — ALL pages in one file (needs splitting, Section 7.1)
  App.css            page/layout CSS (bento, kpi, filter, upload, table, legacy dark sidebar rules)
  index.css          design tokens (:root) + base
  main.tsx           entry
  components\Chart.tsx      COLORS, baseOption(), categoryAxis(), valueAxis(), <Chart option height>
  components\StopMap.tsx    <StopMap stops height>, StopPoint type, Carto Positron, circle markers
  components\ui\     AppShell, Sidebar(+SidebarItem), PageHeader, FilterBar, Card, StatCard,
                     StatusBadge, ListRow, EmptyState, Button, ui.css, index.ts (barrel, imports ui.css)
```

### 3.2 Pages and what they render today

| Page | Component | Charts | Filters consumed |
|---|---|---|---|
| Overview | `OverviewPage` | combo bar+line (ridership/revenue), LF gauge | `date`; local `weeklyView` |
| Route Performance | `RoutePerformancePage` | bar+line (ridership/LF), bar (revenue), table | `date`, `route` |
| Route Trends | `RouteTrendsPage` | 3 line charts (ridership, LF, revenue) | `route` only (date NOT applied) |
| Temporal | `TemporalPage` | bar (hourly ridership), line (hourly revenue), bar (trips/hour) | `date`, `route` |
| Stops & Map | `StopsMapPage` | MapLibre + load line + stacked BA bar + table | `date`, `routeDirection` |
| Efficiency | `EfficiencyPage` | 4 spark area charts + radar | `date` only (**route filter is shown but ignored — BUG**) |
| Upload | `UploadPage` | none | none |

### 3.3 Data contract available to the UI today

`webapp/public/data/bhavnagar-dashboard.json`, produced by `scripts/export_phase3_data.py`:

| Table | Columns |
|---|---|
| `agency` | `agency_id, agency_name, date_min, date_max, routes[], route_directions[]` |
| `feature_gates` | `gender_charts:false, driver_speed:false, conductor_revenue:true, ba_maps:true` |
| `daily` | `service_date, ridership, revenue, pax_km, capacity_km, trips, buses, lf` |
| `route_trend` | `service_date, route_code, ridership, revenue, load_factor_route, n_trips, n_buses` |
| `temporal` | `service_date, route_code, start_hour, ridership, revenue, trips` |
| `stop_map` | `service_date, route_direction_key, stop_abbr, stop_name, boarding, alighting, peak_load, latitude, longitude` |
| `ba_line_best_trip` | `service_date, route_direction_key, bus_trip_key, stop_no, stop_name, boarding, alighting, passenger_load` |

---

## 4. Component library to build

All new files under `C:\temp\etram-webapp\src\components\ui\`, each exported from `ui/index.ts`.
Styles append to `ui/ui.css` unless a component is large enough to warrant its own CSS file.
Follow the existing convention: named export, typed props interface, optional `className`, tokens only (no hard-coded hex except chart series).

### 4.1 Inputs and filters

```tsx
// ui/Select.tsx
export function Select({ label, value, options, onChange, disabled, size = 'md' }: {
  label?: string
  value: string
  options: { value: string; label: string; hint?: string }[]
  onChange: (v: string) => void
  disabled?: boolean
  size?: 'md' | 'sm'
}): JSX.Element

// ui/MultiSelect.tsx  — checkbox dropdown, searchable, "Select all" / "Clear",
// closes on outside click + Esc, shows "3 of 12 selected" in the trigger
export function MultiSelect({ label, values, options, onChange, maxTagCount = 2, searchable = true }: {
  label?: string
  values: string[]
  options: { value: string; label: string }[]
  onChange: (v: string[]) => void
  maxTagCount?: number
  searchable?: boolean
}): JSX.Element

// ui/DateRangePicker.tsx — two-month calendar grid, presets rail on the left,
// min/max clamped to agency.date_min/date_max, highlights days that HAVE data
export type DateRange = { start: string; end: string }   // ISO yyyy-mm-dd inclusive
export function DateRangePicker({ value, onChange, min, max, availableDates, presets = true, compare, onCompareChange }: {
  value: DateRange
  onChange: (r: DateRange) => void
  min: string
  max: string
  availableDates: string[]
  presets?: boolean
  compare?: 'none' | 'prev-period'
  onCompareChange?: (c: 'none' | 'prev-period') => void
}): JSX.Element

// ui/SegmentedControl.tsx — Daily | Weekly | Monthly, or metric switcher
export function SegmentedControl<T extends string>({ value, options, onChange, size = 'md' }: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  size?: 'md' | 'sm'
}): JSX.Element

// ui/Checkbox.tsx, ui/CheckboxGroup.tsx, ui/RadioGroup.tsx, ui/Switch.tsx
// ui/RangeSlider.tsx  (dual-thumb; used for hour range 0-23 and min-ridership cutoff)
// ui/SearchInput.tsx  (debounced 200ms, clear button, aria-label)
// ui/FilterChips.tsx  — renders active filters as removable chips + "Clear all"
export function FilterChips({ chips, onRemove, onClearAll }: {
  chips: { id: string; label: string; value: string }[]
  onRemove: (id: string) => void
  onClearAll: () => void
}): JSX.Element
```

### 4.2 Layout and containers

```tsx
// ui/Tabs.tsx — roving-tabindex, aria-selected, controlled
export function Tabs({ value, onChange, items }: {
  value: string
  onChange: (v: string) => void
  items: { id: string; label: string; badge?: string }[]
}): JSX.Element

// ui/Toolbar.tsx      right-aligned action cluster (export, settings, refresh, fullscreen)
// ui/Breadcrumbs.tsx  Overview / Route Performance / R-12
// ui/Modal.tsx        focus-trapped dialog (settings, definitions), Esc to close
// ui/Drawer.tsx       right-side detail panel for drill-downs (route/stop detail)
// ui/Callout.tsx      info | warn | danger | success box with icon, title, body, optional action
// ui/Skeleton.tsx     <Skeleton height width radius />, plus <SkeletonCard /> and <SkeletonChart />
// ui/Toast.tsx        + useToast() hook, 4s auto-dismiss, aria-live=polite
// ui/InfoTip.tsx      "i" button -> popover with metric definition + formula + unit
```

### 4.3 Data display

```tsx
// ui/DataTable.tsx — the single table component replacing all ad-hoc <table> markup
export type Column<T> = {
  key: keyof T & string
  header: string
  align?: 'left' | 'right'
  width?: number
  format?: (v: unknown, row: T) => ReactNode
  sortable?: boolean
  bar?: boolean            // render an in-cell proportional bar behind the number
  threshold?: (v: number) => 'good' | 'warn' | 'bad' | undefined
}
export function DataTable<T>({ rows, columns, initialSort, pageSize = 25, onRowClick, stickyHeader = true, totalsRow, exportName, searchable }: {
  rows: T[]
  columns: Column<T>[]
  initialSort?: { key: string; dir: 'asc' | 'desc' }
  pageSize?: number
  onRowClick?: (row: T) => void
  stickyHeader?: boolean
  totalsRow?: boolean
  exportName?: string      // enables CSV download button
  searchable?: boolean
}): JSX.Element

// ui/Sparkline.tsx — tiny inline SVG (NOT ECharts; must stay cheap inside cards/table cells)
export function Sparkline({ values, width = 96, height = 28, tone = 'brand' }: {
  values: number[]
  width?: number
  height?: number
  tone?: 'brand' | 'muted' | 'up' | 'down'
}): JSX.Element

// ui/MetricValue.tsx — value + unit + optional definition tip, single source of truth for units
export function MetricValue({ value, unit, definitionKey, compact }: {
  value: number | null
  unit: 'pax' | 'inr' | 'km' | 'pct' | 'min' | 'count'
  definitionKey?: string
  compact?: boolean
}): JSX.Element
```

### 4.4 StatCard upgrade (modify existing `ui/StatCard.tsx`)

Add, without breaking current call sites:

```tsx
{
  label: string
  value: string
  sub?: ReactNode
  trend?: { up: boolean; label: string }
  variant?: 'default' | 'primary'
  className?: string
  // NEW
  spark?: number[]                 // renders <Sparkline> bottom-right
  target?: { value: number; current: number; label?: string }  // progress bar vs goal
  definitionKey?: string           // renders <InfoTip> next to the label
  onClick?: () => void             // makes the card a drill-down button (role=button, focusable)
  status?: 'good' | 'warn' | 'bad' // left accent colour by threshold
}
```

---

## 5. Chart + data infrastructure

### 5.1 `src/lib/format.ts` (NEW — single formatting authority)

Move `fI`, `fM`, `fP` out of `App.tsx` and extend:

```ts
export const fmtInt   = (n: number | null) => ...            // en-IN grouping, "—" when null
export const fmtMoney = (n: number | null, opts?: { compact?: boolean }) => ... // ₹, lakh/crore when compact
export const fmtPct   = (ratio: number | null, dp = 1) => ...   // 0.62 -> "62.0%"
export const fmtKm    = (n: number | null, dp = 2) => ...       // "3.41 km"
export const fmtMin   = (n: number | null) => ...               // "12 min"
export const fmtDelta = (cur: number, prev: number) => ({ pct, up, label })
export const UNIT_LABEL = { pax: 'passengers', inr: '₹', km: 'km', pct: '%', min: 'min', count: '' }
```

Rule: **no component may call `Intl.NumberFormat` directly after this lands.**

### 5.2 `src/lib/stats.ts` (NEW)

```ts
export function movingAverage(values: number[], window = 7): (number | null)[]
export function linearRegression(values: number[]): { slope: number; intercept: number; fitted: number[] }
export function percentile(values: number[], p: number): number
export function periodDelta(cur: number[], prev: number[]): { pct: number; up: boolean }
export function topN<T>(rows: T[], key: keyof T, n: number): T[]   // with "Other" bucketing helper
```

### 5.3 `src/components/Chart.tsx` (EXTEND — do not break `baseOption`, `categoryAxis`, `valueAxis`, `COLORS`)

Add exported helpers so every page composes decorations the same way:

```ts
// Reference lines / bands
export const markAvg = (label = 'Average') => ({
  markLine: {
    silent: true, symbol: 'none',
    data: [{ type: 'average', label: { formatter: label + ': {c}', position: 'insideEndTop' } }],
    lineStyle: { color: '#374151', type: 'dashed', width: 1.5 },
  },
})

export const markTarget = (value: number, label: string) => ({
  markLine: {
    silent: true, symbol: 'none',
    data: [{ yAxis: value, label: { formatter: label + ': {c}', position: 'insideEndTop' } }],
    lineStyle: { color: '#D97706', type: 'dashed', width: 1.5 },
  },
})

export const markBands = (bands: { from: number; to: number; tone: 'good' | 'warn' | 'bad' }[]) => ({ markArea: { ... } })
export const markExtremes = () => ({ markPoint: { data: [{ type: 'max' }, { type: 'min' }], symbolSize: 44 } })
export const trendSeries  = (values: number[], name = 'Trend') => ({ /* dashed line series from linearRegression */ })

// Interaction defaults
export const zoomDefaults = (opts?: { start?: number; end?: number }) => ({
  dataZoom: [{ type: 'inside', start: opts?.start ?? 0, end: opts?.end ?? 100 },
             { type: 'slider', height: 18, bottom: 4, start: opts?.start ?? 0, end: opts?.end ?? 100 }],
})
export const brushDefaults = () => ({ brush: { toolbox: ['lineX', 'clear'], xAxisIndex: 0, throttleType: 'debounce' } })
export const toolboxDefaults = (name: string) => ({
  toolbox: { right: 8, top: 0, feature: { saveAsImage: { name, pixelRatio: 2, title: 'PNG' }, restore: { title: 'Reset' } } },
})

// Labels + accessibility
export const valueLabels = (show: boolean, fmt?: (v: number) => string) => ({ label: { show, position: 'top', formatter: ... } })
export const a11yDecal = () => ({ aria: { enabled: true, decal: { show: true } } })

// New chart builders (keep page code declarative)
export function donutOption(rows: { name: string; value: number }[], centerLabel: string): EChartsOption
export function calendarHeatmapOption(days: { date: string; value: number }[], year: string): EChartsOption
export function heatmapMatrixOption(x: string[], y: string[], cells: [number, number, number][]): EChartsOption
export function scatterOption(points: { x: number; y: number; size: number; name: string }[]): EChartsOption
export function horizontalBarOption(rows: { name: string; value: number }[], unit: string): EChartsOption
export function bulletOption(actual: number, target: number, max: number): EChartsOption
```

`<Chart>` itself gains props: `loading?: boolean` (uses ECharts `showLoading`), `empty?: boolean` (renders `<EmptyState>` instead), `group?: string` (for `echarts.connect` hover sync), `onEvent?: { click?: (p) => void }` for cross-filtering.

### 5.4 `src/components/StopMap.tsx` (EXTEND)

| Feature | Implementation |
|---|---|
| Colour/size legend | HTML overlay bottom-left, tokens only |
| Metric selector | prop `metric: 'boarding' | 'alighting' | 'net' | 'peak_load'` drives colour+size |
| Heat layer toggle | MapLibre `heatmap` layer from a GeoJSON source built off `stop_map` |
| Cluster mode | GeoJSON source `cluster: true`, `clusterRadius: 40` |
| Fit-to-data bounds | `map.fitBounds(LngLatBounds)` instead of fixed zoom 11 |
| Click -> selection | `onStopClick?: (stopAbbr: string) => void` for cross-filtering the BA charts |
| Route polyline | needs `stop_sequence` export (Section 6.2); draw `line` layer per `route_direction_key` |
| Basemap switch | Positron / Voyager / dark, matching app theme |

### 5.5 Filter state architecture (`src/lib/filters.ts` — NEW)

Replace the four `useState`s in `App()` with one reducer-backed object, then thread it via props (or a small context) to pages.

```ts
export type Granularity = 'daily' | 'weekly' | 'monthly'
export type FilterState = {
  range: { start: string; end: string }
  compare: 'none' | 'prev-period'
  routes: string[]            // [] === all
  directions: string[]        // [] === all
  hours: [number, number]     // [0, 23]
  days: number[]              // 0..6, [] === all
  granularity: Granularity
  topN: number                // 5 | 10 | 20 | 0 (all)
  metric: 'ridership' | 'revenue' | 'lf'
  showValues: boolean
  showAverage: boolean
  showTarget: boolean
}
export const DEFAULT_FILTERS: FilterState
export function useUrlFilters(initial: FilterState): [FilterState, (patch: Partial<FilterState>) => void]
export function activeChips(f: FilterState): { id: string; label: string; value: string }[]
export function applyFilters<T extends { service_date: string; route_code?: string }>(rows: T[], f: FilterState): T[]

// Comparison plumbing — REQUIRED by every delta badge and by the Compare page.
// Returns the immediately preceding window of equal length, clamped to agency.date_min.
// Example: range 2026-04-15..2026-04-30 (16 days) -> 2026-03-30..2026-04-14.
export function getComparisonRange(f: FilterState, bounds: { min: string; max: string }): DateRange | null
```

**Comparison contract (do not skip).** When `f.compare !== 'none'`, a page derives its comparison
rows by calling `applyFilters` a second time with the range swapped:

```ts
const cur  = applyFilters(rows, f)
const cmp  = f.compare === 'none' ? null
           : applyFilters(rows, { ...f, range: getComparisonRange(f, bounds)! })
// deltas via periodDelta(curValues, cmpValues) from src/lib/stats.ts
```

Rules: comparison never changes route/hour/day filters (only the date window); when the comparison
window would fall before `agency.date_min` it is truncated and the UI labels the delta "partial period";
`getComparisonRange` returns `null` when no comparable window exists, and callers must hide the delta
rather than render a misleading zero.

URL format (hash-based, no router dependency):
`#/routes?start=2026-04-01&end=2026-04-30&routes=R1,R7&gran=weekly&metric=ridership&cmp=prev`

`useUrlFilters` must: parse on mount, `replaceState` on change (no history spam), and ignore unknown keys.

### 5.6 Metric definitions (`src/lib/definitions.ts` — NEW)

Every KPI gets a definition surfaced through `InfoTip` and a Definitions page.

```ts
export const DEFINITIONS = {
  ridership:   { label: 'Ridership', unit: 'pax', formula: 'Count of ticketed passengers', note: 'ETM ticket rows' },
  revenue:     { label: 'Revenue', unit: 'inr', formula: 'Sum of ticket fare' },
  lf:          { label: 'Load Factor', unit: 'pct', formula: 'pax-km / capacity-km', target: 0.6 },
  atl:         { label: 'Average Trip Length', unit: 'km', formula: 'pax-km / ridership' },
  fare_yield:  { label: 'Fare Yield', unit: 'inr', formula: 'revenue / ridership' },
  epkm:        { label: 'Earnings per km', unit: 'inr', formula: 'revenue / vehicle-km' },
  epb:         { label: 'Earnings per Bus', unit: 'inr', formula: 'revenue / buses' },
  trips_per_bus:{ label: 'Trips per Bus', unit: 'count', formula: 'trips / buses' },
  headway:     { label: 'Headway', unit: 'min', formula: 'service span / trips' },
  vehicle_km:  { label: 'Vehicle km', unit: 'km', formula: 'route length x trips' },
  peak_load:   { label: 'Peak Load', unit: 'pax', formula: 'max onboard passengers at any stop' },
} as const
```

### 5.7 Preferences store (`src/lib/prefs.ts` — NEW, localStorage)

```ts
export type Prefs = {
  theme: 'light' | 'dark'
  density: 'comfortable' | 'compact'
  compactNumbers: boolean          // lakh/crore
  targets: { lf: number; fareYield: number; tripsPerBus: number; headwayMins: number }
  savedViews: { id: string; name: string; url: string }[]
}
export const DEFAULT_PREFS: Prefs = { theme: 'light', density: 'comfortable', compactNumbers: false,
  targets: { lf: 0.6, fareYield: 12, tripsPerBus: 6, headwayMins: 20 }, savedViews: [] }
export function usePrefs(): [Prefs, (patch: Partial<Prefs>) => void]
```

Targets feed `markTarget()`, `StatCard.target`, and table `threshold` colouring. Editable in a Settings modal (`ui/Modal.tsx`) opened from `ui/Toolbar.tsx`.

### 5.8 Data loading + schema versioning (`src/lib/useDashboardData.ts` — NEW)

Phase E bumps the payload to `schema_version: 2`. Rather than sprinkling `?.` through every page,
centralise the version check in one hook so v1 payloads keep working during the transition
(the static JSON on disk, a stakeholder's cached copy, or a job result produced before Phase E).

```ts
export type DashboardSource = { kind: 'static' } | { kind: 'job'; jobId: string }

export function useDashboardData(source?: DashboardSource): {
  data: DashboardData | null
  meta: DashboardMeta | null      // null on v1 payloads
  schemaVersion: 1 | 2
  isV2: boolean                   // gate every Phase E-dependent widget on this
  loading: boolean
  error: string | null
  reload: () => void
}
```

Rules:
- `schemaVersion` = `data.meta?.schema_version ?? 1`.
- Widgets that need Phase E tables (`kpi_daily`, `slot_summary`, `vehicle_summary`, `crew_summary`,
  `trip_distribution`, `stop_sequence_geo`, weekday/gender columns) render only when `isV2` **and**
  the specific table is non-empty; otherwise show `EmptyState` with "Re-run the data export to enable this view".
- In `src/types.ts`, all Phase E additions are declared **optional** (`kpi_daily?: KpiDailyRow[]`).
  Never make them required — that would break v1 loading at the type level and tempt non-null assertions.
- The staleness `Callout` reads `meta.generated_at`; on v1 payloads it is simply not rendered.

---

## 6. Backend / data-export work (unlocks most new widgets)

**File:** `G:\...\E-TRAM Tool_V7\scripts\export_phase3_data.py`
Everything below already exists in the canonical parquet files — it is simply not exported yet.
Keep the payload lean: aggregate before shipping, never ship raw ticket rows.

### 6.1 Payload metadata (REQUIRED — unblocks "last updated", freshness, provenance)

Add to `payload`:

```python
"meta": {
    "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    "schema_version": 2,
    "source_rows": {"route_day": len(route_day), "trip": len(trip), "ba": len(ba)},
    "load_ok": dq.get("load_ok"),
    "dq_rules": dq.get("rules", []),      # for the Data Quality page
    "dq_tables": dq.get("tables", {}),
},
```

### 6.2 New/extended tables to export

| Key | Source | Columns to add | Unlocks |
|---|---|---|---|
| `daily` (extend) | `route_day_summary` | `day_name`, `week_no`, `week_label`, `week_start`, `week_end`, `male_ridership`, `female_ridership` | weekday filter, weekend `markArea`, weekly/monthly granularity without client-side week math, gender donut (gate `gender_charts`) |
| `route_trend` (extend) | `route_day_summary` | `ridership_per_bus`, `revenue_per_bus`, `ridership_per_trip`, `revenue_per_trip`, `route_length_route`, `pax_km`, `capacity_km` | per-route EPKM/EPB, bullet vs target, scatter bubble, route drill-down cards |
| `kpi_daily` (NEW) | `etram/metrics/kpis.py::summarize_kpis` per `service_date` | `service_date, LF, EPKM, ATL, EPKM_route, EPB, trips_per_bus, vehicle_km, vehicle_km_per_bus, headway_mins` | Efficiency page stops re-deriving metrics in JS; matches Python source of truth |
| `slot_summary` (NEW) | `trip_summary` grouped by `service_date, route_code, time_slot_label` | `trips, ridership, revenue, pax_km, capacity_km` | 30-min time-slot heatmap, headway by slot |
| `hour_matrix` (NEW) | `temporal` pivot | `service_date, route_code, start_hour, ridership` (already there) — just add `day_name` | Hour x Weekday heatmap |
| `crew_summary` (NEW, gate `conductor_revenue`) | `trip_summary` grouped by `service_date, conductor_id` / `driver_id` | `trips, ridership, revenue, pax_km` | real Crew page (replaces the misleading route-proxy page removed earlier) |
| `vehicle_summary` (NEW) | `trip_summary` grouped by `service_date, vehicle_id` | `trips, ridership, revenue, veh_capacity, capacity_km, pax_km` | fleet utilisation, LF by bus |
| `trip_distribution` (NEW) | `trip_summary` | binned histogram of `ridership_trip` and per-trip LF (ship bins, not rows) | histogram/boxplot without shipping 100k rows |
| `stop_sequence_geo` (NEW) | canonical `stop_sequence` + `stops` | `route_direction_key, stop_no, stop_abbr, latitude, longitude` | route polylines on the map |
| `stop_map` (extend) | `ba_stop_trip` | `route_code`, `total_passengers_at_stop` | filter stops by route, richer popups |

Payload-size guard: after adding, assert the JSON stays under ~8 MB; if `slot_summary` or `vehicle_summary` blow past that, restrict to the exported date window or ship per-agency chunk files.

### 6.3 API (optional, only if payload grows past ~8 MB)

**File:** `etram/__init__.py` — add read-only slice endpoints so the UI can lazy-load heavy tables:

```
GET /api/agencies/{agency_id}/summary          -> agency + meta + feature_gates + daily + kpi_daily
GET /api/agencies/{agency_id}/routes?start&end -> route_trend slice
GET /api/agencies/{agency_id}/stops?date&dir   -> stop_map slice
GET /api/agencies/{agency_id}/export.csv?table=route_trend&start&end  -> CSV download
```

Keep the existing static-JSON path as the default so the UI still works with no backend.

---

## 7. Page-by-page rebuild spec

### 7.0 Prerequisite refactor (do this FIRST)

`App.tsx` is ~1400 lines and will not survive this scope. Split into:

```
src/App.tsx                 shell + routing + filter state only (<200 lines)
src/pages/OverviewPage.tsx
src/pages/RoutesPage.tsx
src/pages/TrendsPage.tsx
src/pages/TemporalPage.tsx
src/pages/StopsPage.tsx
src/pages/EfficiencyPage.tsx
src/pages/UploadPage.tsx
src/pages/ComparePage.tsx      (new)
src/pages/DataQualityPage.tsx  (new)
src/pages/DefinitionsPage.tsx  (new)
src/types.ts                   DashboardData + row types (moved out of App.tsx)
src/lib/{format,stats,filters,definitions,prefs}.ts
```

Move page components verbatim first, verify `tsc` + visual parity, then start enhancing. Do not mix the move and the rewrite in one step.

### 7.1 Overview (`src/pages/OverviewPage.tsx`)

Target layout:

```
PageHeader: Overview            [range picker] [compare toggle] [export] [settings]
FilterChips: Apr 1 - Apr 30 - All routes - Clear all

Row 1 (4 StatCards, all with spark + delta + definition tip):
  Ridership (primary, spark, vs prev period)   Revenue (spark, vs prev)
  Load Factor (target bar vs prefs.targets.lf) Trips (sub: buses, spark)

Row 2:
  Card "Ridership & Revenue"  [Daily|Weekly|Monthly segmented] [show values switch]
     combo bar+line + markAvg + optional markTarget + zoomDefaults + toolboxDefaults
  Card "Load Factor"  gauge + threshold bands (bad <45%, warn 45-60%, good >60%)

Row 3:
  Card "Service calendar"  calendarHeatmapOption(daily.ridership)   <- NEW, answers "calendar"
  Card "Revenue share by route"  donutOption(top 6 + Other)          <- NEW, answers "pie"
  Card "Top routes"  ListRow + share badge + click -> drill to Trends

Row 4:
  Card "Ops snapshot" (ATL, fare yield, EPKM, EPB, trips/bus, headway) each with InfoTip
  Card "Data health" (range, days loaded, generated_at, gate list, Upload CTA)
```

### 7.2 Route Performance (`src/pages/RoutesPage.tsx`)

- Filters: multi-select routes, Top-N selector, metric radio (Ridership | Revenue | LF), min-ridership slider.
- `Tabs`: **Chart** | **Table** | **Compare**.
- Chart tab: horizontal bar ranking (better label legibility) + `markAvg` + target line; second chart = scatter (x = ridership, y = LF, bubble = trips) to expose outliers.
- Table tab: `DataTable` with sorting, in-cell bars for ridership, threshold colouring for LF vs `prefs.targets.lf`, totals row, CSV export, row click -> Drawer with route detail (sparklines for 30 days + per-hour profile).
- Compare tab: grouped bars, selected routes vs each other, or route vs agency average.

### 7.3 Route Trends (`src/pages/TrendsPage.tsx`)

- **Fix:** honour the date range (currently ignores it entirely).
- Metric `SegmentedControl` replaces three fixed charts with one large chart + small multiples. Phase F4 done (2026-08-05): Temporal hourxweekday/route heatmaps, 30-min slots, peak share/headway KPIs. Phase F5 done (2026-08-05): Stops map metric/cluster/heat/basemap/polylines, drawer, top-20, capacity markLine. Phase F6 done (2026-08-05): Efficiency kpi_daily KPIs/sparks, LF bullets, trip_distribution histograms. Phase F done (2026-08-05): F7 Upload stepper, validation chips, progress bar, relative job times. Full Phase F complete. Phase G done (2026-08-05): Compare, Data Quality, Definitions pages + Menu/Data/Help nav. Phase H done (2026-08-05): dark/compact prefs, print CSS, responsive 768/375, lazy pages, saved views, aria-live, docs.
- Add: 7-day moving average line, linear trend line, `markAvg`, weekend `markArea` (needs `day_name`), `dataZoom` slider, `brush` to select a window and push it back into the global range filter.
- Small-multiples grid: one mini line per selected route (max 12), shared y-scale toggle.
- Annotation support: `markPoint` on max/min with labels.

### 7.4 Temporal (`src/pages/TemporalPage.tsx`)

- Add **hour-range slider** (0-23) and **day-of-week checkbox group**.
- Add **Hour x Weekday heatmap** and **Hour x Route heatmap** (`heatmapMatrixOption`) with `visualMap`.
- Add 30-min `slot_summary` view (`SegmentedControl`: Hourly | 30-min).
- Peak/off-peak KPI cards: peak hour, peak share %, headway in peak vs off-peak (define peak from data, not hard-coded).
- Reference lines: average hourly ridership, target headway.

### 7.5 Stops & Map (`src/pages/StopsPage.tsx`)

- Map metric selector (boarding | alighting | net | peak load), legend, fit-to-bounds, cluster toggle, heat-layer toggle, basemap switch.
- Route polylines once `stop_sequence_geo` ships.
- Click a stop -> `Drawer`: stop profile (boarding/alighting by hour, share of route, rank).
- Charts: keep the load profile + stacked BA chart; add `markLine` at vehicle capacity to expose overcrowding, and a horizontal-bar Top-20 boarding stops.
- Table -> `DataTable` (sortable, searchable, CSV, threshold colours on net flow).

### 7.6 Efficiency (`src/pages/EfficiencyPage.tsx`)

- **Fix the known bug:** the route filter is rendered in the header but never passed to this page. Either wire `route`/`routes` through or hide the control for this page.
- Consume `kpi_daily` from the exporter instead of recomputing in JS (removes drift vs the Python source of truth).
- Add EPKM, EPB, vehicle-km, vehicle-km/bus, headway KPI cards with targets + sparklines.
- Each trend spark gets `markAvg` + target line + threshold band.
- Keep radar; add a bullet chart per top route (actual vs target) and a distribution histogram from `trip_distribution`.

### 7.7 Upload (`src/pages/UploadPage.tsx`)

- Keep all job logic untouched (`classifyFile`, FormData POST `/api/jobs`, 2s polling, `onDataLoaded`).
- Presentation only: `Card` wrappers (done), stepper (Select -> Validate -> Process -> Load), per-file validation chips, progress bar during job, `Toast` on success/failure, jobs `DataTable` with status badges and relative timestamps.

### 7.8 New pages

| Page | File | Contents |
|---|---|---|
| **Compare** | `src/pages/ComparePage.tsx` | Period A vs Period B (or route vs route): grouped bars, delta table with % change and colour, "biggest movers" list |
| **Data Quality** | `src/pages/DataQualityPage.tsx` | `meta.dq_rules` / `meta.dq_tables` as a rules table (pass/warn/block), row counts per source table, feature-gate list with plain-English reasons, load status |
| **Definitions** | `src/pages/DefinitionsPage.tsx` | Renders `DEFINITIONS`: metric, formula, unit, target, data source. Linked from every `InfoTip` |

Add these to `navItems` in `App.tsx` under a new `Data` / `Help` section.

#### DECISION REQUIRED before building a Crew page

A **Crew / Conductor** page is listed in Section 6.2 (`crew_summary`) but is **not approved**.
Context the implementer must not lose: a Conductor page previously existed in this app and was
**deliberately deleted** because it was a route-revenue *proxy* — it attributed revenue to conductors
without any conductor identifier in the data, which is misleading to an agency.

The situation has changed: `trip_summary.parquet` genuinely carries `conductor_id` and `driver_id`,
and `feature_gates.conductor_revenue` is `true` for Bhavnagar. So a real, defensible crew view is now
possible. It is still a reversal of an explicit product decision.

**Do not build this page without the user saying yes.** If approved, the constraints are:
- Attribute only from real `conductor_id` / `driver_id` values in `trip_summary`; never infer from route.
- Hide the entire page when `feature_gates.conductor_revenue` is false or IDs are null-dominant
  (define "null-dominant" as >20% missing IDs and surface that as a data-quality warning instead).
- Frame as workload/coverage (trips, ridership, pax-km per crew), not individual performance ranking —
  a revenue leaderboard invites unfair comparison across routes of different demand.
- `driver_speed` gate is `false`, so no speed/safety metrics.

---

## 8. Cross-cutting behaviours

| Behaviour | Where |
|---|---|
| URL-synced filters | `src/lib/filters.ts` + `App.tsx` |
| Saved views | `src/lib/prefs.ts` + `ui/Toolbar.tsx` |
| Cross-filter (click chart -> set filter) | `<Chart onEvent.click>` -> `setFilters` |
| Drill-down (route -> Trends, stop -> Drawer) | page-level handlers |
| Hover sync across charts on a page | `group` prop + `echarts.connect('overview')` |
| Export PNG per chart | `toolboxDefaults()` |
| Export CSV per table | `DataTable exportName` |
| Export whole page to PDF | `@media print` rules in `App.css` + Toolbar "Print" |
| Dark mode | `[data-theme="dark"]` token block in `index.css`; ECharts palette swap in `Chart.tsx`; map style swap in `StopMap.tsx` |
| Density toggle | `[data-density="compact"]` overrides in `ui.css` |
| Skeleton loading | `ui/Skeleton.tsx` replaces `.loading-screen` spinner |
| Stale data warning | compare `meta.generated_at` to now; `Callout` if older than 7 days |
| Keyboard a11y | Tabs (roving tabindex), Modal/Drawer (focus trap, Esc), MultiSelect (Esc/arrows), all controls reachable |
| `aria-live` announcements | filter changes announce "Showing 12 routes, 1-30 April" |
| Reduced motion | `@media (prefers-reduced-motion: reduce)` disables ECharts animation + CSS transitions |
| Error boundary | new `src/components/ErrorBoundary.tsx` wrapping each page so one bad chart cannot blank the app |

---

## 9. Execution plan (ordered, reviewable slices)

Each phase ends with: `npm run check` (encoding fix + `tsc` + `vitest`) = 0, visual check at
`localhost:5173`, and `.\scripts\sync_webapp_local.ps1 -Pull`. Do not start a phase before the
previous one is green.

**Status:** Phase A done (2026-08-05). Phase B done (2026-08-05) with two deliberate deviations:
`DEFAULT_FILTERS.compare` is `prev-period` rather than `none` so KPI deltas exist without
configuration, and `getComparisonRange` returns `ComparisonRange` (`DateRange & { partial }`)
so a window truncated at `date_min` can be labelled instead of silently shortened.
`src/lib/aggregate.ts` was added alongside `filters.ts` because range-based pages need
period aggregation that Section 5 did not specify. Phase C done (2026-08-05): chart helpers,
builders, enhanced `<Chart>` props, units/tooltips/avg-line/PNG toolbox applied across pages;
filter bar gained Avg line / Values switches. Phase D done (2026-08-05): DataTable, Sparkline,
StatCard upgrades, Tabs/Drawer/Modal/Callout/InfoTip/Toast/Skeleton/Toolbar; Routes/Stops/Upload
tables migrated; loading skeleton + toast provider wired. Phase E done (2026-08-05): schema_version 2 export — meta/dq, extended daily+route_trend+temporal+stop_map, kpi_daily, slot/vehicle/crew summaries, trip_distribution bins, stop_sequence_geo; JSON 6.29 MB < 8 MB; types optional. Phase F1 done (2026-08-05): Overview calendar heatmap, revenue donut, top-route drill to Trends, ops from kpi_daily, data-health from meta, prefs LF target. Phase F2 done (2026-08-05): Routes Chart/Table/Compare tabs, horizontal ranking, LF-ridership scatter, drawer, period compare. Phase F3 done (2026-08-05): Trends metric switch, 7-day MA, weekend shading, brush->range, small multiples.

### Phase A — Foundations (no visible change, unblocks everything)
| # | Task | Files |
|---|---|---|
| A1 | Extract `DashboardData` + row types | `src/types.ts` |
| A2 | Split pages out of `App.tsx` verbatim (no behaviour change) | `src/pages/*.tsx`, `src/App.tsx` |
| A3 | Create `format.ts`, `stats.ts`, `definitions.ts`, `prefs.ts` and migrate `fI/fM/fP` call sites | `src/lib/*` |
| A4 | `ErrorBoundary` wrapping page render | `src/components/ErrorBoundary.tsx`, `App.tsx` |
| A5 | **Test harness + unit tests for pure logic** | `vitest.config.ts`, `src/lib/*.test.ts`, `package.json` |
| A6 | `useDashboardData` hook (schema guard, Section 5.8) | `src/lib/useDashboardData.ts`, `App.tsx` |

**A5 detail (highest-leverage task in the whole plan).** `format.ts`, `stats.ts` and `filters.ts` are pure
functions that `tsc` cannot validate — a wrong regression slope or an off-by-one date window is silent.
Install vitest (`npm i -D vitest`), add `"test": "vitest run"` and `"test:watch": "vitest"` to
`package.json`, create `vitest.config.ts` (environment `node`; no jsdom needed for pure modules).

Minimum coverage before Phase A is considered done:

| Module | Cases that must be tested |
|---|---|
| `format.ts` | `fmtInt` en-IN grouping (1234567 -> "12,34,567"); null -> "—"; `fmtMoney` compact lakh/crore boundaries (99999, 100000, 9999999, 10000000); `fmtPct` rounding + 0/1 ratios; `fmtKm`/`fmtMin` dp; `fmtDelta` sign, zero-previous guard (no Infinity), up/down flag |
| `stats.ts` | `movingAverage` window edges (leading nulls, window > length); `linearRegression` on a known line (slope exact), flat series (slope 0), single point (no NaN); `percentile` interpolation at p0/p50/p100; `periodDelta` with empty arrays |
| `filters.ts` | `applyFilters` date-range inclusivity (both ends), empty `routes` = all, hour range, day-of-week; `getComparisonRange` length preservation, month-boundary crossing, clamping at `date_min`, `null` when impossible; URL round-trip (serialize -> parse === original) and unknown-key tolerance |

**Gate:** UI pixel-identical to today; `tsc` clean; `npm test` green. From this phase onward,
**every phase gate is `tsc` + `npm test`**, not `tsc` alone.

### Phase B — Filter system
| # | Task | Files |
|---|---|---|
| B1 | `filters.ts` (FilterState, defaults, `applyFilters`, `activeChips`) | `src/lib/filters.ts` |
| B2 | `DateRangePicker` + presets + compare toggle | `ui/DateRangePicker.tsx` |
| B3 | `MultiSelect`, `Select`, `SegmentedControl`, `Switch`, `CheckboxGroup`, `RangeSlider`, `SearchInput` | `ui/*` |
| B4 | `FilterChips` + Clear all under `PageHeader` | `ui/FilterChips.tsx`, `App.tsx` |
| B5 | `useUrlFilters` hash sync + Reset | `src/lib/filters.ts`, `App.tsx` |
| B6 | Migrate every page from single-date to range (+ fix Trends ignoring dates, fix Efficiency route filter) | `src/pages/*` |

**Gate:** filters visible, shareable via URL, all pages honour them.

### Phase C — Chart infrastructure
| # | Task | Files |
|---|---|---|
| C1 | `markAvg`, `markTarget`, `markBands`, `markExtremes`, `trendSeries` | `components/Chart.tsx` |
| C2 | `zoomDefaults`, `brushDefaults`, `toolboxDefaults`, `valueLabels`, `a11yDecal` | `components/Chart.tsx` |
| C3 | `<Chart>` gains `loading`, `empty`, `group`, `onEvent` | `components/Chart.tsx` |
| C4 | Builders: `donutOption`, `calendarHeatmapOption`, `heatmapMatrixOption`, `scatterOption`, `horizontalBarOption`, `bulletOption` | `components/Chart.tsx` |
| C5 | Apply units + axis names + tooltip formatters everywhere | all pages |

**Gate:** every chart has axis units, a tooltip with units, and (where meaningful) an average line.

### Phase D — Display components
| # | Task | Files |
|---|---|---|
| D1 | `DataTable` (sort, sticky, search, totals, CSV, row click, threshold colours, in-cell bars) | `ui/DataTable.tsx` |
| D2 | Replace the 3 hand-rolled tables | `pages/RoutesPage.tsx`, `pages/StopsPage.tsx`, `pages/UploadPage.tsx` |
| D3 | `Sparkline`, `StatCard` upgrade (spark, target, status, definitionKey, onClick) | `ui/Sparkline.tsx`, `ui/StatCard.tsx` |
| D4 | `Tabs`, `Drawer`, `Modal`, `Callout`, `InfoTip`, `Toolbar`, `Skeleton`, `Toast` | `ui/*` |
| D5 | Skeletons replace the global spinner; empty states get CTAs | `App.tsx`, all pages |

### Phase E — Data expansion (Python)
| # | Task | Files |
|---|---|---|
| E1 | `meta` block (`generated_at`, `schema_version`, dq rules/tables, load_ok) | `scripts/export_phase3_data.py` |
| E2 | Extend `daily` + `route_trend` columns | same |
| E3 | New `kpi_daily` from `etram/metrics/kpis.py::summarize_kpis` | same |
| E4 | New `slot_summary`, `vehicle_summary`, `crew_summary` (gated), `trip_distribution`, `stop_sequence_geo` | same |
| E5 | Payload-size assert + regenerate `webapp/public/data/bhavnagar-dashboard.json` | `python scripts/export_phase3_data.py --agency-id bhavnagar` |
| E6 | Update `src/types.ts` to match schema_version 2 | `src/types.ts` |

**Gate:** JSON parses, size < 8 MB, UI still loads with old and new payloads (guard optional fields).

### Phase F — Page rebuilds

Each task follows the same two-step shape: **(i) parity** — move to the new filter/chart/table
primitives with no visual feature added, verify numbers match the previous build for the same date;
**(ii) enhance** — add the new widgets listed. Never do both in one commit-sized change.

| # | Task | Files | Depends on |
|---|---|---|---|
| F1 | **Overview**: sparkline + target + definition KPIs; calendar heatmap; revenue-share donut; top-routes drill-down; gauge threshold bands; ops snapshot with InfoTips; data-health card reads `meta.generated_at` | `src/pages/OverviewPage.tsx`, `src/App.css` | B, C, D3, E1–E3 |
| F2 | **Routes**: Chart/Table/Compare tabs; horizontal-bar ranking + `markAvg`; LF-vs-ridership scatter (bubble = trips); `DataTable` with in-cell bars and LF threshold colours; row click -> route `Drawer` | `src/pages/RoutesPage.tsx` | C4, D1, D4, E2 |
| F3 | **Trends**: honour the date range (current bug — page ignores it); metric `SegmentedControl`; 7-day moving average; regression trend line; weekend `markArea`; `dataZoom`; brush selection pushes back into the global range; small-multiples grid with shared-scale toggle | `src/pages/TrendsPage.tsx` | B6, C1–C3, E2 (`day_name`) |
| F4 | **Temporal**: hour `RangeSlider` + weekday `CheckboxGroup`; hour×weekday and hour×route heatmaps with `visualMap`; Hourly/30-min granularity switch; peak-vs-offpeak KPIs derived from data (no hard-coded peak windows) | `src/pages/TemporalPage.tsx` | B3, C4, E4 (`slot_summary`) |
| F5 | **Stops**: map metric selector; colour/size legend; fit-to-bounds; cluster + heat-layer toggles; basemap switch; stop click -> `Drawer` profile; capacity `markLine` on the load chart; Top-20 boarding horizontal bar; `DataTable` for the stop table | `src/pages/StopsPage.tsx`, `src/components/StopMap.tsx` | C4, D1, D4, E4 (`stop_sequence_geo` for polylines) |
| F6 | **Efficiency**: fix the route filter being rendered but never passed to the page; consume `kpi_daily` instead of re-deriving in JS; EPKM/EPB/vehicle-km/headway cards with targets + sparks; `markAvg` + target on each spark; bullet chart per top route; trip distribution histogram | `src/pages/EfficiencyPage.tsx` | B6, C1, C4, E3, E4 (`trip_distribution`) |
| F7 | **Upload**: 4-step stepper (Select -> Validate -> Process -> Load); per-file validation chips; job progress bar; success/failure `Toast`; jobs `DataTable` with status badges and relative time. **Job logic untouched** — `classifyFile`, FormData POST `/api/jobs`, 2s polling, `onDataLoaded` | `src/pages/UploadPage.tsx` | D1, D4 |

**Gate per task:** `tsc` + `npm test` green; the same date shows the same numbers as before the rebuild;
no page file exceeds ~400 lines (split a `sections/` subfolder if it does).

### Phase G — New pages
G1 Compare - G2 Data Quality - G3 Definitions - G4 nav entries + breadcrumbs.

### Phase H — Polish
H1 dark mode - H2 density toggle - H3 print/PDF - H4 responsive 768/375 - H5 a11y sweep (aria-live, focus order, decals, reduced motion) -
H6 performance (memoize option builders, lazy-load heavy pages via `React.lazy`, verify < 2s first paint) - H7 saved views - H8 docs update in `docs/phase3-README.md`.

### Minimum viable upgrade (if budget or time is limited)

Do **not** attempt the phases in parallel or skip A. If the full run cannot be completed, this subset
delivers most of the visible value and leaves the codebase in a coherent state:

> **A (all) -> B (all) -> C1–C3 -> E1–E3 -> F1 Overview**

That yields: split codebase with tested pure logic, real date-range + multi-select filtering with URL
state and filter chips, average/target/threshold lines with units on every chart, a `meta` block with
last-updated, Python-sourced KPIs, and a rebuilt Overview (sparkline KPIs, calendar heatmap, donut,
target bars). Everything after that — D, F2–F7, G, H — is enrichment and can land incrementally later.

**Stopping rule:** it is always safe to stop *between* phases (each ends green and synced). It is never
safe to stop mid-Phase-A2 (pages half-extracted) or mid-F-task (parity done, enhance half-applied).

---

## 10. Acceptance criteria

**Functional**
- Date **range** selection with presets and compare-to-previous-period; every page honours it.
- Multi-select routes and directions; hour range; day-of-week; Top-N; metric switcher.
- Active filter chips always visible; Clear all; state survives refresh via URL.
- Average / target / threshold / trend lines available on time-series charts and controlled by toggles.
- Value labels toggle works globally.
- Calendar heatmap, donut, hour heatmap, scatter, horizontal bar, bullet, sparkline all render real data.
- Map: metric selector, legend, clustering, heat layer, fit-to-bounds, stop click -> drawer.
- Every table: sortable, searchable, CSV export, totals, row drill-down.
- Every chart: PNG export, tooltip with units, empty/loading state.
- Definitions reachable from every KPI; Data Quality page reflects `dq_report.json`.

**Quality**
- `npx tsc -b --pretty false` exits 0; no `any` in new code.
- `npm test` green; `format.ts`, `stats.ts`, `filters.ts` covered per the Phase A5 table. Any bug found
  in these modules later gets a failing test before the fix.
- Phase E-dependent widgets degrade cleanly on a `schema_version: 1` payload (gated through `useDashboardData().isV2`).
- No component calls `Intl.NumberFormat` directly (all through `lib/format.ts`).
- No hard-coded hex outside `index.css` tokens and the `Chart.tsx` palette.
- Keyboard: every control reachable, Modal/Drawer trap focus, Esc closes.
- Contrast >= 4.5:1 in light and dark themes.
- First paint < 2s on the existing JSON; filter change < 100ms perceived (memoized options).
- `App.tsx` under 200 lines; no page file over ~400 lines.

**Non-goals for this round**
- Auth / multi-tenant login, server-side aggregation engine, real-time streaming, mobile-first redesign,
  AI-generated narrative insights, alerting/notifications, drag-and-drop dashboard builder.

---

## 11. Risks and mitigations

| Risk | Mitigation |
|---|---|
| UTF-16 corruption from the editor write path | Always write via Python/`WriteAllText`; assert no null bytes after each file |
| `App.tsx` split regressions | Phase A moves code verbatim, verified visually before any enhancement |
| JSON payload bloat from new tables | Aggregate server-side, assert < 8 MB, fall back to `/api` slice endpoints |
| Metric drift (JS-derived vs Python `kpis.py`) | Export `kpi_daily` and consume it; delete JS re-derivations |
| Chart clutter from too many decorations | Default: average line ON, target OFF, value labels OFF; user toggles the rest |
| Feature gates showing empty widgets | Read `feature_gates`; hide (do not render empty) gender/crew widgets when false |
| Crew page repeating the earlier "misleading proxy" mistake | Only build it off real `conductor_id`/`driver_id` from `trip_summary`, gated by `conductor_revenue` |
| G: drive npm failures | All work on `C:\temp\etram-webapp`, sync back with `-Pull` |

---

## 12. Quick reference — what to build, one line each

Filters: date range + calendar + presets + compare, multi-select routes/directions, hour range slider, weekday checkboxes,
metric radio, granularity segmented control, Top-N select, search, filter chips, reset, saved views, URL state.
Charts: donut, calendar heatmap, hour x weekday heatmap, hour x route heatmap, scatter/bubble, horizontal bar ranking,
grouped comparison bars, 100% stacked share, bullet vs target, histogram, sparklines, existing combo/line/gauge/radar/BA.
Decorations: average, median, min/max, target, threshold bands, trend line, moving average, weekend shading, event markers,
value labels, axis units, legend chips, data zoom, brush, toolbox PNG, hover sync, decals.
Cards: hero KPI, spark KPI, target/progress KPI, status accent, definition tip, clickable drill-down, callouts, info boxes.
Tables: sort, sticky header, search, pagination, totals, in-cell bars, threshold colours, CSV, row drawer.
Map: metric switch, legend, clusters, heat layer, polylines, fit bounds, basemap switch, click-to-filter.
States: skeletons, chart loading, empty with CTA, error boundary + retry, stale-data callout, last-updated stamp, toasts.
System: dark mode, density toggle, print/PDF, responsive 768/375, a11y (aria-live, focus traps, reduced motion), definitions page,
data-quality page, compare page, export endpoints.
