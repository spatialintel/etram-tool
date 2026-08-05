# Donezo UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Status:** Done (2026-08-05). Tasks 1–8 implemented; later Phase H prefs live under a Settings popover. Do not re-run this plan.

**Goal:** Rebuild the Transit Performance webapp into a forest-green Donezo-style SaaS UI with a reusable component library, light sidebar, and Overview bento layout using real ETM metrics.

**Architecture:** Introduce `src/components/ui/` primitives styled by CSS tokens in `index.css`. Wire `AppShell` (light sidebar + page header) in `App.tsx`, rewrite `OverviewPage` into a bento grid, then restyle remaining pages onto the same primitives. Work on `C:\temp\etram-webapp`; sync to canonical `webapp/` with `sync_webapp_local.ps1 -Pull`.

**Tech Stack:** React 19, TypeScript, Vite 8, plain CSS, ECharts (`echarts-for-react`), MapLibre GL.

**Spec:** `docs/superpowers/specs/2026-08-05-donezo-ui-redesign.md`

## Global Constraints

- Visual language: forest green Donezo (`--brand: #1B7A4E`, page `#F3F4F6`, white cards, radius 18-20px).
- Light sidebar only (no dark navy chrome).
- Transit analogues only — no fake team/meeting/promo widgets.
- Do not change upload job logic, metrics, or JSON schema.
- Implement/test on `C:\temp\etram-webapp`; sync to G: `webapp/` after tasks that change UI.
- Verification: `npm run check` on `C:\temp\etram-webapp` (encoding + `tsc` + vitest). Visual check at `http://localhost:5173/`.
- Commits: only when the user explicitly asks (do not auto-commit).

---

## File map

| Path | Action | Responsibility |
|------|--------|----------------|
| `webapp/src/index.css` | Modify | Design tokens + base |
| `webapp/src/components/ui/ui.css` | Create | Primitive styles |
| `webapp/src/components/ui/Button.tsx` | Create | Button variants |
| `webapp/src/components/ui/Card.tsx` | Create | Card surface |
| `webapp/src/components/ui/StatCard.tsx` | Create | KPI cards |
| `webapp/src/components/ui/StatusBadge.tsx` | Create | Trend/status pills |
| `webapp/src/components/ui/PageHeader.tsx` | Create | Page title row |
| `webapp/src/components/ui/FilterBar.tsx` | Create | Filter control row |
| `webapp/src/components/ui/ListRow.tsx` | Create | List rows |
| `webapp/src/components/ui/EmptyState.tsx` | Create | Empty copy |
| `webapp/src/components/ui/Sidebar.tsx` | Create | Light nav |
| `webapp/src/components/ui/AppShell.tsx` | Create | Shell composition |
| `webapp/src/components/ui/index.ts` | Create | Barrel exports |
| `webapp/src/components/Chart.tsx` | Modify | Forest chart theme |
| `webapp/src/components/StopMap.tsx` | Modify | Marker color tokens |
| `webapp/src/App.tsx` | Modify | Shell wire + Overview rewrite + page restyle |
| `webapp/src/App.css` | Modify | Bento/page layouts; remove old dark-sidebar KPI chrome |
| `docs/phase3-README.md` | Modify | Note Donezo UI redesign |

Canonical edits land under project `webapp/` after sync; day-to-day edits on `C:\temp\etram-webapp\src\...`.

---

### Task 1: Design tokens

**Files:**
- Modify: `C:\temp\etram-webapp\src\index.css`
- Test: visual + `npx tsc -b` later (tokens only)

**Interfaces:**
- Produces: CSS variables `--brand`, `--brand-soft`, `--brand-mint`, `--bg-page`, `--bg-surface`, `--text-primary`, `--text-muted`, `--border`, `--radius-card` (20px), `--radius-control` (12px), `--shadow-card`, `--sidebar-w` (240px). Keep Source Sans 3 import.

