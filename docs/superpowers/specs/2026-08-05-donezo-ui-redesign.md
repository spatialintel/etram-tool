# Donezo-style UI redesign - Transit Performance

**Date:** 2026-08-05
**Status:** Draft for review
**Scope:** Frontend only (webapp / C:\temp\etram-webapp run mirror)
**Out of scope:** Auth, metrics/schema changes, Railway deploy, dark mode

## Decisions (locked)

| Topic | Choice |
|-------|--------|
| Visual language | A - Forest green Donezo SaaS |
| Depth | 3 - Full redesign + Overview layout rewrite |
| Sidebar | 1 - Light sidebar |
| Bento widgets | 2 - Transit analogues only (no fake CRM widgets) |
| Implementation approach | 3 - Extract UI component library, then rebuild shell + pages |

## Goals

- Stakeholder-ready look: soft cards, light nav, green accent, clear hierarchy.
- Overview reads as a Donezo-like bento dashboard using real ETM metrics.
- Consistent card / button / filter system on all pages.
- Keep ECharts + MapLibre; update chart theme to forest palette.
- No decorative placeholders (team lists, meeting cards, app promo).

## Non-goals

- Pixel-perfect clone of Donezo (different product domain).
- New backend fields or fake alerts without data basis.
- Mobile-first redesign (desktop-first; usable on tablet).

## Visual system

### Color

| Token | Value | Use |
|-------|-------|-----|
| --brand | #1B7A4E | Primary buttons, active nav, inverted StatCard |
| --brand-soft | #E8F7EF | Active nav pill bg, tints |
| --brand-mint | #A8E6C5 | Chart secondary / soft fills |
| --bg-page | #F3F4F6 | App canvas |
| --bg-surface | #FFFFFF | Cards |
| --text-primary | #111827 | Titles, KPI values |
| --text-muted | #6B7280 | Subtitles, meta |
| --border | #E5E7EB | Light borders |
| Semantic up / down / warn | green / red / amber | Trends, badges |

### Typography

- Font: Source Sans 3 (already loaded).
- Page title: 24-28px / 700.
- Card title: 14px / 600.
- KPI value: 28-32px / 700, tabular nums where practical.
- Meta / subtitle: 12-13px / 400-500, muted.

### Shape and depth

- Card radius: 18-20px.
- Control radius: 12px.
- Shadow: soft dual-layer (0 1px 2px + 0 8px 24px at ~4% black). No glow stacks.
- Sidebar width: ~240px fixed.

### Charts (ECharts)

- Palette centered on forest greens + charcoal secondary.
- Rounded bar caps; faint grid; no bar text labels.
- LF presented as semi-circle gauge on Overview (period avg %).
- Chart.tsx theme tokens updated to match brand.

## Architecture

### New UI primitives (webapp/src/components/ui/)

| Component | Responsibility |
|-----------|----------------|
| AppShell | Composes sidebar + header + main |
| Sidebar / NavItem | Light nav; active soft-green pill; gated state |
| PageHeader | Title, subtitle, right action slot |
| Card | Surface with optional header/body |
| StatCard | KPI; variants default or primary (inverted) |
| StatusBadge | up / down / neutral / warn |
| Button | primary / secondary / ghost |
| FilterBar | Date / route / direction controls wrapper |
| ListRow | Icon + title + meta + optional badge |
| EmptyState | Empty / no-data copy |

### Keep / adapt

- components/Chart.tsx - theme only.
- components/StopMap.tsx - marker colors aligned to brand/semantic.
- Upload job logic in App.tsx - behavior unchanged; markup restyled.

### CSS strategy

- Tokens in index.css (:root).
- Primitive styles in components/ui/ui.css.
- Slim down App.css to page-specific layout (bento grids, upload slots).
- Avoid Tailwind for this pass (current stack is plain CSS).

## Shell

- Light sidebar: white / near-white; muted section labels; green active.
- Header actions: agency label, date-range chip, primary Upload CTA.
- No avatar/notification chrome (out of scope).

## Overview bento (transit analogues)

```
[ PageHeader ]

[ StatCard primary: Daily Ridership + trend ]
[ StatCard: Revenue + trend ]
[ StatCard: Load Factor ]
[ StatCard: Service Trips ]

[ Card: Daily/Weekly ridership bars + weekly toggle ]   [ Card: LF gauge ]

[ Card: Top routes ListRows + share badges ]
[ Card: Ops snapshot - ATL, fare yield, trips/bus, riders/trip ]
[ Card: Data health - range, day count, feature gates summary, CTA Upload ]
```

### Mapping from Donezo reference

| Donezo widget | E-TRAM analogue |
|---------------|-----------------|
| Inverted KPI | Daily ridership (primary StatCard) |
| Other KPIs | Revenue, LF, Trips |
| Weekly bar chart | Ridership (daily/weekly toggle) |
| Progress gauge | Period average load factor |
| Team list | Top routes by ridership |
| Project list / reminders | Ops snapshot metrics |
| Mobile promo | Data health + Upload CTA |

### Explicit exclusions

- Fake team members, meetings, time-tracker art.
- Second full KPI row on Overview (secondary metrics live in Ops snapshot).

## Other pages

| Page | Treatment |
|------|-----------|
| Route Performance | PageHeader + FilterBar + Card-wrapped charts/KPIs |
| Route Trends | Same card system; existing series logic |
| Temporal Analysis | Same |
| Stops and Map | Large Card for MapLibre; BA/load in side Cards |
| Efficiency | Card grid for sparks/radar |
| Upload Data | Soft Cards for dropzone/slots; Button primitives; logic unchanged |

## Delivery order

1. Design tokens (index.css) + ui/ primitives.
2. Wire AppShell / light Sidebar / PageHeader.
3. Rewrite Overview bento.
4. Restyle remaining pages onto Cards/FilterBar/Buttons.
5. Align Chart + StopMap colors; typecheck; sync G: webapp via sync_webapp_local.ps1 -Pull.

## Success criteria

- Overview visually reads as Donezo-class SaaS (light nav, soft cards, one inverted KPI, gauge + list panels) without fake data.
- All existing pages usable with same visual language.
- npx tsc -b clean; Vite runs from C:\temp\etram-webapp.
- Metrics/values unchanged vs pre-redesign for the same JSON.

## Risks

- App.tsx is large - extract page components only if needed; prefer ui primitives + Overview rewrite first.
- G: drive npm issues - implement/test on C:\temp\etram-webapp, sync back with -Pull.
- Over-carding secondary pages - keep density; do not add empty decorative panels.

## Open items (none blocking)

- Exact SVG icon set for nav (simple inline SVGs; no icon library required).
- Whether StatCard primary is always ridership or user-selectable later (v1: fixed ridership).
