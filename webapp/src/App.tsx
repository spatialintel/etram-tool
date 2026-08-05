import { useEffect, useMemo, useState } from 'react'
import Plot from 'react-plotly.js'
import './App.css'

/* ═══════════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════════ */

interface DashboardData {
  agency: {
    agency_id: string
    agency_name: string
    date_min: string
    date_max: string
    routes: string[]
    route_directions: string[]
  }
  feature_gates: Record<string, boolean>
  daily: {
    service_date: string
    ridership: number
    revenue: number
    pax_km: number
    capacity_km: number
    trips: number
    buses: number
    lf: number
  }[]
  route_trend: {
    service_date: string
    route_code: string
    ridership: number
    revenue: number
    load_factor_route: number
    n_trips: number
    n_buses: number
  }[]
  temporal: {
    service_date: string
    route_code: string
    start_hour: number
    ridership: number
    revenue: number
    trips: number
  }[]
  stop_map: {
    service_date: string
    route_direction_key: string
    stop_abbr: string
    stop_name: string
    boarding: number
    alighting: number
    peak_load: number
    latitude: number
    longitude: number
  }[]
  ba_line_best_trip: {
    service_date: string
    route_direction_key: string
    bus_trip_key: string
    stop_no: number
    stop_name: string
    boarding: number
    alighting: number
    passenger_load: number
  }[]
}

type Page = 'overview' | 'routes' | 'trends' | 'temporal' | 'stops' | 'efficiency' | 'upload'

/* ═══════════════════════════════════════════════════════════════
   Constants & Helpers
   ═══════════════════════════════════════════════════════════════ */

const COLORS = [
  '#0b3d5c', '#0891b2', '#059669', '#d97706', '#dc2626',
  '#7c3aed', '#0f766e', '#b45309', '#4338ca', '#0369a1',
]

const NAV: { id: Page; label: string }[] = [
  { id: 'overview',   label: 'Overview' },
  { id: 'routes',     label: 'Route Performance' },
  { id: 'trends',     label: 'Route Trends' },
  { id: 'temporal',   label: 'Temporal Analysis' },
  { id: 'stops',      label: 'Stops & Map' },
  { id: 'efficiency', label: 'Efficiency' },
  { id: 'upload',     label: 'Upload Data' },
]

const lightAx: Record<string, unknown> = {
  gridcolor: '#edf0f5',
  linecolor: '#dde1ea',
  tickfont: { color: '#6b7280', size: 11 },
  zerolinecolor: '#dde1ea',
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pLayout(overrides: Record<string, any> = {}): Record<string, any> {
  return {
    paper_bgcolor: 'transparent',
    plot_bgcolor:  'transparent',
    font: { color: '#374151', family: 'Source Sans 3, sans-serif', size: 12 },
    xaxis: { ...lightAx, ...(overrides.xaxis || {}) },
    yaxis: { ...lightAx, ...(overrides.yaxis || {}) },
    margin: { l: 56, r: 32, t: 20, b: 44 },
    legend: { font: { color: '#6b7280', size: 11 }, bgcolor: 'transparent', orientation: 'h', y: -0.18 },
    hoverlabel: { bgcolor: '#1a2744', bordercolor: '#273557', font: { color: '#f1f5f9', family: 'Source Sans 3', size: 12 } },
    ...overrides,
  }
}

const pCfg: Record<string, unknown> = { displayModeBar: false, responsive: true }

const fI = (n: number) => Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n)
const fM = (n: number) => '₹' + fI(Math.round(n))
const fP = (n: number | null | undefined) => n != null ? (n * 100).toFixed(1) + '%' : '—'

const EXCEL_RE = /\.(xlsx|xls)$/i
const MAX_FILE = 50 * 1024 * 1024

/** Validates an Excel file — returns an error string or null. */
function validateExcelFile(file: File): string | null {
  if (!EXCEL_RE.test(file.name)) return `${file.name}: only .xlsx or .xls files are allowed`
  if (file.size === 0) return `${file.name}: file is empty (0 bytes)`
  if (file.size > MAX_FILE) return `${file.name}: exceeds 50 MB limit`
  return null
}

/* ═══════════════════════════════════════════════════════════════
   Overview Page
   ═══════════════════════════════════════════════════════════════ */