- [x] **Step 1: Replace `:root` tokens** in `index.css` with the forest palette from the spec. Map legacy aliases used by App.css if needed (`--blue` -> brand green for buttons during transition, or update App.css in Task 6). Prefer introducing new names and updating consumers in later tasks.

```css
:root {
  --brand: #1B7A4E;
  --brand-hover: #166640;
  --brand-soft: #E8F7EF;
  --brand-mint: #A8E6C5;
  --bg-page: #F3F4F6;
  --bg-surface: #FFFFFF;
  --bg-sidebar: #FFFFFF;
  --bg-sidebar-hover: #F3F4F6;
  --bg-sidebar-active: #E8F7EF;
  --text-primary: #111827;
  --text-secondary: #374151;
  --text-muted: #6B7280;
  --text-sidebar: #4B5563;
  --text-sidebar-active: #1B7A4E;
  --border: #E5E7EB;
  --border-subtle: #F3F4F6;
  --border-default: #E5E7EB;
  --green: #1B7A4E;
  --green-light: #E8F7EF;
  --amber: #D97706;
  --red: #DC2626;
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.04);
  --shadow-card: 0 1px 2px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.04);
  --radius-card: 20px;
  --radius-control: 12px;
  --radius: 12px;
  --radius-sm: 8px;
  --radius-lg: 20px;
  --sidebar-w: 240px;
  --ease: cubic-bezier(0.4, 0, 0.2, 1);
  /* chart */
  --c1: #1B7A4E;
  --c2: #2F9E6A;
  --c3: #A8E6C5;
  --c4: #374151;
  --c5: #D97706;
  --c6: #DC2626;
}
```

- [x] **Step 2: Keep body** using `var(--bg-page)` and Source Sans 3.

- [x] **Step 3: Verify** file is UTF-8 (not UTF-16). Run: `python -c "print(open(r'C:\\temp\\etram-webapp\\src\\index.css','rb').read(4))"` Expected: starts with `@imp` or `/* ` not `FF FE`.

---

### Task 2: UI primitives (Button, Card, StatCard, StatusBadge, EmptyState, ListRow)

**Files:**
- Create: `C:\temp\etram-webapp\src\components\ui\ui.css`
- Create: `C:\temp\etram-webapp\src\components\ui\Button.tsx`
- Create: `C:\temp\etram-webapp\src\components\ui\Card.tsx`
- Create: `C:\temp\etram-webapp\src\components\ui\StatCard.tsx`
- Create: `C:\temp\etram-webapp\src\components\ui\StatusBadge.tsx`
- Create: `C:\temp\etram-webapp\src\components\ui\EmptyState.tsx`
- Create: `C:\temp\etram-webapp\src\components\ui\ListRow.tsx`
- Create: `C:\temp\etram-webapp\src\components\ui\index.ts` (partial; complete in Task 3)

**Interfaces:**
- Produces:
  - `Button({ variant?: 'primary'|'secondary'|'ghost'; size?: 'md'|'sm'; children, ...buttonProps })`
  - `Card({ title?: string; subtitle?: string; action?: ReactNode; children; className?: string })`
  - `StatCard({ label: string; value: string; sub?: ReactNode; trend?: { up: boolean; label: string }; variant?: 'default'|'primary' })`
  - `StatusBadge({ tone: 'up'|'down'|'neutral'|'warn'; children })`
  - `EmptyState({ children })`
  - `ListRow({ title: string; meta?: string; badge?: ReactNode; leading?: ReactNode })`

- [x] **Step 1: Create `ui.css`** with classes: `.ui-btn`, `.ui-btn-primary`, `.ui-btn-secondary`, `.ui-btn-ghost`, `.ui-card`, `.ui-card-header`, `.ui-card-title`, `.ui-card-subtitle`, `.ui-stat`, `.ui-stat-primary`, `.ui-stat-label`, `.ui-stat-value`, `.ui-stat-sub`, `.ui-badge`, `.ui-badge-up|down|neutral|warn`, `.ui-list-row`, `.ui-empty`.

Primary button: bg `var(--brand)`, white text, radius `var(--radius-control)`.
Stat primary: bg `var(--brand)`, white text/label, soft mint for trend.

- [x] **Step 2: Implement components** as thin wrappers (composition over config). Example `StatCard.tsx`:

```tsx
import type { ReactNode } from 'react'
import { StatusBadge } from './StatusBadge'

export function StatCard({
  label, value, sub, trend, variant = 'default',
}: {
  label: string
  value: string
  sub?: ReactNode
  trend?: { up: boolean; label: string }
  variant?: 'default' | 'primary'
}) {
  return (
    <div className={`ui-stat ${variant === 'primary' ? 'ui-stat-primary' : ''}`}>
      <div className="ui-stat-label">{label}</div>
      <div className="ui-stat-value">{value}</div>
      {trend && (
        <StatusBadge tone={trend.up ? 'up' : 'down'}>{trend.label}</StatusBadge>
      )}
      {sub && <div className="ui-stat-sub">{sub}</div>}
    </div>
  )
}
```

- [x] **Step 3: Export** from `index.ts` what exists so far.

- [x] **Step 4: Typecheck**

Run: `cd C:\temp\etram-webapp; npx tsc -b --pretty false`
Expected: PASS (or only pre-existing App errors unrelated to ui).

---

### Task 3: Shell primitives (PageHeader, FilterBar, Sidebar, AppShell)

**Files:**
- Create: `C:\temp\etram-webapp\src\components\ui\PageHeader.tsx`
- Create: `C:\temp\etram-webapp\src\components\ui\FilterBar.tsx`
- Create: `C:\temp\etram-webapp\src\components\ui\Sidebar.tsx`
- Create: `C:\temp\etram-webapp\src\components\ui\AppShell.tsx`
- Modify: `C:\temp\etram-webapp\src\components\ui\ui.css`
- Modify: `C:\temp\etram-webapp\src\components\ui\index.ts`

**Interfaces:**
- Consumes: Button, Card styles
- Produces:
  - `PageHeader({ title: string; subtitle?: string; actions?: ReactNode })`
  - `FilterBar({ children })`
  - `Sidebar({ agencyName: string; dateMin: string; dateMax: string; page: string; items: { id: string; label: string; section?: string }[]; onNavigate: (id: string) => void })`
  - `AppShell({ sidebar: ReactNode; header: ReactNode; children })`

- [x] **Step 1: Sidebar** — white background, sections `Menu` (overview..efficiency) and `Data` (upload). Active item: soft green pill + brand text. Logo mark uses brand green square + bus SVG (reuse existing SVG paths from App.tsx). Footer: `CRDF · Transit analytics`.

- [x] **Step 2: AppShell** — flex row; sidebar fixed width `var(--sidebar-w)`; main column flex 1 with header + scrollable content.

```tsx
export function AppShell({ sidebar, header, children }: {
  sidebar: React.ReactNode
  header: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="ui-shell">
      {sidebar}
      <div className="ui-shell-main">
        <div className="ui-shell-header">{header}</div>
        <div className="ui-shell-content">{children}</div>
      </div>
    </div>
  )
}
```

- [x] **Step 3: PageHeader + FilterBar** — title left; actions right. FilterBar is a horizontal flex of labeled selects (children).

- [x] **Step 4: Typecheck** `npx tsc -b --pretty false` — Expected: PASS.

---

### Task 4: Wire AppShell into App

**Files:**
- Modify: `C:\temp\etram-webapp\src\App.tsx` (App function ~1253-1369)
- Modify: `C:\temp\etram-webapp\src\App.css` (sidebar/main/top-bar rules — retarget or delete dark styles)
- Modify: `C:\temp\etram-webapp\src\main.tsx` or App import — ensure `components/ui/ui.css` imported once (from `ui/index.ts` or App.tsx)

**Interfaces:**
- Consumes: AppShell, Sidebar, PageHeader, FilterBar, Button
- Produces: Working light shell with existing page bodies unchanged initially