function OverviewPage({ data, date }: { data: DashboardData; date: string }) {
  const today = data.daily.find(d => d.service_date === date)
  const idx = data.daily.findIndex(d => d.service_date === date)
  const prev = idx > 0 ? data.daily[idx - 1] : null
  const [weeklyView, setWeeklyView] = useState(false)

  const pctDelta = (cur: number, old: number | undefined) => {
    if (old == null || old === 0) return null
    const p = ((cur - old) / old) * 100
    return { pct: p, up: p >= 0 }
  }

  const totalR = data.daily.reduce((s, d) => s + d.ridership, 0)
  const totalRev = data.daily.reduce((s, d) => s + d.revenue, 0)
  const avgLF = data.daily.reduce((s, d) => s + (d.lf || 0), 0) / (data.daily.length || 1)
  const totalPaxKm = data.daily.reduce((s, d) => s + d.pax_km, 0)

  // Weekly roll-up
  const weeklyData = useMemo(() => {
    const wMap = new Map<string, { ridership: number; revenue: number; pax_km: number; capacity_km: number; days: number }>()
    for (const d of data.daily) {
      const dt = new Date(d.service_date)
      const y = dt.getFullYear()
      const wn = Math.ceil(((dt.getTime() - new Date(y, 0, 1).getTime()) / 86400000 + new Date(y, 0, 1).getDay() + 1) / 7)
      const key = `W${String(wn).padStart(2, '0')}`
      const e = wMap.get(key) || { ridership: 0, revenue: 0, pax_km: 0, capacity_km: 0, days: 0 }
      e.ridership += d.ridership; e.revenue += d.revenue
      e.pax_km += d.pax_km; e.capacity_km += d.capacity_km; e.days += 1
      wMap.set(key, e)
    }
    return [...wMap.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([w, v]) => ({ week: w, ...v, lf: v.pax_km / v.capacity_km }))
  }, [data])

  if (!today) return <div className="page"><div className="empty-state">No data for selected date.</div></div>

  const rT = pctDelta(today.ridership, prev?.ridership)
  const revT = pctDelta(today.revenue, prev?.revenue)
  const todayATL = today.ridership > 0 ? today.pax_km / today.ridership : 0
  const todayFareYield = today.ridership > 0 ? today.revenue / today.ridership : 0
  const periodATL = totalR > 0 ? totalPaxKm / totalR : 0

  return (
    <div className="page">
      {/* KPI Cards — Row 1: operational */}
      <div className="kpi-grid">
        <div className="kpi-card" style={{ '--card-accent': '#0b3d5c' } as React.CSSProperties}>
          <div className="kpi-card-accent" />
          <div className="kpi-label">Daily Ridership</div>
          <div className="kpi-value">{fI(today.ridership)}</div>
          {rT && <div className={`kpi-trend ${rT.up ? 'up' : 'down'}`}>{rT.up ? '▲' : '▼'} {Math.abs(rT.pct).toFixed(1)}% vs prior day</div>}
        </div>
        <div className="kpi-card" style={{ '--card-accent': '#0891b2' } as React.CSSProperties}>
          <div className="kpi-card-accent" />
          <div className="kpi-label">Daily Revenue</div>
          <div className="kpi-value">{fM(today.revenue)}</div>
          {revT && <div className={`kpi-trend ${revT.up ? 'up' : 'down'}`}>{revT.up ? '▲' : '▼'} {Math.abs(revT.pct).toFixed(1)}% vs prior day</div>}
        </div>
        <div className="kpi-card" style={{ '--card-accent': '#059669' } as React.CSSProperties}>
          <div className="kpi-card-accent" />
          <div className="kpi-label">Load Factor</div>
          <div className="kpi-value">{fP(today.lf)}</div>
          <div className="kpi-sub">Pax-km / Capacity-km</div>
        </div>
        <div className="kpi-card" style={{ '--card-accent': '#d97706' } as React.CSSProperties}>
          <div className="kpi-card-accent" />
          <div className="kpi-label">Service Trips</div>
          <div className="kpi-value">{fI(today.trips)}</div>
          <div className="kpi-sub">{fI(today.buses)} buses deployed</div>
        </div>
        <div className="kpi-card" style={{ '--card-accent': '#7c3aed' } as React.CSSProperties}>
          <div className="kpi-card-accent" />
          <div className="kpi-label">Period Ridership</div>
          <div className="kpi-value">{fI(totalR)}</div>
          <div className="kpi-sub">{fM(totalRev)} total revenue</div>
        </div>
      </div>

      {/* KPI Cards — Row 2: derived efficiency */}
      <div className="kpi-grid">
        <div className="kpi-card" style={{ '--card-accent': '#dc2626' } as React.CSSProperties}>
          <div className="kpi-card-accent" />
          <div className="kpi-label">Avg Trip Length (ATL)</div>
          <div className="kpi-value">{todayATL.toFixed(2)} km</div>
          <div className="kpi-sub">Pax-km / Ridership &nbsp;&middot;&nbsp; Period avg {periodATL.toFixed(2)} km</div>
        </div>
        <div className="kpi-card" style={{ '--card-accent': '#0f766e' } as React.CSSProperties}>
          <div className="kpi-card-accent" />
          <div className="kpi-label">Fare Yield</div>
          <div className="kpi-value">&#8377;{todayFareYield.toFixed(2)}</div>
          <div className="kpi-sub">Revenue per passenger</div>
        </div>
        <div className="kpi-card" style={{ '--card-accent': '#b45309' } as React.CSSProperties}>
          <div className="kpi-card-accent" />
          <div className="kpi-label">Trips per Bus</div>
          <div className="kpi-value">{today.buses > 0 ? (today.trips / today.buses).toFixed(1) : '—'}</div>
          <div className="kpi-sub">Bus utilisation ratio</div>
        </div>
        <div className="kpi-card" style={{ '--card-accent': '#4338ca' } as React.CSSProperties}>
          <div className="kpi-card-accent" />
          <div className="kpi-label">Riders per Trip</div>
          <div className="kpi-value">{today.trips > 0 ? (today.ridership / today.trips).toFixed(1) : '—'}</div>
          <div className="kpi-sub">Avg occupancy per service trip</div>
        </div>
        <div className="kpi-card" style={{ '--card-accent': '#059669' } as React.CSSProperties}>
          <div className="kpi-card-accent" />
          <div className="kpi-label">Period Avg LF</div>
          <div className="kpi-value">{fP(avgLF)}</div>
          <div className="kpi-sub">Across all {data.daily.length} service days</div>
        </div>
      </div>

      {/* Daily / Weekly Ridership & Revenue Combo Chart */}

      <div className="chart-panel">
        <div className="chart-header">
          <div>
            <div className="chart-title">{weeklyView ? 'Weekly' : 'Daily'} Ridership & Revenue</div>
            <div className="chart-subtitle">{weeklyView ? 'Aggregated by ISO week — all routes combined' : 'All service dates — marker indicates selected date'}</div>
          </div>
          <button
            className={`toggle-btn ${weeklyView ? 'active' : ''}`}
            onClick={() => setWeeklyView(v => !v)}
          >
            {weeklyView ? 'Daily View' : 'Weekly View'}
          </button>
        </div>
        <Plot
          data={weeklyView ? [
            {
              x: weeklyData.map(w => w.week),
              y: weeklyData.map(w => w.ridership),
              type: 'bar' as const,
              name: 'Ridership',
              marker: { color: '#0b3d5c', opacity: 0.85 },
            },
            {
              x: weeklyData.map(w => w.week),
              y: weeklyData.map(w => w.revenue),
              type: 'scatter' as const,
              mode: 'lines+markers' as const,
              name: 'Revenue (INR)',
              yaxis: 'y2',
              line: { color: '#0891b2', width: 2 },
              marker: { size: 6, color: '#0891b2' },
            },
          ] : [
            {
              x: data.daily.map(d => d.service_date),
              y: data.daily.map(d => d.ridership),
              type: 'bar' as const,
              name: 'Ridership',
              marker: { color: '#0b3d5c', opacity: 0.8 },
            },
            {
              x: data.daily.map(d => d.service_date),
              y: data.daily.map(d => d.revenue),
              type: 'scatter' as const,
              mode: 'lines+markers' as const,
              name: 'Revenue (INR)',
              yaxis: 'y2',
              line: { color: '#0891b2', width: 2 },
              marker: { size: 4, color: '#0891b2' },
            },
          ]}
          layout={pLayout({
            height: 380,
            yaxis: { ...lightAx, title: { text: 'Ridership', font: { color: '#6b7280', size: 11 } } },
            yaxis2: { ...lightAx, title: { text: 'Revenue (₹)', font: { color: '#6b7280', size: 11 } }, overlaying: 'y', side: 'right' },
            ...(weeklyView ? {} : {
              shapes: [{ type: 'line', x0: date, x1: date, y0: 0, y1: 1, yref: 'paper', line: { color: '#f59e0b', width: 1.5, dash: 'dot' } }],
              annotations: [{ x: date, y: 1.03, yref: 'paper', text: '▾ Selected', showarrow: false, font: { color: '#f59e0b', size: 10 } }],
            }),
          })}
          style={{ width: '100%' }}
          config={pCfg}
          useResizeHandler
        />
      </div>

      {/* Bottom row: LF Trend + Trips/Buses */}
      <div className="charts-row">
        <div className="chart-panel">
          <div className="chart-header"><div className="chart-title">Load Factor Trend</div></div>
          <Plot
            data={[{
              x: data.daily.map(d => d.service_date),
              y: data.daily.map(d => (d.lf || 0) * 100),
              type: 'scatter' as const,
              mode: 'lines+markers' as const,
              fill: 'tozeroy',
              fillcolor: 'rgba(16,185,129,0.06)',
              line: { color: '#10b981', width: 2.5 },
              marker: { size: 3, color: '#10b981' },
              name: 'LF %',
            }]}
            layout={pLayout({
              height: 250,
              yaxis: { ...lightAx, title: { text: 'Load Factor %', font: { color: '#6b7280', size: 11 } } },
            })}
            style={{ width: '100%' }}
            config={pCfg}
            useResizeHandler
          />
        </div>

        <div className="chart-panel">
          <div className="chart-header"><div className="chart-title">Trips & Buses</div></div>
          <Plot
            data={[
              { x: data.daily.map(d => d.service_date), y: data.daily.map(d => d.trips), type: 'bar' as const, name: 'Trips', marker: { color: '#f59e0b', opacity: 0.7 } },
              { x: data.daily.map(d => d.service_date), y: data.daily.map(d => d.buses), type: 'scatter' as const, mode: 'lines+markers' as const, name: 'Buses', line: { color: '#f43f5e', width: 2 }, marker: { size: 4, color: '#f43f5e' } },
            ]}
            layout={pLayout({ height: 250, yaxis: { ...lightAx, title: { text: 'Count', font: { color: '#6b7280', size: 11 } } } })}
            style={{ width: '100%' }}
            config={pCfg}
            useResizeHandler
          />
        </div>
      </div>

    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   Route Performance Page (single-day drill-down)
   ═══════════════════════════════════════════════════════════════ */

function RoutePerformancePage({ data, date, route }: { data: DashboardData; date: string; route: string }) {
  const rows = useMemo(() =>
    data.route_trend
      .filter(r => r.service_date === date && (route === 'ALL' || r.route_code === route))
      .sort((a, b) => b.ridership - a.ridership),
    [data, date, route],
  )

  const tot = useMemo(() => ({
    ridership: rows.reduce((s, r) => s + r.ridership, 0),
    revenue: rows.reduce((s, r) => s + r.revenue, 0),
    trips: rows.reduce((s, r) => s + r.n_trips, 0),
    buses: rows.reduce((s, r) => s + r.n_buses, 0),
  }), [rows])

  return (
    <div className="page">
      <div className="kpi-grid">
        <div className="kpi-card" style={{ '--card-accent': '#6366f1' } as React.CSSProperties}>
          <div className="kpi-label">Ridership</div>
          <div className="kpi-value">{fI(tot.ridership)}</div>
        </div>
        <div className="kpi-card" style={{ '--card-accent': '#22d3ee' } as React.CSSProperties}>
          <div className="kpi-label">Revenue</div>
          <div className="kpi-value">{fM(tot.revenue)}</div>
        </div>
        <div className="kpi-card" style={{ '--card-accent': '#10b981' } as React.CSSProperties}>
          <div className="kpi-label">Active Routes</div>
          <div className="kpi-value">{rows.length}</div>
        </div>
        <div className="kpi-card" style={{ '--card-accent': '#f59e0b' } as React.CSSProperties}>
          <div className="kpi-label">Trips / Buses</div>
          <div className="kpi-value">{fI(tot.trips)}</div>
          <div className="kpi-sub">{fI(tot.buses)} buses</div>
        </div>
      </div>

      {/* Ridership + LF chart */}
      <div className="chart-panel">
        <div className="chart-header">
          <div>
            <div className="chart-title">Ridership & Load Factor by Route</div>
            <div className="chart-subtitle">{date}</div>
          </div>
        </div>
        <Plot
          data={[
            {
              x: rows.map(r => r.route_code),
              y: rows.map(r => r.ridership),
              type: 'bar' as const,
              name: 'Ridership',
              marker: { color: rows.map((_, i) => COLORS[i % COLORS.length]), opacity: 0.85 },
            },
            {
              x: rows.map(r => r.route_code),
              y: rows.map(r => (r.load_factor_route || 0) * 100),
              type: 'scatter' as const,
              mode: 'lines+markers' as const,
              name: 'Load Factor %',
              yaxis: 'y2',
              line: { color: '#f59e0b', width: 2.5 },
              marker: { size: 7, color: '#f59e0b' },
            },
          ]}
          layout={pLayout({
            height: 400,
            xaxis: { ...lightAx, title: { text: 'Route', font: { color: '#6b7280', size: 11 } }, tickangle: -45 },
            yaxis: { ...lightAx, title: { text: 'Ridership', font: { color: '#6b7280', size: 11 } } },
            yaxis2: { ...lightAx, title: { text: 'LF %', font: { color: '#6b7280', size: 11 } }, overlaying: 'y', side: 'right' },
          })}
          style={{ width: '100%' }}
          config={pCfg}
          useResizeHandler
        />
      </div>

      {/* Revenue chart */}
      <div className="chart-panel">
        <div className="chart-header"><div className="chart-title">Revenue by Route</div></div>
        <Plot
          data={[{
            x: rows.map(r => r.route_code),
            y: rows.map(r => r.revenue),
            type: 'bar' as const,
            name: 'Revenue',
            marker: { color: rows.map((_, i) => COLORS[(i + 1) % COLORS.length]), opacity: 0.8 },
          }]}
          layout={pLayout({
            height: 300,
            xaxis: { ...lightAx, tickangle: -45 },
            yaxis: { ...lightAx, title: { text: 'Revenue (₹)', font: { color: '#6b7280', size: 11 } } },
          })}
          style={{ width: '100%' }}
          config={pCfg}
          useResizeHandler
        />
      </div>

      {/* Data table — expanded with efficiency metrics */}
      <div className="chart-panel">
        <div className="chart-header"><div className="chart-title">Route Detail Table — Full Metrics</div></div>
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Route</th>
                <th>Ridership</th>
                <th>Revenue</th>
                <th>LF %</th>
                <th>Trips</th>
                <th>Buses</th>
                <th>Riders/Trip</th>
                <th>Rev/Trip</th>
                <th>Rev/Bus</th>
                <th>Fare Yield</th>
                <th>Trips/Bus</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.route_code}>
                  <td><strong>{r.route_code}</strong></td>
                  <td className="num">{fI(r.ridership)}</td>
                  <td className="num">{fM(r.revenue)}</td>
                  <td className="num">{fP(r.load_factor_route)}</td>
                  <td className="num">{fI(r.n_trips)}</td>
                  <td className="num">{fI(r.n_buses)}</td>
                  <td className="num">{r.n_trips > 0 ? (r.ridership / r.n_trips).toFixed(1) : '—'}</td>
                  <td className="num">{r.n_trips > 0 ? fM(r.revenue / r.n_trips) : '—'}</td>
                  <td className="num">{r.n_buses > 0 ? fM(r.revenue / r.n_buses) : '—'}</td>
                  <td className="num">{r.ridership > 0 ? '₹' + (r.revenue / r.ridership).toFixed(2) : '—'}</td>
                  <td className="num">{r.n_buses > 0 ? (r.n_trips / r.n_buses).toFixed(1) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   Route Trends Page (multi-date performance)
   ═══════════════════════════════════════════════════════════════ */

function RouteTrendsPage({ data, route }: { data: DashboardData; route: string }) {
  const targets = useMemo(() => {
    if (route !== 'ALL') return [route]
    const totals = new Map<string, number>()
    for (const r of data.route_trend) totals.set(r.route_code, (totals.get(r.route_code) || 0) + r.ridership)
    return [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([c]) => c)
  }, [data, route])

  const traceFor = (rc: string, i: number, field: 'ridership' | 'revenue' | 'load_factor_route', scale = 1) => {
    const pts = data.route_trend.filter(r => r.route_code === rc).sort((a, b) => a.service_date.localeCompare(b.service_date))
    return {
      x: pts.map(r => r.service_date),
      y: pts.map(r => (r[field] || 0) * scale),
      type: 'scatter' as const,
      mode: 'lines+markers' as const,
      name: rc,
      line: { color: COLORS[i % COLORS.length], width: 2 },
      marker: { size: 4, color: COLORS[i % COLORS.length] },
    }
  }

  return (
    <div className="page">
      <div className="chart-panel">
        <div className="chart-header">
          <div>
            <div className="chart-title">Ridership Over Time</div>
            <div className="chart-subtitle">{route === 'ALL' ? 'Top 6 routes by total ridership' : `Route ${route}`}</div>
          </div>
        </div>
        <Plot
          data={targets.map((rc, i) => traceFor(rc, i, 'ridership'))}
          layout={pLayout({ height: 380, yaxis: { ...lightAx, title: { text: 'Ridership', font: { color: '#6b7280', size: 11 } } } })}
          style={{ width: '100%' }}
          config={pCfg}
          useResizeHandler
        />
      </div>

      <div className="charts-row">
        <div className="chart-panel">
          <div className="chart-header"><div className="chart-title">Load Factor Trend</div></div>
          <Plot
            data={targets.map((rc, i) => traceFor(rc, i, 'load_factor_route', 100))}
            layout={pLayout({ height: 280, yaxis: { ...lightAx, title: { text: 'LF %', font: { color: '#6b7280', size: 11 } } } })}
            style={{ width: '100%' }}
            config={pCfg}
            useResizeHandler
          />
        </div>
        <div className="chart-panel">
          <div className="chart-header"><div className="chart-title">Revenue Trend</div></div>
          <Plot
            data={targets.map((rc, i) => traceFor(rc, i, 'revenue'))}
            layout={pLayout({ height: 280, yaxis: { ...lightAx, title: { text: 'Revenue (₹)', font: { color: '#6b7280', size: 11 } } } })}
            style={{ width: '100%' }}
            config={pCfg}
            useResizeHandler
          />
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   Efficiency Metrics Page
   ═══════════════════════════════════════════════════════════════ */

function EfficiencyPage({ data, date }: { data: DashboardData; date: string }) {
  // Period-level derived metrics
  const periodMetrics = useMemo(() => data.daily.map(d => ({
    date: d.service_date,
    atl: d.ridership > 0 ? d.pax_km / d.ridership : 0,
    fareYield: d.ridership > 0 ? d.revenue / d.ridership : 0,
    revPerTrip: d.trips > 0 ? d.revenue / d.trips : 0,
    revPerBus: d.buses > 0 ? d.revenue / d.buses : 0,
    tripsPerBus: d.buses > 0 ? d.trips / d.buses : 0,
    ridersPerTrip: d.trips > 0 ? d.ridership / d.trips : 0,
  })), [data])

  // Route-level efficiency for selected date
  const routeEffRows = useMemo(() =>
    data.route_trend
      .filter(r => r.service_date === date)
      .map(r => ({
        ...r,
        fareYield: r.ridership > 0 ? r.revenue / r.ridership : 0,
        revPerTrip: r.n_trips > 0 ? r.revenue / r.n_trips : 0,
        revPerBus: r.n_buses > 0 ? r.revenue / r.n_buses : 0,
        tripsPerBus: r.n_buses > 0 ? r.n_trips / r.n_buses : 0,
        ridersPerTrip: r.n_trips > 0 ? r.ridership / r.n_trips : 0,
      }))
      .sort((a, b) => b.fareYield - a.fareYield),
    [data, date],
  )

  const today = data.daily.find(d => d.service_date === date)
  const todayIdx = periodMetrics.findIndex(d => d.date === date)
  const todayM = todayIdx >= 0 ? periodMetrics[todayIdx] : null

  const avgATL = periodMetrics.reduce((s, d) => s + d.atl, 0) / (periodMetrics.length || 1)
  const avgFY = periodMetrics.reduce((s, d) => s + d.fareYield, 0) / (periodMetrics.length || 1)
  const avgTPB = periodMetrics.reduce((s, d) => s + d.tripsPerBus, 0) / (periodMetrics.length || 1)

  const lineChart = (label: string, field: keyof typeof periodMetrics[0], color: string, fmt: (n: number) => string, yTitle: string) => ({
    data: [{
      x: periodMetrics.map(d => d.date),
      y: periodMetrics.map(d => d[field] as number),
      type: 'scatter' as const,
      mode: 'lines+markers' as const,
      name: label,
      fill: 'tozeroy' as const,
      fillcolor: color.replace(')', ', 0.06)').replace('rgb', 'rgba'),
      line: { color, width: 2.5 },
      marker: { size: 3, color },
      hovertemplate: `<b>%{x}</b><br>${label}: ${fmt(0).replace('0', '%{y:.2f}')}<extra></extra>`,
    }],
    layout: pLayout({
      height: 230,
      shapes: todayIdx >= 0 ? [{ type: 'line', x0: date, x1: date, y0: 0, y1: 1, yref: 'paper', line: { color: '#f59e0b', width: 1, dash: 'dot' } }] : [],
      yaxis: { ...lightAx, title: { text: yTitle, font: { color: '#6b7280', size: 11 } } },
      margin: { l: 56, r: 20, t: 16, b: 40 },
    }),
  })

  return (
    <div className="page">
      {/* Period KPIs */}
      <div className="kpi-grid">
        <div className="kpi-card" style={{ '--card-accent': '#f43f5e' } as React.CSSProperties}>
          <div className="kpi-label">ATL Today</div>
          <div className="kpi-value">{todayM ? todayM.atl.toFixed(2) : '—'} km</div>
          <div className="kpi-sub">Period avg: {avgATL.toFixed(2)} km</div>
        </div>
        <div className="kpi-card" style={{ '--card-accent': '#14b8a6' } as React.CSSProperties}>
          <div className="kpi-label">Fare Yield Today</div>
          <div className="kpi-value">₹{todayM ? todayM.fareYield.toFixed(2) : '—'}</div>
          <div className="kpi-sub">Period avg: ₹{avgFY.toFixed(2)}</div>
        </div>
        <div className="kpi-card" style={{ '--card-accent': '#f97316' } as React.CSSProperties}>
          <div className="kpi-label">Trips/Bus Today</div>
          <div className="kpi-value">{todayM ? todayM.tripsPerBus.toFixed(1) : '—'}</div>
          <div className="kpi-sub">Period avg: {avgTPB.toFixed(1)}</div>
        </div>
        <div className="kpi-card" style={{ '--card-accent': '#3b82f6' } as React.CSSProperties}>
          <div className="kpi-label">Rev/Trip Today</div>
          <div className="kpi-value">{today && today.trips > 0 ? fM(today.revenue / today.trips) : '—'}</div>
          <div className="kpi-sub">Revenue per operated trip</div>
        </div>
        <div className="kpi-card" style={{ '--card-accent': '#8b5cf6' } as React.CSSProperties}>
          <div className="kpi-label">Rev/Bus Today</div>
          <div className="kpi-value">{today && today.buses > 0 ? fM(today.revenue / today.buses) : '—'}</div>
          <div className="kpi-sub">Revenue per deployed bus</div>
        </div>
      </div>

      {/* Trend charts — 3-column grid */}
      <div className="charts-row">
        {(() => { const c = lineChart('ATL (km)', 'atl', '#f43f5e', n => n.toFixed(2) + ' km', 'km'); return (
          <div className="chart-panel">
            <div className="chart-header"><div className="chart-title">Avg Trip Length (ATL)</div><div className="chart-subtitle">Pax-km ÷ Ridership</div></div>
            <Plot data={c.data} layout={c.layout} style={{ width: '100%' }} config={pCfg} useResizeHandler />
          </div>
        )})()}
        {(() => { const c = lineChart('Fare Yield (₹)', 'fareYield', '#14b8a6', n => '₹' + n.toFixed(2), '₹ / Pax'); return (
          <div className="chart-panel">
            <div className="chart-header"><div className="chart-title">Fare Yield</div><div className="chart-subtitle">Revenue ÷ Ridership</div></div>
            <Plot data={c.data} layout={c.layout} style={{ width: '100%' }} config={pCfg} useResizeHandler />
          </div>
        )})()}
      </div>

      <div className="charts-row">
        {(() => { const c = lineChart('Trips/Bus', 'tripsPerBus', '#f97316', n => n.toFixed(1), 'Trips/Bus'); return (
          <div className="chart-panel">
            <div className="chart-header"><div className="chart-title">Trips per Bus</div><div className="chart-subtitle">Bus utilisation ratio</div></div>
            <Plot data={c.data} layout={c.layout} style={{ width: '100%' }} config={pCfg} useResizeHandler />
          </div>
        )})()}
        {(() => { const c = lineChart('Rev/Trip (₹)', 'revPerTrip', '#3b82f6', n => '₹' + n.toFixed(0), '₹ / Trip'); return (
          <div className="chart-panel">
            <div className="chart-header"><div className="chart-title">Revenue per Trip</div><div className="chart-subtitle">Earnings per operated trip</div></div>
            <Plot data={c.data} layout={c.layout} style={{ width: '100%' }} config={pCfg} useResizeHandler />
          </div>
        )})()}
      </div>

      {/* Route-level efficiency table for selected date */}
      <div className="chart-panel">
        <div className="chart-header">
          <div>
            <div className="chart-title">Route Efficiency Breakdown</div>
            <div className="chart-subtitle">{date} — sorted by Fare Yield desc</div>
          </div>
        </div>
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Route</th>
                <th>Ridership</th>
                <th>Fare Yield</th>
                <th>ATL (km)</th>
                <th>Rev/Trip</th>
                <th>Rev/Bus</th>
                <th>Trips/Bus</th>
                <th>Riders/Trip</th>
                <th>LF %</th>
              </tr>
            </thead>
            <tbody>
              {routeEffRows.map(r => (
                <tr key={r.route_code}>
                  <td><strong>{r.route_code}</strong></td>
                  <td className="num">{fI(r.ridership)}</td>
                  <td className="num">₹{r.fareYield.toFixed(2)}</td>
                  <td className="num">—</td>
                  <td className="num">{fM(r.revPerTrip)}</td>
                  <td className="num">{fM(r.revPerBus)}</td>
                  <td className="num">{r.tripsPerBus.toFixed(1)}</td>
                  <td className="num">{r.ridersPerTrip.toFixed(1)}</td>
                  <td className="num">{fP(r.load_factor_route)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Radar chart: route efficiency fingerprint */}
      <div className="chart-panel">
        <div className="chart-header">
          <div>
            <div className="chart-title">Route Efficiency Radar</div>
            <div className="chart-subtitle">Normalised scores — outer = better performance</div>
          </div>
        </div>
        <Plot
          data={routeEffRows.slice(0, 6).map((r, i) => {
            const maxFY = Math.max(...routeEffRows.map(x => x.fareYield), 1)
            const maxRPT = Math.max(...routeEffRows.map(x => x.ridersPerTrip), 1)
            const maxTPB = Math.max(...routeEffRows.map(x => x.tripsPerBus), 1)
            const maxLF = Math.max(...routeEffRows.map(x => x.load_factor_route), 1)
            const maxRPB = Math.max(...routeEffRows.map(x => x.revPerBus), 1)
            return {
              type: 'scatterpolar' as const,
              r: [
                r.fareYield / maxFY * 100,
                r.ridersPerTrip / maxRPT * 100,
                r.tripsPerBus / maxTPB * 100,
                (r.load_factor_route || 0) / maxLF * 100,
                r.revPerBus / maxRPB * 100,
                r.fareYield / maxFY * 100,
              ],
              theta: ['Fare Yield', 'Riders/Trip', 'Trips/Bus', 'Load Factor', 'Rev/Bus', 'Fare Yield'],
              fill: 'toself' as const,
              name: r.route_code,
              line: { color: COLORS[i % COLORS.length] },
              opacity: 0.7,
            }
          })}
          layout={{
            polar: {
              radialaxis: { visible: true, range: [0, 100], tickfont: { color: '#6b7280', size: 10 }, gridcolor: '#dde1ea' },
              angularaxis: { tickfont: { color: '#4b5563', size: 11 }, gridcolor: '#dde1ea' },
              bgcolor: 'transparent',
            },
            paper_bgcolor: 'transparent',
            plot_bgcolor: 'transparent',
            height: 420,
            margin: { l: 60, r: 60, t: 40, b: 40 },
            legend: { font: { color: '#4b5563', size: 11 }, bgcolor: 'transparent', orientation: 'h', y: -0.12 },
            hoverlabel: { bgcolor: '#1e2240', bordercolor: '#2d3350', font: { color: '#eef2ff', family: 'Source Sans 3', size: 12 } },
          }}
          style={{ width: '100%' }}
          config={pCfg}
          useResizeHandler
        />
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   Temporal Analysis Page
   ═══════════════════════════════════════════════════════════════ */

function TemporalPage({ data, date, route }: { data: DashboardData; date: string; route: string }) {
  const rows = useMemo(() => {
    const filtered = data.temporal.filter(r => r.service_date === date && (route === 'ALL' || r.route_code === route))
    const byHour = new Map<number, { ridership: number; revenue: number; trips: number }>()
    for (const r of filtered) {
      const c = byHour.get(r.start_hour) || { ridership: 0, revenue: 0, trips: 0 }
      c.ridership += r.ridership; c.revenue += r.revenue; c.trips += r.trips
      byHour.set(r.start_hour, c)
    }
    return [...byHour.entries()].sort((a, b) => a[0] - b[0]).map(([h, v]) => ({ hour: h, label: `${String(h).padStart(2, '0')}:00`, ...v }))
  }, [data, date, route])

  const peak = rows.length > 0 ? rows.reduce((m, r) => r.ridership > m.ridership ? r : m, rows[0]) : null
  const totR = rows.reduce((s, r) => s + r.ridership, 0)
  const totRev = rows.reduce((s, r) => s + r.revenue, 0)
  const totTrips = rows.reduce((s, r) => s + r.trips, 0)

  // Headway estimate: span from first to last service hour ÷ total trips
  const headwayMins = rows.length >= 2 && totTrips > 0
    ? Math.round(((rows[rows.length - 1].hour - rows[0].hour) * 60) / totTrips)
    : null

  // Trips per bus (estimated from route_trend for same date)
  const routeTotals = useMemo(() => {
    const rd = data.route_trend.filter(r => r.service_date === date && (route === 'ALL' || r.route_code === route))
    const buses = rd.reduce((s, r) => s + r.n_buses, 0)
    const trips = rd.reduce((s, r) => s + r.n_trips, 0)
    return { buses, tripsPerBus: buses > 0 ? trips / buses : null }
  }, [data, date, route])

  return (
    <div className="page">
      <div className="kpi-grid">
        <div className="kpi-card" style={{ '--card-accent': '#6366f1' } as React.CSSProperties}>
          <div className="kpi-label">Day Ridership</div>
          <div className="kpi-value">{fI(totR)}</div>
        </div>
        <div className="kpi-card" style={{ '--card-accent': '#22d3ee' } as React.CSSProperties}>
          <div className="kpi-label">Day Revenue</div>
          <div className="kpi-value">{fM(totRev)}</div>
        </div>
        <div className="kpi-card" style={{ '--card-accent': '#f59e0b' } as React.CSSProperties}>
          <div className="kpi-label">Peak Hour</div>
          <div className="kpi-value">{peak ? peak.label : '—'}</div>
          {peak && <div className="kpi-sub">{fI(peak.ridership)} passengers</div>}
        </div>
        <div className="kpi-card" style={{ '--card-accent': '#10b981' } as React.CSSProperties}>
          <div className="kpi-label">Active Hours</div>
          <div className="kpi-value">{rows.length}</div>
        </div>
        <div className="kpi-card" style={{ '--card-accent': '#f43f5e' } as React.CSSProperties}>
          <div className="kpi-label">Est. Headway</div>
          <div className="kpi-value">{headwayMins != null ? `${headwayMins} min` : '—'}</div>
          <div className="kpi-sub">Avg time between trips</div>
        </div>
        <div className="kpi-card" style={{ '--card-accent': '#8b5cf6' } as React.CSSProperties}>
          <div className="kpi-label">Trips / Bus</div>
          <div className="kpi-value">{routeTotals.tripsPerBus != null ? routeTotals.tripsPerBus.toFixed(1) : '—'}</div>
          <div className="kpi-sub">{fI(routeTotals.buses)} buses deployed</div>
        </div>
      </div>

      <div className="chart-panel">
        <div className="chart-header">
          <div>
            <div className="chart-title">Hourly Ridership & Revenue Distribution</div>
            <div className="chart-subtitle">{date} • {route === 'ALL' ? 'All routes' : `Route ${route}`}</div>
          </div>
        </div>
        <Plot
          data={[
            {
              x: rows.map(r => r.label),
              y: rows.map(r => r.ridership),
              type: 'bar' as const,
              name: 'Ridership',
              marker: {
                color: rows.map(r => {
                  const mx = Math.max(...rows.map(rr => rr.ridership), 1)
                  return `rgba(99, 102, 241, ${0.35 + (r.ridership / mx) * 0.55})`
                }),
              },
            },
            {
              x: rows.map(r => r.label),
              y: rows.map(r => r.revenue),
              type: 'scatter' as const,
              mode: 'lines+markers' as const,
              name: 'Revenue (₹)',
              yaxis: 'y2',
              line: { color: '#22d3ee', width: 2.5 },
              marker: { size: 5, color: '#22d3ee' },
            },
          ]}
          layout={pLayout({
            height: 420,
            xaxis: { ...lightAx, title: { text: 'Hour of Day', font: { color: '#6b7280', size: 11 } } },
            yaxis: { ...lightAx, title: { text: 'Ridership', font: { color: '#6b7280', size: 11 } } },
            yaxis2: { ...lightAx, title: { text: 'Revenue (₹)', font: { color: '#6b7280', size: 11 } }, overlaying: 'y', side: 'right' },
          })}
          style={{ width: '100%' }}
          config={pCfg}
          useResizeHandler
        />
      </div>

      <div className="chart-panel">
        <div className="chart-header"><div className="chart-title">Trips by Hour</div></div>
        <Plot
          data={[{
            x: rows.map(r => r.label),
            y: rows.map(r => r.trips),
            type: 'bar' as const,
            name: 'Trips',
            marker: { color: '#10b981', opacity: 0.7 },
          }]}
          layout={pLayout({ height: 260, yaxis: { ...lightAx, title: { text: 'Trips', font: { color: '#6b7280', size: 11 } } } })}
          style={{ width: '100%' }}
          config={pCfg}
          useResizeHandler
        />
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   Stops & Map Page
   ═══════════════════════════════════════════════════════════════ */

function StopsMapPage({ data, date, routeDirection }: { data: DashboardData; date: string; routeDirection: string }) {
  const stops = useMemo(() =>
    data.stop_map.filter(r => r.service_date === date && (routeDirection === 'ALL' || r.route_direction_key === routeDirection)),
    [data, date, routeDirection],
  )

  const baRows = useMemo(() => {
    const dir = routeDirection === 'ALL' ? (data.agency.route_directions[0] ?? '') : routeDirection
    if (!dir) return []
    return data.ba_line_best_trip.filter(r => r.service_date === date && r.route_direction_key === dir).sort((a, b) => a.stop_no - b.stop_no)
  }, [data, date, routeDirection])

  const totalB = stops.reduce((s, r) => s + r.boarding, 0)
  const totalA = stops.reduce((s, r) => s + r.alighting, 0)
  const maxLoad = stops.reduce((s, r) => Math.max(s, r.peak_load), 0)

  const center = stops.length > 0
    ? { lat: stops.reduce((s, r) => s + r.latitude, 0) / stops.length, lon: stops.reduce((s, r) => s + r.longitude, 0) / stops.length }
    : { lat: 21.76, lon: 72.15 }

  return (
    <div className="page">
      <div className="kpi-grid">
        <div className="kpi-card" style={{ '--card-accent': '#10b981' } as React.CSSProperties}>
          <div className="kpi-label">Total Boardings</div>
          <div className="kpi-value">{fI(totalB)}</div>
        </div>
        <div className="kpi-card" style={{ '--card-accent': '#f43f5e' } as React.CSSProperties}>
          <div className="kpi-label">Total Alightings</div>
          <div className="kpi-value">{fI(totalA)}</div>
        </div>
        <div className="kpi-card" style={{ '--card-accent': '#f59e0b' } as React.CSSProperties}>
          <div className="kpi-label">Peak Load</div>
          <div className="kpi-value">{fI(maxLoad)}</div>
        </div>
        <div className="kpi-card" style={{ '--card-accent': '#6366f1' } as React.CSSProperties}>
          <div className="kpi-label">Active Stops</div>
          <div className="kpi-value">{stops.length}</div>
        </div>
      </div>

      {/* Map */}
      <div className="chart-panel">
        <div className="chart-header">
          <div>
            <div className="chart-title">Stop Activity Map</div>
            <div className="chart-subtitle">Marker size ∝ peak load • Color = net boarding − alighting</div>
          </div>
        </div>
        {stops.length > 0 ? (
          <Plot
            data={[{
              type: 'scattermapbox' as const,
              lat: stops.map(r => r.latitude),
              lon: stops.map(r => r.longitude),
              text: stops.map(r => `<b>${r.stop_name}</b><br>Boarding: ${r.boarding}<br>Alighting: ${r.alighting}<br>Peak: ${r.peak_load}`),
              hoverinfo: 'text' as const,
              marker: {
                size: stops.map(r => Math.max(8, Math.min(30, r.peak_load / 5))),
                color: stops.map(r => r.boarding - r.alighting),
                colorscale: [[0, '#f43f5e'], [0.5, '#f59e0b'], [1, '#10b981']] as [number, string][],
                showscale: true,
                colorbar: { title: { text: 'Net B−A', font: { color: '#4b5563', size: 11 } }, tickfont: { color: '#6b7280' }, bgcolor: 'transparent', bordercolor: 'transparent', len: 0.6 },
                opacity: 0.88,
              },
              mode: 'markers' as const,
            }]}
            layout={{
              height: 480,
              margin: { l: 0, r: 0, t: 0, b: 0 },
              paper_bgcolor: 'transparent',
              mapbox: { style: 'carto-darkmatter', center, zoom: 11 },
            }}
            style={{ width: '100%', borderRadius: '12px', overflow: 'hidden' }}
            config={pCfg}
            useResizeHandler
          />
        ) : (
          <div className="empty-state">No stop data for this filter selection.</div>
        )}
      </div>

      {/* BA Line Loading + Boarding/Alighting */}
      {baRows.length > 0 && (
        <div className="charts-row">
          <div className="chart-panel">
            <div className="chart-header">
              <div>
                <div className="chart-title">Passenger Load Along Route</div>
                <div className="chart-subtitle">Trip: {baRows[0]?.bus_trip_key}</div>
              </div>
            </div>
            <Plot
              data={[{
                x: baRows.map(r => `${r.stop_no}`),
                y: baRows.map(r => r.passenger_load),
                type: 'scatter' as const,
                mode: 'lines+markers' as const,
                fill: 'tozeroy',
                fillcolor: 'rgba(99, 102, 241, 0.08)',
                line: { color: '#6366f1', width: 2.5, shape: 'spline' },
                marker: { size: 6, color: '#6366f1' },
                name: 'Passenger Load',
                text: baRows.map(r => r.stop_name),
                hovertemplate: '<b>%{text}</b><br>Stop %{x}<br>Load: %{y}<extra></extra>',
              }]}
              layout={pLayout({
                height: 300,
                xaxis: { ...lightAx, title: { text: 'Stop No.', font: { color: '#6b7280', size: 11 } } },
                yaxis: { ...lightAx, title: { text: 'Passengers', font: { color: '#6b7280', size: 11 } } },
              })}
              style={{ width: '100%' }}
              config={pCfg}
              useResizeHandler
            />
          </div>

          <div className="chart-panel">
            <div className="chart-header"><div className="chart-title">Boarding & Alighting per Stop</div></div>
            <Plot
              data={[
                {
                  x: baRows.map(r => `${r.stop_no}`),
                  y: baRows.map(r => r.boarding),
                  type: 'bar' as const,
                  name: 'Boarding',
                  marker: { color: '#10b981', opacity: 0.8 },
                  text: baRows.map(r => r.stop_name),
                  hovertemplate: '<b>%{text}</b><br>Boarding: %{y}<extra></extra>',
                },
                {
                  x: baRows.map(r => `${r.stop_no}`),
                  y: baRows.map(r => -r.alighting),
                  type: 'bar' as const,
                  name: 'Alighting',
                  marker: { color: '#f43f5e', opacity: 0.8 },
                  text: baRows.map(r => r.stop_name),
                  customdata: baRows.map(r => r.alighting),
                  hovertemplate: '<b>%{text}</b><br>Alighting: %{customdata}<extra></extra>',
                },
              ]}
              layout={pLayout({
                height: 300,
                barmode: 'relative',
                xaxis: { ...lightAx, title: { text: 'Stop No.', font: { color: '#6b7280', size: 11 } } },
                yaxis: { ...lightAx, title: { text: 'Passengers', font: { color: '#6b7280', size: 11 } } },
              })}
              style={{ width: '100%' }}
              config={pCfg}
              useResizeHandler
            />
          </div>
        </div>
      )}

      {/* Stop details table */}
      {stops.length > 0 && (
        <div className="chart-panel">
          <div className="chart-header"><div className="chart-title">Stop Details</div></div>
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr><th>Stop</th><th>Abbr</th><th>Boarding</th><th>Alighting</th><th>Net</th><th>Peak Load</th></tr>
              </thead>
              <tbody>
                {stops.sort((a, b) => b.boarding - a.boarding).slice(0, 20).map(r => (
                  <tr key={r.stop_abbr + r.route_direction_key}>
                    <td>{r.stop_name}</td>
                    <td>{r.stop_abbr}</td>
                    <td className="num">{fI(r.boarding)}</td>
                    <td className="num">{fI(r.alighting)}</td>
                    <td className="num">{fI(r.boarding - r.alighting)}</td>
                    <td className="num">{fI(r.peak_load)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   Data Management / Upload Page
   ═══════════════════════════════════════════════════════════════ */

function classifyFile(name: string): 'etm' | 'supporting' | 'stops' | null {
  const l = name.toLowerCase()
  if (/supporting/.test(l)) return 'supporting'
  if (/^etm/.test(l) || /\betm[_\s-]/i.test(name)) return 'etm'
  if (/stops?\s*seq|stopsseq|stop\s*sequence/i.test(l)) return 'stops'
  if (/^\d+\s*-\s*\d+/.test(name)) return 'stops'
  return null
}

function UploadPage({ onDataLoaded }: { onDataLoaded: (d: DashboardData) => void }) {
  const [etm, setEtm] = useState<File | null>(null)
  const [supporting, setSupporting] = useState<File | null>(null)
  const [stopsFiles, setStopsFiles] = useState<File[]>([])
  const [jobId, setJobId] = useState<string | null>(null)
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState<string | null>(null)
  const [logs, setLogs] = useState<string[]>([])
  const [jobs, setJobs] = useState<{ id: string; status: string; created_at: string; error: string | null; logs: string[] | null }[]>([])
  const [drag, setDrag] = useState(false)

  useEffect(() => { refreshJobs() }, [])

  async function refreshJobs() {
    try {
      const r = await fetch('/api/jobs?limit=10')
      if (!r.ok) return
      const p = await r.json()
      setJobs(p.jobs ?? [])
    } catch { /* API may be offline */ }
  }

  function handleBulkDrop(files: FileList | null) {
    if (!files) return
    let nextEtm = etm, nextSup = supporting
    const nextStops = [...stopsFiles]
    const unclassified: string[] = []
    for (const f of Array.from(files)) {
      const err = validateExcelFile(f)
      if (err) { setError(err); return }
      const slot = classifyFile(f.name)
      if (slot === 'etm') nextEtm = f
      else if (slot === 'supporting') nextSup = f
      else if (slot === 'stops') {
        if (!nextStops.some(x => x.name === f.name && x.size === f.size)) nextStops.push(f)
      } else {
        // slot === null — could not auto-classify
        unclassified.push(f.name)
      }
    }
    if (unclassified.length > 0) {
      setError(
        `Could not classify: ${unclassified.join(', ')}. ` +
        `Rename to match ETM*, Supporting*, or StopsSeq* patterns, or use the individual slots below.`,
      )
      return
    }
    setEtm(nextEtm); setSupporting(nextSup); setStopsFiles(nextStops); setError(null)
  }

  /** Per-slot drop handler for individual file zones */
  function handleSlotDrop(slot: 'etm' | 'supporting' | 'stops', files: FileList | null) {
    if (!files || files.length === 0) return
    const list = Array.from(files)
    for (const f of list) {
      const err = validateExcelFile(f)
      if (err) { setError(err); return }
    }
    setError(null)
    if (slot === 'etm') { setEtm(list[0]) }
    else if (slot === 'supporting') { setSupporting(list[0]) }
    else {
      setStopsFiles(prev => {
        const next = [...prev]
        for (const f of list) {
          if (!next.some(x => x.name === f.name && x.size === f.size)) next.push(f)
        }
        return next
      })
    }
  }

  async function submit() {
    if (!etm || !supporting || stopsFiles.length === 0) { setError('Attach ETM, Supporting, and at least one Stops Sequence file.'); return }
    setError(null); setStatus('queued'); setLogs([])
    const fd = new FormData()
    fd.append('agency_id', 'bhavnagar')
    fd.append('etm_file', etm)
    fd.append('supporting_file', supporting)
    for (const f of stopsFiles) fd.append('stop_sequence_files', f)
    try {
      const resp = await fetch('/api/jobs', { method: 'POST', body: fd })
      if (!resp.ok) throw new Error(await resp.text() || `HTTP ${resp.status}`)
      const j = await resp.json()
      setJobId(j.job_id); setStatus(j.status ?? 'queued'); void refreshJobs()
    } catch (e) { setStatus('failed'); setError(e instanceof Error ? e.message : String(e)) }
  }

  // Poll for job completion
  useEffect(() => {
    if (!jobId) return
    let cancelled = false
    const timer = setInterval(() => {
      fetch(`/api/jobs/${jobId}`)
        .then(r => r.json())
        .then(j => {
          if (cancelled) return
          setStatus(j.status)
          if (j.logs) setLogs(j.logs)
          if (j.status === 'failed') { setError(j.error || 'Job failed'); clearInterval(timer); void refreshJobs() }
          if (j.status === 'succeeded') {
            fetch(`/api/jobs/${jobId}/result`)
              .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
              .then(d => { if (!cancelled) onDataLoaded(d) })
              .catch(e => setError(e instanceof Error ? e.message : String(e)))
              .finally(() => { clearInterval(timer); void refreshJobs() })
          }
        })
        .catch(e => setError(e instanceof Error ? e.message : String(e)))
    }, 2000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [jobId, onDataLoaded])

  const fmtB = (n: number) => n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`

  return (
    <div className="page">
      <div className="chart-panel">
        <div className="chart-header"><div className="chart-title">Upload dataset</div><div className="chart-subtitle">Provide ETM tickets, supporting tables, and daily stop-sequence files</div></div>
        <div className="upload-grid">
          {/* ── Bulk drop zone ── */}
          <div
            className={`dropzone ${drag ? 'active' : ''}`}
            onDragOver={e => { e.preventDefault(); setDrag(true) }}
            onDragLeave={() => setDrag(false)}
            onDrop={e => { e.preventDefault(); setDrag(false); handleBulkDrop(e.dataTransfer.files) }}
          >
            <div className="dropzone-label">Drop all Excel files here</div>
            <div className="dropzone-hint">
              Auto-classified by name: <code>ETM_*</code>, <code>Supporting*</code>, <code>StopsSeq*</code> / route files like <code>1-2.xlsx</code>
            </div>
            <input type="file" accept=".xlsx,.xls" multiple onChange={e => handleBulkDrop(e.target.files)} />
          </div>

          {/* ── Attached files summary ── */}
          {(etm || supporting || stopsFiles.length > 0) && (
            <div className="file-tags">
              {etm && <span className="file-tag">ETM: {etm.name} ({fmtB(etm.size)}) <button onClick={() => setEtm(null)}>×</button></span>}
              {supporting && <span className="file-tag">Support: {supporting.name} ({fmtB(supporting.size)}) <button onClick={() => setSupporting(null)}>×</button></span>}
              {stopsFiles.map(f => (
                <span key={f.name + f.size} className="file-tag">
                  Stops: {f.name} <button onClick={() => setStopsFiles(p => p.filter(x => !(x.name === f.name && x.size === f.size)))}>×</button>
                </span>
              ))}
            </div>
          )}

          {/* ── Per-slot individual drop zones (collapsible) ── */}
          <details className="slot-details">
            <summary className="slot-summary">Individual file slots (if auto-classify fails)</summary>
            <div className="slot-grid">
              {/* ETM slot */}
              <div
                className={`dropzone slot-zone ${!etm ? '' : 'slot-filled'}`}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); handleSlotDrop('etm', e.dataTransfer.files) }}
              >
                <div className="slot-zone-header">
                  <span className="slot-label">ETM file</span>
                  {etm && <button className="link-btn" onClick={() => setEtm(null)}>Remove</button>}
                </div>
                {etm
                  ? <span className="slot-filename">{etm.name} ({fmtB(etm.size)})</span>
                  : <span className="dropzone-hint">Drop ETM*.xlsx here or click to browse</span>
                }
                <input type="file" accept=".xlsx,.xls" onChange={e => handleSlotDrop('etm', e.target.files)} />
              </div>

              {/* Supporting slot */}
              <div
                className={`dropzone slot-zone ${!supporting ? '' : 'slot-filled'}`}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); handleSlotDrop('supporting', e.dataTransfer.files) }}
              >
                <div className="slot-zone-header">
                  <span className="slot-label">Supporting file</span>
                  {supporting && <button className="link-btn" onClick={() => setSupporting(null)}>Remove</button>}
                </div>
                {supporting
                  ? <span className="slot-filename">{supporting.name} ({fmtB(supporting.size)})</span>
                  : <span className="dropzone-hint">Drop Supporting*.xlsx here or click to browse</span>
                }
                <input type="file" accept=".xlsx,.xls" onChange={e => handleSlotDrop('supporting', e.target.files)} />
              </div>

              {/* Stops slot */}
              <div
                className="dropzone slot-zone"
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); handleSlotDrop('stops', e.dataTransfer.files) }}
              >
                <div className="slot-zone-header">
                  <span className="slot-label">Stop sequence files</span>
                  {stopsFiles.length > 0 && <button className="link-btn" onClick={() => setStopsFiles([])}>Clear</button>}
                </div>
                {stopsFiles.length > 0
                  ? <ul className="slot-file-list">{stopsFiles.map(f => <li key={f.name + f.size}>{f.name} ({fmtB(f.size)})</li>)}</ul>
                  : <span className="dropzone-hint">Drop route files (e.g. 1-2.xlsx) here — multiple allowed</span>
                }
                <input type="file" accept=".xlsx,.xls" multiple onChange={e => handleSlotDrop('stops', e.target.files)} />
              </div>
            </div>
          </details>

          {/* Actions */}
          <div className="upload-actions">
            <button className="btn-primary" onClick={submit} disabled={status === 'running' || status === 'queued'}>
              {status === 'running' || status === 'queued' ? 'Processing…' : 'Process files'}
            </button>
            <div className="job-status">
              <span className={`status-dot ${status}`} />
              <span>{status}</span>
            </div>
            {(etm || supporting || stopsFiles.length > 0) && (
              <button className="link-btn" onClick={() => { setEtm(null); setSupporting(null); setStopsFiles([]); setError(null) }}>
                Clear all
              </button>
            )}
          </div>

          {error && <div className="error-msg">{error}</div>}

          {logs.length > 0 && (
            <div>
              <div className="section-title">Processing log</div>
              <div className="job-log">{logs.map((l, i) => <div key={i}>{l}</div>)}</div>
            </div>
          )}
        </div>
      </div>

      {/* Recent Jobs */}
      {jobs.length > 0 && (
        <div className="chart-panel">
          <div className="chart-header"><div className="chart-title">Recent uploads</div></div>
          <table className="recent-table">
            <thead>
              <tr><th>Job</th><th>Status</th><th>Created</th><th></th></tr>
            </thead>
            <tbody>
              {jobs.map(j => (
                <tr key={j.id} className={jobId === j.id ? 'sel' : ''}>
                  <td title={j.id}>{j.id.slice(0, 8)}…</td>
                  <td><span className={`status-dot ${j.status}`} style={{ display: 'inline-block', marginRight: 6, verticalAlign: 'middle' }} />{j.status}</td>
                  <td>{new Date(j.created_at).toLocaleString()}</td>
                  <td>
                    {j.status === 'succeeded' && (
                      <button className="link-btn" onClick={() => {
                        setJobId(j.id); setStatus(j.status); setLogs(j.logs ?? [])
                        fetch(`/api/jobs/${j.id}/result`).then(r => r.json()).then(onDataLoaded).catch(() => {})
                      }}>
                        Load
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   Main App
   ═══════════════════════════════════════════════════════════════ */

function App() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState<Page>('overview')
  const [date, setDate] = useState('')
  const [route, setRoute] = useState('ALL')
  const [routeDirection, setRouteDirection] = useState('ALL')

  useEffect(() => {
    fetch('/data/bhavnagar-dashboard.json')
      .then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json() })
      .then((json: DashboardData) => { setData(json); setDate(json.agency.date_min) })
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  function handleDataUpdate(d: DashboardData) {
    setData(d)
    setDate(d.agency.date_min)
    setRoute('ALL')
    setRouteDirection('ALL')
    setPage('overview')
  }

  // Loading / error
  if (error && !data) return <div className="loading-screen"><p>Unable to load the dashboard.</p><p className="loading-detail">{error}</p></div>
  if (!data) return <div className="loading-screen"><div className="spinner" aria-hidden="true" /><p>Loading dashboard…</p></div>

  return (
    <div className="app-shell">
      {/* ── Sidebar ── */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="sidebar-logo-mark">
            <div className="mark">
              <svg viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
                <rect x="1" y="4" width="16" height="10" rx="2" fill="white" fillOpacity="0.9"/>
                <rect x="3" y="2" width="12" height="2" rx="1" fill="white" fillOpacity="0.6"/>
                <circle cx="4.5" cy="14.5" r="1.5" fill="#1a2744"/>
                <circle cx="13.5" cy="14.5" r="1.5" fill="#1a2744"/>
                <rect x="3" y="6" width="4" height="3" rx="0.5" fill="#1a2744" fillOpacity="0.3"/>
                <rect x="8" y="6" width="4" height="3" rx="0.5" fill="#1a2744" fillOpacity="0.3"/>
              </svg>
            </div>
            <div>
              <h1>Transit Performance</h1>
            </div>
          </div>
          <p>{data.agency.agency_name}</p>
          <div className="sidebar-meta">
            {data.agency.date_min} — {data.agency.date_max}
          </div>
        </div>
        <nav className="sidebar-nav" aria-label="Primary">
          {NAV.map(item => (
              <button
                key={item.id}
                type="button"
                className={`nav-item ${page === item.id ? 'active' : ''}`}
                onClick={() => setPage(item.id)}
              >
                <span className="nav-label">{item.label}</span>
              </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          CRDF · Transit analytics
        </div>
      </aside>

      {/* ── Main Content ── */}
      <main className="main-content">
        {/* Top filter bar */}
        <div className="top-bar">
          <div className="filter-bar">
            <div className="filter-group">
              <span className="filter-label">Date</span>
              <select value={date} onChange={e => setDate(e.target.value)}>
                {data.daily.map(d => <option key={d.service_date} value={d.service_date}>{d.service_date}</option>)}
              </select>
            </div>

            {(page === 'routes' || page === 'trends' || page === 'temporal' || page === 'efficiency') && (
              <div className="filter-group">
                <span className="filter-label">Route</span>
                <select value={route} onChange={e => setRoute(e.target.value)}>
                  <option value="ALL">All Routes</option>
                  {data.agency.routes.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            )}

            {page === 'stops' && (
              <div className="filter-group">
                <span className="filter-label">Direction</span>
                <select value={routeDirection} onChange={e => setRouteDirection(e.target.value)}>
                  <option value="ALL">All Directions</option>
                  {data.agency.route_directions.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Pages */}
        <div className="page-content">
          {page === 'overview'  && <OverviewPage data={data} date={date} />}
          {page === 'routes'    && <RoutePerformancePage data={data} date={date} route={route} />}
          {page === 'trends'    && <RouteTrendsPage data={data} route={route} />}
          {page === 'temporal'  && <TemporalPage data={data} date={date} route={route} />}
          {page === 'stops'     && <StopsMapPage data={data} date={date} routeDirection={routeDirection} />}
          {page === 'efficiency' && <EfficiencyPage data={data} date={date} />}
          {page === 'upload'    && <UploadPage onDataLoaded={handleDataUpdate} />}
        </div>
      </main>
    </div>
  )
}

export default App