- [x] **Step 1: Import** ui barrel + `./components/ui/ui.css`.

- [x] **Step 2: Replace** outer `app-shell` / `sidebar` / `main-content` markup with:

```tsx
const pageTitles: Record<Page, { title: string; subtitle: string }> = {
  overview: { title: 'Overview', subtitle: 'Daily service performance snapshot' },
  routes: { title: 'Route Performance', subtitle: 'Compare routes for the selected day' },
  trends: { title: 'Route Trends', subtitle: 'Multi-day route trajectories' },
  temporal: { title: 'Temporal Analysis', subtitle: 'Hourly demand patterns' },
  stops: { title: 'Stops & Map', subtitle: 'Boarding, alighting, and load by stop' },
  efficiency: { title: 'Efficiency', subtitle: 'Productivity and yield indicators' },
  upload: { title: 'Upload Data', subtitle: 'Ingest ETM, supporting, and stop-sequence files' },
}

const navItems = [
  { id: 'overview', label: 'Overview', section: 'Menu' },
  { id: 'routes', label: 'Route Performance', section: 'Menu' },
  { id: 'trends', label: 'Route Trends', section: 'Menu' },
  { id: 'temporal', label: 'Temporal Analysis', section: 'Menu' },
  { id: 'stops', label: 'Stops & Map', section: 'Menu' },
  { id: 'efficiency', label: 'Efficiency', section: 'Menu' },
  { id: 'upload', label: 'Upload Data', section: 'Data' },
]
```

Header actions: agency chip, date range text, `<Button variant="primary" onClick={() => setPage('upload')}>Upload Data</Button>`, plus existing date/route/direction selects inside `FilterBar` when not on upload.

- [x] **Step 3: Visual check** — light sidebar, green active, pages still render.

- [x] **Step 4: Typecheck** PASS.

---

### Task 5: Rewrite OverviewPage bento

**Files:**
- Modify: `C:\temp\etram-webapp\src\App.tsx` (`OverviewPage` ~lines 100-325)
- Modify: `C:\temp\etram-webapp\src\App.css` (add `.bento-kpi`, `.bento-mid`, `.bento-bottom` grids)
- Modify: `C:\temp\etram-webapp\src\components\Chart.tsx` (forest COLORS if not done in Task 7)

**Interfaces:**
- Consumes: StatCard, Card, StatusBadge, ListRow, Button, Chart
- Produces: Overview layout per spec (4 KPIs, bars+gauge, top routes, ops snapshot, data health)

- [x] **Step 1: KPI row** — only four StatCards: ridership (`variant="primary"` + trend), revenue (+ trend), LF, trips. Remove second KPI grid from Overview.

- [x] **Step 2: Mid row** — Card with ridership bars (reuse weekly toggle; prefer ridership-focused series; keep revenue as secondary series or drop to match Donezo single-metric bars — keep both series if already working, green palette). Adjacent Card with **LF gauge**:

```tsx
const gaugeOpt: EChartsOption = {
  series: [{
    type: 'gauge',
    startAngle: 180,
    endAngle: 0,
    min: 0,
    max: 100,
    radius: '100%',
    center: ['50%', '70%'],
    progress: { show: true, width: 18 },
    axisLine: { lineStyle: { width: 18, color: [[1, '#E5E7EB']] } },
    pointer: { show: false },
    axisTick: { show: false },
    splitLine: { show: false },
    axisLabel: { show: false },
    detail: { valueAnimation: true, formatter: '{value}%', fontSize: 28, offsetCenter: [0, '-10%'], color: '#111827' },
    data: [{ value: Math.round(avgLF * 100), name: 'Period avg LF' }],
    itemStyle: { color: '#1B7A4E' },
    title: { offsetCenter: [0, '20%'], color: '#6B7280', fontSize: 12 },
  }],
}
```

- [x] **Step 3: Bottom row** — Top routes: aggregate `route_trend` (or route rows for selected date from same logic as RoutePerformancePage) top 5 by ridership; `ListRow` + badge with share %. Ops snapshot: ATL, fare yield, trips/bus, riders/trip as compact definition list inside Card. Data health: `date_min`–`date_max`, `daily.length`, count of true `feature_gates`, Button to upload (`optional` — Overview can call `onNavigate?.('upload')` or keep linkless CTA that documents upload path; prefer pass `onUploadClick` prop from App).

- [x] **Step 4: Remove** LF trend + trips/buses charts from Overview (moved conceptually into gauge + ops; full charts remain on other pages).

- [x] **Step 5: Visual + typecheck**.

---

### Task 6: Restyle remaining pages

**Files:**
- Modify: `C:\temp\etram-webapp\src\App.tsx` (RoutePerformancePage, RouteTrendsPage, TemporalPage, StopsMapPage, EfficiencyPage, UploadPage)
- Modify: `C:\temp\etram-webapp\src\App.css`

**Interfaces:**
- Consumes: Card, StatCard, Page-local filters already in shell FilterBar, EmptyState, Button
- Produces: Same metrics/charts; `.chart-panel` replaced by `<Card>` wrappers

- [x] **Step 1: Routes / Trends / Temporal / Efficiency** — replace `kpi-card` / `chart-panel` with StatCard/Card. Keep chart options; only markup/CSS.

- [x] **Step 2: Stops** — wrap StopMap and BA charts in Cards.

- [x] **Step 3: Upload** — wrap dropzone and slots in Cards; primary submit uses `<Button variant="primary">`. Do not change `classifyFile`, job polling, or FormData fields.

- [x] **Step 4: Delete obsolete CSS** for dark sidebar accent bars / old kpi-card-accent where unused.

- [x] **Step 5: Typecheck + click through all nav pages**.

---

### Task 7: Chart + map theme alignment

**Files:**
- Modify: `C:\temp\etram-webapp\src\components\Chart.tsx`
- Modify: `C:\temp\etram-webapp\src\components\StopMap.tsx`

**Interfaces:**
- Produces: `COLORS = ['#1B7A4E','#2F9E6A','#A8E6C5','#374151','#D97706','#DC2626', ...]`
- StopMap markerColor: net>0 brand green, net<0 red, else amber

- [x] **Step 1: Update COLORS and tooltip** to dark charcoal `#111827` background (not old navy).

- [x] **Step 2: Bar `itemStyle.borderRadius` default hint in docs — set per-series in Overview bars `[8,8,0,0]`.

- [x] **Step 3: Typecheck PASS.

---

### Task 8: Sync, docs, final verify

**Files:**
- Modify: `docs/phase3-README.md`
- Run: `scripts/sync_webapp_local.ps1 -Pull`

- [x] **Step 1: Sync** from C: mirror to G: canonical:

```powershell
& ".\scripts\sync_webapp_local.ps1" -Pull
```

(from project root)

- [x] **Step 2: Update phase3-README** — note Donezo-style UI, light sidebar, ui/ components path.

- [x] **Step 3: Final verify**
  - `cd C:\temp\etram-webapp; npx tsc -b --pretty false` → exit 0
  - Hard refresh Vite; Overview shows inverted ridership KPI, gauge, top routes, ops, data health
  - Upload still creates jobs when API is up
  - No Plotly references; no dark sidebar

- [x] **Step 4: Commit** only if user asks.

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| Forest tokens | 1 |
| UI component library | 2-3 |
| Light sidebar + header Upload CTA | 3-4 |
| Overview bento + analogues | 5 |
| Other pages card system | 6 |
| ECharts/MapLibre theme | 7 |
| Sync + docs | 8 |
| No fake widgets / no schema change | All (constraints) |

## Placeholder / consistency self-review

- No TBD steps; StatCard/AppShell signatures consistent across tasks.
- `onUploadClick` for Overview data-health CTA must be wired in Task 5 from App (`() => setPage('upload')`).
- Work path always `C:\temp\etram-webapp` then `-Pull`.