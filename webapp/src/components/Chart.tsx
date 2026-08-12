import { useEffect, useRef } from 'react'
import ReactECharts from 'echarts-for-react'
import type { EChartsOption } from 'echarts'
import * as echarts from 'echarts/core'
import { EmptyState } from './ui'
import { linearRegression } from '../lib/stats'
import { fmtInt, fmtMoney, fmtNum, fmtPct } from '../lib/format'

export const COLORS = [
  '#1B7A4E', '#2F9E6A', '#A8E6C5', '#374151', '#D97706', '#DC2626', '#166640', '#6B7280',
]

const BAND_TONE: Record<'good' | 'warn' | 'bad', string> = {
  good: 'rgba(27,122,78,0.10)',
  warn: 'rgba(217,119,6,0.10)',
  bad: 'rgba(220,38,38,0.10)',
}

function isDarkTheme(): boolean {
  return typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'dark'
}

function themeMuted(): string {
  return isDarkTheme() ? '#9CA3AF' : '#6b7280'
}

function themeText(): string {
  return isDarkTheme() ? '#E5E7EB' : '#374151'
}

const axisLabel = { color: '#6b7280', fontSize: 11, fontFamily: 'Source Sans 3, sans-serif' }
const axisName = { color: '#6b7280', fontSize: 11, fontFamily: 'Source Sans 3, sans-serif' }

export function baseOption(partial: EChartsOption = {}): EChartsOption {
  const muted = themeMuted()
  return {
    color: COLORS,
    textStyle: { fontFamily: 'Source Sans 3, sans-serif', color: themeText(), fontSize: 12 },
    grid: { left: 56, right: 48, top: 48, bottom: 48, containLabel: true },
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#111827',
      borderWidth: 0,
      textStyle: { color: '#f1f5f9', fontSize: 12 },
    },
    legend: {
      top: 0,
      left: 0,
      itemWidth: 12,
      itemHeight: 8,
      textStyle: { color: muted, fontSize: 11 },
    },
    ...partial,
  }
}

export function categoryAxis(name?: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'category',
    name,
    nameTextStyle: axisName,
    nameGap: 28,
    axisLabel: { ...axisLabel, hideOverlap: true },
    axisLine: { lineStyle: { color: '#dde1ea' } },
    axisTick: { show: false },
    splitLine: { show: false },
    ...extra,
  }
}

export function valueAxis(name?: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'value',
    name,
    nameTextStyle: axisName,
    nameGap: 36,
    axisLabel: axisLabel,
    axisLine: { show: false },
    axisTick: { show: false },
    splitLine: { lineStyle: { color: '#edf0f5' } },
    scale: false,
    ...extra,
  }
}

/* ── Reference lines / bands ──────────────────────────────────────────── */

export const markAvg = (label = 'Average'): Record<string, unknown> => ({
  markLine: {
    silent: true,
    symbol: 'none',
    data: [{ type: 'average', label: { formatter: `${label}: {c}`, position: 'insideEndTop' } }],
    lineStyle: { color: '#374151', type: 'dashed', width: 1.5 },
  },
})

export const markTarget = (value: number, label = 'Target'): Record<string, unknown> => ({
  markLine: {
    silent: true,
    symbol: 'none',
    data: [{ yAxis: value, label: { formatter: `${label}: {c}`, position: 'insideEndTop' } }],
    lineStyle: { color: '#D97706', type: 'dashed', width: 1.5 },
  },
})

/** Horizontal bands for gauges / bar thresholds (e.g. LF good/warn/bad). */
export const markBands = (
  bands: { from: number; to: number; tone: 'good' | 'warn' | 'bad' }[],
): Record<string, unknown> => ({
  markArea: {
    silent: true,
    data: bands.map((b) => [
      { yAxis: b.from, itemStyle: { color: BAND_TONE[b.tone] } },
      { yAxis: b.to },
    ]),
  },
})

export const markExtremes = (): Record<string, unknown> => ({
  markPoint: {
    data: [
      { type: 'max', name: 'Max' },
      { type: 'min', name: 'Min' },
    ],
    symbolSize: 44,
    label: { fontSize: 10 },
  },
})

/** Dashed regression line as a separate series (does not mutate the source data). */
export function trendSeries(values: number[], name = 'Trend') {
  const { fitted } = linearRegression(values)
  return {
    name,
    type: 'line' as const,
    data: fitted,
    showSymbol: false,
    silent: true,
    tooltip: { show: false },
    lineStyle: { color: '#6B7280', type: 'dashed' as const, width: 1.5 },
    z: 1,
  }
}

/* ── Interaction defaults ─────────────────────────────────────────────── */

export const zoomDefaults = (opts?: { start?: number; end?: number; xAxisIndex?: number[] }) => ({
  dataZoom: [
    {
      type: 'inside' as const,
      start: opts?.start ?? 0,
      end: opts?.end ?? 100,
      ...(opts?.xAxisIndex ? { xAxisIndex: opts.xAxisIndex } : {}),
    },
    {
      type: 'slider' as const,
      height: 18,
      bottom: 4,
      start: opts?.start ?? 0,
      end: opts?.end ?? 100,
      ...(opts?.xAxisIndex ? { xAxisIndex: opts.xAxisIndex } : {}),
    },
  ],
})

export const brushDefaults = () => ({
  brush: {
    toolbox: ['lineX', 'clear'] as ('lineX' | 'clear')[],
    xAxisIndex: 0,
    throttleType: 'debounce' as const,
    brushStyle: { borderWidth: 1, color: 'rgba(27,122,78,0.12)', borderColor: '#1B7A4E' },
  },
})

/** `_name` is kept so existing call sites stay valid; image export was removed. */
export const toolboxDefaults = (_name?: string) => ({
  toolbox: {
    right: 8,
    top: 0,
    feature: {
      restore: { title: 'Reset' },
    },
  },
})

export const valueLabels = (show: boolean, fmt?: (v: number) => string): Record<string, unknown> => ({
  label: {
    show,
    position: 'top',
    fontSize: 10,
    color: '#6b7280',
    formatter: fmt
      ? (p: { value?: unknown }) => {
          const raw = p.value
          const v = Array.isArray(raw) ? Number(raw[1] ?? raw[0]) : Number(raw ?? 0)
          return fmt(Number.isFinite(v) ? v : 0)
        }
      : '{c}',
  },
})

/** Spread onto a series when the toggle is on; empty object otherwise keeps types simple. */
export const withMarkAvg = (on: boolean) => (on ? markAvg() : {})
export const withValueLabels = (on: boolean, fmt?: (v: number) => string) =>
  on ? valueLabels(true, fmt) : {}

/**
 * Screen-reader descriptions stay on, but the hatch decals do not: ECharts
 * assigns a different pattern per series, which turned three-part bullets and
 * single-series heatmaps into visual noise without adding information.
 */
export const a11yDecal = () => ({
  aria: { enabled: true, decal: { show: false } },
})

/* ── Tooltip formatters ───────────────────────────────────────────────── */

export type UnitKind = 'int' | 'money' | 'pct' | 'km' | 'num' | 'raw'

export function formatUnit(v: number, kind: UnitKind = 'raw'): string {
  switch (kind) {
    case 'int': return fmtInt(v)
    case 'money': return fmtMoney(v)
    case 'pct': return fmtPct(v / 100) // callers pass 0-100 scale for LF charts, or use 'ratio'
    case 'km': return `${fmtNum(v, 2)} km`
    case 'num': return fmtNum(v, 2)
    default: return String(v)
  }
}

/** Axis tooltip that appends a unit string to every series value. */
export function tooltipUnits(units: Record<string, string>): Record<string, unknown> {
  return {
    trigger: 'axis',
    valueFormatter: undefined,
    formatter: (params: unknown) => {
      const arr = (Array.isArray(params) ? params : [params]) as Array<{
        axisValueLabel?: string
        marker?: string
        seriesName?: string
        value?: number | number[] | string
      }>
      if (arr.length === 0) return ''
      const head = arr[0].axisValueLabel ?? ''
      const lines = arr.map((p) => {
        const raw = Array.isArray(p.value) ? p.value[1] ?? p.value[0] : p.value
        const n = typeof raw === 'number' ? raw : Number(raw)
        const unit = units[p.seriesName ?? ''] ?? ''
        const shown = Number.isFinite(n)
          ? unit === '\u20B9' || unit === 'INR'
            ? fmtMoney(n)
            : unit === '%'
              ? `${n.toFixed(1)}%`
              : unit === 'pax' || unit === ''
                ? fmtInt(n)
                : `${fmtNum(n, 2)} ${unit}`
          : String(raw ?? '')
        return `${p.marker ?? ''}${p.seriesName ?? ''}: <b>${shown}</b>`
      })
      return [head, ...lines].join('<br/>')
    },
  }
}

/* ── Chart builders ───────────────────────────────────────────────────── */

export function donutOption(
  rows: { name: string; value: number }[],
  centerLabel: string,
): EChartsOption {
  const total = rows.reduce((s, r) => s + r.value, 0)
  return {
    tooltip: {
      trigger: 'item',
      formatter: (p: unknown) => {
        const item = p as { name?: string; value?: number; percent?: number }
        return `${item.name}: ${fmtInt(item.value ?? 0)} (${(item.percent ?? 0).toFixed(1)}%)`
      },
    },
    legend: { bottom: 0, left: 'center', type: 'scroll' },
    series: [
      {
        type: 'pie',
        radius: ['52%', '74%'],
        center: ['50%', '46%'],
        avoidLabelOverlap: true,
        itemStyle: { borderRadius: 4, borderColor: '#fff', borderWidth: 2 },
        label: { show: false },
        emphasis: { label: { show: true, fontSize: 12, fontWeight: 600 } },
        data: rows.map((r, i) => ({
          name: r.name,
          value: r.value,
          itemStyle: { color: COLORS[i % COLORS.length] },
        })),
      },
    ],
    graphic: [
      {
        type: 'text',
        left: 'center',
        top: '40%',
        style: {
          text: centerLabel,
          fill: '#6b7280',
          fontSize: 11,
          fontFamily: 'Source Sans 3, sans-serif',
          align: 'center',
        },
      },
      {
        type: 'text',
        left: 'center',
        top: '46%',
        style: {
          text: fmtInt(total),
          fill: '#111827',
          fontSize: 20,
          fontWeight: 700,
          fontFamily: 'Source Sans 3, sans-serif',
          align: 'center',
        },
      },
    ],
  }
}

export function calendarHeatmapOption(
  days: { date: string; value: number }[],
  range: string | [string, string],
): EChartsOption {
  const max = Math.max(...days.map((d) => d.value), 1)
  return {
    tooltip: {
      formatter: (p: unknown) => {
        const v = p as { value?: [string, number] }
        if (!v.value) return ''
        const d = new Date(`${v.value[0]}T00:00:00Z`)
        const label = d.toLocaleDateString('en-GB', {
          weekday: 'short', day: '2-digit', month: 'short', timeZone: 'UTC',
        })
        return `${label}<br/><b>${fmtInt(v.value[1])}</b>`
      },
    },
    visualMap: {
      min: 0,
      max,
      calculable: true,
      orient: 'horizontal',
      left: 'center',
      bottom: 0,
      itemWidth: 12,
      itemHeight: 120,
      inRange: { color: ['#F2F8F5', '#8FD3B0', '#1B7A4E'] },
      textStyle: { color: '#6b7280', fontSize: 11 },
    },
    calendar: {
      top: 40,
      left: 46,
      right: 18,
      bottom: 48,
      // Seven weekday rows at this height fill a 320px card without clipping,
      // and read as a wall planner rather than a contribution graph.
      cellSize: ['auto', 30],
      range,
      // The month outline is the jagged path around the weeks; cell borders
      // alone give a straight grid.
      splitLine: { show: false },
      itemStyle: { color: '#FBFCFD', borderWidth: 1, borderColor: '#E3E8EF' },
      yearLabel: { show: false },
      dayLabel: {
        firstDay: 1,
        nameMap: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
        color: '#6b7280',
        fontSize: 11,
        margin: 10,
      },
      monthLabel: { show: true, color: '#374151', fontSize: 12, fontWeight: 600, margin: 14 },
    },
    series: [
      {
        type: 'heatmap',
        coordinateSystem: 'calendar',
        itemStyle: { borderWidth: 1, borderColor: '#FFFFFF' },
        // The date number keeps the grid legible when a month has quiet days
        // that would otherwise be an unlabelled pale block.
        label: {
          show: true,
          position: 'inside',
          fontSize: 11,
          formatter: (p: unknown) => {
            const v = (p as { value?: [string, number] }).value
            return v ? String(Number(v[0].slice(8, 10))) : ''
          },
        },
        data: days.map((d) => ({
          value: [d.date, d.value] as [string, number],
          label: { color: d.value > max * 0.62 ? '#FFFFFF' : '#4B5563' },
        })),
      },
    ],
  }
}

function compactCount(v: number): string {
  if (v >= 10000) return `${Math.round(v / 1000)}k`
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`
  return String(Math.round(v))
}

export function heatmapMatrixOption(
  x: string[],
  y: string[],
  cells: [number, number, number][],
  opts?: { xName?: string; yName?: string },
): EChartsOption {
  // Only pairs that actually carry passengers are drawn; the rest stay as the
  // empty grid background so "no flow" reads as absence rather than as the
  // palest colour on the ramp.
  const present = cells.filter((c) => c[2] > 0)
  const sorted = present.map((c) => c[2]).sort((a, b) => a - b)
  const quantile = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? 0
  // A few hub flows are an order of magnitude above the rest, so a linear ramp
  // washes every other pair out. Quantile buckets keep mid-volume flows legible.
  const bounds = [...new Set([quantile(0.25), quantile(0.5), quantile(0.75), quantile(0.9)])].filter(
    (v) => v > 0,
  )
  const ramp = ['#DCEDE3', '#AEDCC5', '#75C4A0', '#3B9C71', '#1B7A4E']
  const pieces: { gt?: number; lte?: number; color: string; label: string }[] = []
  let lo = 0
  bounds.forEach((b, i) => {
    if (b <= lo) return
    pieces.push({ gt: lo, lte: b, color: ramp[i], label: `${compactCount(lo)}-${compactCount(b)}` })
    lo = b
  })
  pieces.push({ gt: lo, color: ramp[Math.min(pieces.length, ramp.length - 1)], label: `> ${compactCount(lo)}` })
  const dense = x.length <= 12 && y.length <= 12
  const strongFrom = bounds[bounds.length - 1] ?? Infinity

  return {
    tooltip: {
      position: 'top',
      formatter: (p: unknown) => {
        const v = p as { value?: [number, number, number] }
        if (!v.value) return ''
        return `${y[v.value[1]]} to ${x[v.value[0]]}<br/><b>${fmtInt(v.value[2])}</b> passengers`
      },
    },
    // The colour key sits to the right; along the bottom it collided with the
    // rotated axis labels.
    grid: { left: 76, right: 104, top: 24, bottom: 62, containLabel: false },
    xAxis: {
      type: 'category',
      data: x,
      name: opts?.xName,
      nameLocation: 'middle',
      nameGap: 44,
      nameTextStyle: { color: '#6b7280', fontSize: 11 },
      splitArea: { show: true },
      axisLabel: { ...axisLabel, rotate: 40 },
    },
    yAxis: {
      type: 'category',
      data: y,
      name: opts?.yName,
      nameLocation: 'middle',
      nameGap: 58,
      nameTextStyle: { color: '#6b7280', fontSize: 11 },
      splitArea: { show: true },
      axisLabel: axisLabel,
    },
    visualMap: {
      type: 'piecewise',
      pieces,
      orient: 'vertical',
      right: 8,
      top: 'center',
      itemWidth: 12,
      itemHeight: 12,
      itemGap: 4,
      textStyle: { color: '#6b7280', fontSize: 10 },
    },
    series: [
      {
        type: 'heatmap',
        // Label colour cannot vary by visualMap piece, so the contrast flip for
        // the darkest bucket is carried on each point.
        data: present.map((c) => ({
          value: c,
          label: { color: c[2] >= strongFrom ? '#FFFFFF' : '#1F2937' },
        })),
        label: {
          show: dense,
          fontSize: 10,
          formatter: (p: unknown) => compactCount((p as { value: [number, number, number] }).value[2]),
        },
        itemStyle: { borderColor: '#FFFFFF', borderWidth: 1 },
        emphasis: { itemStyle: { shadowBlur: 8, shadowColor: 'rgba(0,0,0,0.2)' } },
      },
    ],
  }
}

export function scatterOption(
  points: { x: number; y: number; size: number; name: string }[],
  opts?: { xName?: string; yName?: string },
): EChartsOption {
  const maxSize = Math.max(...points.map((p) => p.size), 1)
  return {
    tooltip: {
      trigger: 'item',
      formatter: (p: unknown) => {
        const item = p as { data?: { value: number[]; name: string } }
        if (!item.data) return ''
        const [x, y, size] = item.data.value
        return `<b>${item.data.name}</b><br/>${opts?.xName ?? 'X'}: ${fmtInt(x)}<br/>${opts?.yName ?? 'Y'}: ${fmtNum(y, 2)}<br/>Size: ${fmtInt(size)}`
      },
    },
    grid: { left: 56, right: 24, top: 32, bottom: 48, containLabel: true },
    xAxis: valueAxis(opts?.xName),
    yAxis: valueAxis(opts?.yName),
    series: [
      {
        type: 'scatter',
        data: points.map((p) => ({
          name: p.name,
          value: [p.x, p.y, p.size],
          symbolSize: 8 + (p.size / maxSize) * 36,
        })),
        itemStyle: { color: '#1B7A4E', opacity: 0.75 },
      },
    ],
  }
}

export function horizontalBarOption(
  rows: { name: string; value: number }[],
  unit: string,
  opts?: { showAverage?: boolean },
): EChartsOption {
  const sorted = [...rows].sort((a, b) => a.value - b.value)
  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: unknown) => {
        const p = (Array.isArray(params) ? params[0] : params) as { name?: string; value?: number }
        const shown = unit === '\u20B9' || unit === 'INR' ? fmtMoney(p.value ?? 0) : `${fmtInt(p.value ?? 0)}${unit ? ` ${unit}` : ''}`
        return `${p.name}: <b>${shown}</b>`
      },
    },
    grid: { left: 8, right: 48, top: 16, bottom: 16, containLabel: true },
    xAxis: valueAxis(unit),
    yAxis: { ...categoryAxis(), data: sorted.map((r) => r.name) },
    series: [
      {
        type: 'bar',
        data: sorted.map((r) => r.value),
        itemStyle: { color: '#1B7A4E', borderRadius: [0, 4, 4, 0] },
        barMaxWidth: 22,
        ...(opts?.showAverage ? markAvg() : {}),
      },
    ],
  }
}

/**
 * Ranked bars with share and cumulative share. Replaces donuts once a
 * dimension has more than about five categories, where slice areas stop being
 * comparable but bar lengths still are.
 */
export function rankedShareBarOption(
  rows: { name: string; value: number }[],
  opts: { unit: 'money' | 'int'; valueName: string },
): EChartsOption {
  const desc = [...rows].sort((a, b) => b.value - a.value)
  const total = desc.reduce((s, r) => s + r.value, 0) || 1
  const fmtV = (v: number) => (opts.unit === 'money' ? fmtMoney(v, { compact: v >= 1e5 }) : fmtInt(v))

  let running = 0
  const meta = new Map<string, { share: number; cum: number; rank: number }>()
  desc.forEach((r, i) => {
    running += r.value
    meta.set(r.name, { share: (r.value / total) * 100, cum: (running / total) * 100, rank: i + 1 })
  })

  const asc = [...desc].reverse()
  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: unknown) => {
        const p = (Array.isArray(params) ? params[0] : params) as { name?: string; value?: number }
        const m = meta.get(p.name ?? '')
        if (!m) return ''
        return [
          `<b>${p.name}</b> (rank ${m.rank} of ${desc.length})`,
          `${opts.valueName}: <b>${fmtV(p.value ?? 0)}</b>`,
          `Share: <b>${m.share.toFixed(1)}%</b>`,
          `Top ${m.rank} together: <b>${m.cum.toFixed(1)}%</b>`,
        ].join('<br/>')
      },
    },
    grid: { left: 8, right: 96, top: 8, bottom: 8, containLabel: true },
    xAxis: valueAxis(undefined, { axisLabel: { show: false }, splitLine: { show: false } }),
    yAxis: { ...categoryAxis(), data: asc.map((r) => r.name) },
    series: [
      {
        type: 'bar',
        data: asc.map((r) => r.value),
        itemStyle: { color: '#1B7A4E', borderRadius: [0, 4, 4, 0] },
        barMaxWidth: 18,
        label: {
          show: true,
          position: 'right',
          fontSize: 11,
          color: '#6b7280',
          formatter: (p: { name?: string; value?: unknown }) => {
            const m = meta.get(p.name ?? '')
            return `${fmtV(Number(p.value ?? 0))}  ${m ? `${m.share.toFixed(1)}%` : ''}`
          },
        },
      },
    ],
  }
}

/**
 * Period load factor with observed daily range. No unverified target line.
 */
export function kpiBulletOption(opts: {
  actual: number
  max?: number
  range?: { min: number; max: number }
  format: (v: number) => string
}): EChartsOption {
  const ceil = Math.max(opts.max ?? 0, opts.actual, opts.range?.max ?? 0, 1) * 1.08
  return {
    tooltip: {
      trigger: 'item',
      formatter: () =>
        [
          `Period average: <b>${opts.format(opts.actual)}</b>`,
          opts.range ? `Daily range: ${opts.format(opts.range.min)} to ${opts.format(opts.range.max)}` : '',
        ]
          .filter(Boolean)
          .join('<br/>'),
    },
    grid: { left: 8, right: 16, top: 34, bottom: 28, containLabel: true },
    xAxis: {
      type: 'value',
      max: ceil,
      axisLabel: { ...axisLabel, formatter: (v: number) => opts.format(v) },
      splitLine: { show: false },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    yAxis: { type: 'category', data: [''], show: false },
    series: [
      {
        type: 'bar',
        data: [ceil],
        barWidth: 30,
        itemStyle: { color: '#F1F3F5', borderRadius: 4 },
        silent: true,
        z: 1,
        ...(opts.range
          ? {
              markArea: {
                silent: true,
                data: [
                  [
                    { xAxis: opts.range.min, itemStyle: { color: 'rgba(27,122,78,0.13)' } },
                    { xAxis: opts.range.max },
                  ],
                ],
              },
            }
          : {}),
      },
      {
        type: 'bar',
        data: [opts.actual],
        barWidth: 12,
        barGap: '-100%',
        itemStyle: { color: '#1B7A4E', borderRadius: 2 },
        z: 3,
      },
    ],
  }
}

/**
 * Routes down the side, metrics across the top, each column normalised to its
 * own maximum. Survives many more series than a radar, which turns to spaghetti
 * past three or four overlapping shapes.
 */
export function normalizedMatrixOption(
  yLabels: string[],
  xLabels: string[],
  cells: { x: number; y: number; norm: number; display: string }[],
): EChartsOption {
  const lookup = new Map(cells.map((c) => [`${c.x}|${c.y}`, c]))
  return {
    tooltip: {
      position: 'top',
      formatter: (p: unknown) => {
        const v = (p as { value?: [number, number, number] }).value
        if (!v) return ''
        const cell = lookup.get(`${v[0]}|${v[1]}`)
        return `<b>${yLabels[v[1]]}</b><br/>${xLabels[v[0]]}: <b>${cell?.display ?? ''}</b><br/>${v[2].toFixed(0)}% of best route`
      },
    },
    grid: { left: 96, right: 24, top: 32, bottom: 56, containLabel: false },
    xAxis: {
      type: 'category',
      data: xLabels,
      position: 'top',
      splitArea: { show: true },
      axisLabel: { ...axisLabel, interval: 0 },
    },
    yAxis: { type: 'category', data: yLabels, splitArea: { show: true }, axisLabel },
    visualMap: {
      min: 0,
      max: 100,
      calculable: true,
      orient: 'horizontal',
      left: 'center',
      bottom: 0,
      text: ['Best', 'Weakest'],
      inRange: { color: ['#FEE2E2', '#FEF3C7', '#A8E6C5', '#1B7A4E'] },
      textStyle: { color: '#6b7280', fontSize: 11 },
    },
    series: [
      {
        type: 'heatmap',
        data: cells.map((c) => [c.x, c.y, Number(c.norm.toFixed(1))]),
        label: {
          show: true,
          fontSize: 10,
          color: '#111827',
          formatter: (p: { value?: unknown }) => {
            const v = p.value as [number, number, number]
            return lookup.get(`${v[0]}|${v[1]}`)?.display ?? ''
          },
        },
        emphasis: { itemStyle: { shadowBlur: 8, shadowColor: 'rgba(0,0,0,0.2)' } },
      },
    ],
  }
}

/**
 * Percentage change per metric as diverging bars. Grouped bars cannot compare
 * ridership, revenue and load factor on one axis; normalised change can.
 */
export function varianceBarOption(
  items: { label: string; pct: number; detail: string }[],
): EChartsOption {
  const asc = [...items].reverse()
  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: unknown) => {
        const p = (Array.isArray(params) ? params[0] : params) as { name?: string; value?: number }
        const item = items.find((i) => i.label === p.name)
        return `<b>${p.name}</b><br/>${item?.detail ?? ''}<br/>Change: <b>${(p.value ?? 0) > 0 ? '+' : ''}${(p.value ?? 0).toFixed(1)}%</b>`
      },
    },
    grid: { left: 8, right: 72, top: 16, bottom: 44, containLabel: true },
    xAxis: valueAxis('% change vs previous period', {
      nameLocation: 'middle',
      nameGap: 30,
      axisLine: { show: true, lineStyle: { color: '#dde1ea' } },
    }),
    yAxis: { ...categoryAxis(), data: asc.map((i) => i.label) },
    series: [
      {
        type: 'bar',
        data: asc.map((i) => ({
          value: Number(i.pct.toFixed(1)),
          itemStyle: { color: i.pct >= 0 ? '#1B7A4E' : '#DC2626', borderRadius: 3 },
        })),
        barMaxWidth: 20,
        label: {
          show: true,
          position: 'right',
          fontSize: 11,
          color: '#6b7280',
          formatter: (p: { value?: unknown }) => {
            const v = Number(p.value ?? 0)
            return `${v > 0 ? '+' : ''}${v.toFixed(1)}%`
          },
        },
      },
    ],
  }
}

/** One 100%-wide bar split into shares. Compact alternative to a two-slice donut. */
export function stackedShareBarOption(segments: { name: string; value: number }[]): EChartsOption {
  const total = segments.reduce((s, r) => s + r.value, 0) || 1
  return {
    tooltip: {
      trigger: 'item',
      formatter: (p: unknown) => {
        const item = p as { seriesName?: string; value?: number }
        return `${item.seriesName}: <b>${fmtInt(item.value ?? 0)}</b> (${(((item.value ?? 0) / total) * 100).toFixed(1)}%)`
      },
    },
    legend: { bottom: 0, left: 'center' },
    grid: { left: 8, right: 8, top: 16, bottom: 48, containLabel: true },
    xAxis: { type: 'value', max: total, show: false },
    yAxis: { type: 'category', data: [''], show: false },
    series: segments.map((s, i) => ({
      name: s.name,
      type: 'bar' as const,
      stack: 'share',
      data: [s.value],
      barWidth: 46,
      itemStyle: {
        color: COLORS[i % COLORS.length],
        borderRadius: i === 0 ? [4, 0, 0, 4] : i === segments.length - 1 ? [0, 4, 4, 0] : 0,
      },
      label: {
        show: true,
        color: '#fff',
        fontSize: 12,
        fontWeight: 600,
        formatter: () => `${((s.value / total) * 100).toFixed(1)}%`,
      },
    })),
  }
}

/**
 * Demand as an area against supply as a line, so hours where passengers rise
 * but service does not are visible rather than inferred from two charts.
 */
export function demandSupplyOption(opts: {
  labels: string[]
  demand: number[]
  supply: number[]
  demandName: string
  supplyName: string
  supplyUnit: string
}): EChartsOption {
  // Axis names are omitted on purpose: at this grid height they collide with
  // the legend. The axis labels are tinted to match their series instead.
  return {
    legend: { data: [opts.demandName, opts.supplyName], top: 0, left: 'center' },
    tooltip: tooltipUnits({ [opts.demandName]: 'pax', [opts.supplyName]: opts.supplyUnit }),
    grid: { left: 16, right: 16, top: 36, bottom: 48, containLabel: true },
    xAxis: {
      ...categoryAxis(),
      data: opts.labels,
      axisLabel: { ...axisLabel, rotate: 45, hideOverlap: true },
    },
    yAxis: [
      valueAxis(undefined, { axisLabel: { ...axisLabel, color: '#1B7A4E' } }),
      valueAxis(undefined, { axisLabel: { ...axisLabel, color: '#D97706' }, splitLine: { show: false } }),
    ],
    series: [
      {
        name: opts.demandName,
        type: 'line',
        data: opts.demand,
        smooth: true,
        showSymbol: false,
        areaStyle: { color: 'rgba(27,122,78,0.16)' },
        lineStyle: { width: 2, color: '#1B7A4E' },
        itemStyle: { color: '#1B7A4E' },
      },
      {
        name: opts.supplyName,
        type: 'line',
        yAxisIndex: 1,
        data: opts.supply,
        smooth: false,
        symbolSize: 5,
        step: 'middle',
        lineStyle: { width: 2, type: 'dashed', color: '#D97706' },
        itemStyle: { color: '#D97706' },
      },
    ],
  }
}

/**
 * Median line inside a min-max band. An average headway hides the day-to-day
 * spread that passengers actually experience.
 */
export function bandLineOption(opts: {
  labels: string[]
  median: (number | null)[]
  low: (number | null)[]
  high: (number | null)[]
  target?: number
  yName: string
  unit: string
  seriesName: string
}): EChartsOption {
  const spread = opts.high.map((h, i) => {
    const l = opts.low[i]
    return h == null || l == null ? null : Math.max(h - l, 0)
  })
  return {
    legend: { data: [opts.seriesName, 'Day-to-day range'] },
    tooltip: {
      trigger: 'axis',
      formatter: (params: unknown) => {
        const arr = params as Array<{ dataIndex: number; axisValueLabel?: string }>
        const i = arr[0]?.dataIndex ?? 0
        const med = opts.median[i]
        if (med == null) return `${arr[0]?.axisValueLabel ?? ''}<br/>No service`
        return [
          `<b>${arr[0]?.axisValueLabel ?? ''}</b>`,
          `${opts.seriesName}: <b>${fmtNum(med, 1)} ${opts.unit}</b>`,
          opts.low[i] != null && opts.high[i] != null
            ? `Range across days: ${fmtNum(opts.low[i] as number, 1)}\u2013${fmtNum(opts.high[i] as number, 1)} ${opts.unit}`
            : '',
        ]
          .filter(Boolean)
          .join('<br/>')
      },
    },
    grid: { left: 16, right: 32, top: 56, bottom: 48, containLabel: true },
    xAxis: {
      ...categoryAxis(),
      data: opts.labels,
      axisLabel: { ...axisLabel, rotate: 45, hideOverlap: true },
    },
    yAxis: valueAxis(opts.yName, { nameGap: 24 }),
    series: [
      {
        name: 'Day-to-day range',
        type: 'line',
        data: opts.low,
        stack: 'band',
        lineStyle: { opacity: 0 },
        showSymbol: false,
        silent: true,
        tooltip: { show: false },
        z: 1,
      },
      {
        name: 'Day-to-day range',
        type: 'line',
        data: spread,
        stack: 'band',
        lineStyle: { opacity: 0 },
        showSymbol: false,
        silent: true,
        areaStyle: { color: 'rgba(55,65,81,0.12)' },
        tooltip: { show: false },
        z: 1,
      },
      {
        name: opts.seriesName,
        type: 'line',
        data: opts.median,
        smooth: true,
        connectNulls: false,
        symbolSize: 5,
        lineStyle: { width: 2, color: '#374151' },
        itemStyle: { color: '#374151' },
        z: 3,
        ...(opts.target != null ? markTarget(opts.target, `Target ${opts.target} ${opts.unit}`) : {}),
      },
    ],
  }
}

/**
 * Scatter split at the medians so each route lands in a named quadrant with a
 * standing recommendation, instead of leaving the reading to the viewer.
 */
export function quadrantScatterOption(
  points: { x: number; y: number; size: number; name: string }[],
  opts: {
    xName: string
    yName: string
    xFormat: (v: number) => string
    yFormat: (v: number) => string
    quadrants: { tr: string; tl: string; br: string; bl: string }
  },
): EChartsOption {
  const median = (arr: number[]) => {
    if (arr.length === 0) return 0
    const s = [...arr].sort((a, b) => a - b)
    const mid = Math.floor(s.length / 2)
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
  }
  const xMed = median(points.map((p) => p.x))
  const yMed = median(points.map((p) => p.y))
  const xMax = Math.max(...points.map((p) => p.x), 1) * 1.1
  const yMax = Math.max(...points.map((p) => p.y), 1) * 1.15
  const maxSize = Math.max(...points.map((p) => p.size), 1)

  const zoneLabel = (text: string, x: number, y: number, align: 'left' | 'right') => ({
    name: text,
    xAxis: x,
    yAxis: y,
    value: text,
    symbol: 'none',
    label: {
      show: true,
      formatter: text,
      fontSize: 10,
      color: '#9CA3AF',
      align,
      verticalAlign: 'middle' as const,
    },
  })

  return {
    tooltip: {
      trigger: 'item',
      formatter: (p: unknown) => {
        const item = p as { data?: { value: number[]; name: string } }
        if (!item.data) return ''
        const [x, y, size] = item.data.value
        const zone =
          x >= xMed
            ? y >= yMed
              ? opts.quadrants.tr
              : opts.quadrants.br
            : y >= yMed
              ? opts.quadrants.tl
              : opts.quadrants.bl
        return [
          `<b>${item.data.name}</b>`,
          `${opts.xName}: ${opts.xFormat(x)}`,
          `${opts.yName}: ${opts.yFormat(y)}`,
          `Trips: ${fmtInt(size)}`,
          `<span style="color:#A8E6C5">${zone}</span>`,
        ].join('<br/>')
      },
    },
    grid: { left: 56, right: 32, top: 24, bottom: 56, containLabel: true },
    xAxis: valueAxis(opts.xName, { max: xMax }),
    yAxis: valueAxis(opts.yName, { max: yMax }),
    series: [
      {
        type: 'scatter',
        data: points.map((p) => ({
          name: p.name,
          value: [p.x, p.y, p.size],
          symbolSize: 10 + (p.size / maxSize) * 32,
        })),
        itemStyle: { color: '#1B7A4E', opacity: 0.75 },
        label: {
          show: points.length <= 14,
          position: 'right',
          fontSize: 10,
          color: '#6b7280',
          formatter: (p: { name?: string }) => p.name ?? '',
        },
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { color: '#9CA3AF', type: 'dashed' as const, width: 1 },
          label: { show: false },
          data: [{ xAxis: xMed }, { yAxis: yMed }],
        },
        markPoint: {
          silent: true,
          data: [
            zoneLabel(opts.quadrants.tr, xMax * 0.98, yMax * 0.96, 'right'),
            zoneLabel(opts.quadrants.tl, xMax * 0.02, yMax * 0.96, 'left'),
            zoneLabel(opts.quadrants.br, xMax * 0.98, yMax * 0.04, 'right'),
            zoneLabel(opts.quadrants.bl, xMax * 0.02, yMax * 0.04, 'left'),
          ],
        },
      },
    ],
  }
}

/**
 * Two panels sharing one date axis. Honest where a dual-axis overlay is not:
 * the reader cannot be tricked by where two unrelated scales happen to cross.
 */
export function stackedPanelsOption(opts: {
  labels: string[]
  top: { name: string; values: number[]; color: string; unit: string; overlay?: { name: string; values: (number | null)[] } }
  bottom: { name: string; values: number[]; color: string; unit: string }
  rotateLabels?: boolean
  showValues?: boolean
}): EChartsOption {
  const units: Record<string, string> = {
    [opts.top.name]: opts.top.unit,
    [opts.bottom.name]: opts.bottom.unit,
  }
  if (opts.top.overlay) units[opts.top.overlay.name] = opts.top.unit

  // As with the demand/supply chart, the panels are identified by the legend
  // and by tinted axis labels rather than by axis names that would be clipped.
  return {
    legend: {
      data: [opts.top.name, ...(opts.top.overlay ? [opts.top.overlay.name] : []), opts.bottom.name],
      top: 0,
      left: 'center',
    },
    tooltip: { ...tooltipUnits(units), axisPointer: { type: 'cross' } },
    axisPointer: { link: [{ xAxisIndex: 'all' }] },
    grid: [
      { left: 16, right: 24, top: 36, height: '40%', containLabel: true },
      { left: 16, right: 24, top: '60%', height: '24%', containLabel: true },
    ],
    xAxis: [
      { ...categoryAxis(), gridIndex: 0, data: opts.labels, axisLabel: { show: false } },
      {
        ...categoryAxis(),
        gridIndex: 1,
        data: opts.labels,
        axisLabel: { ...axisLabel, rotate: opts.rotateLabels ? 30 : 0, hideOverlap: true },
      },
    ],
    yAxis: [
      {
        ...valueAxis(undefined, { axisLabel: { ...axisLabel, color: opts.top.color } }),
        gridIndex: 0,
      },
      {
        ...valueAxis(undefined, { axisLabel: { ...axisLabel, color: opts.bottom.color }, splitNumber: 3 }),
        gridIndex: 1,
      },
    ],
    series: [
      {
        name: opts.top.name,
        type: 'bar',
        xAxisIndex: 0,
        yAxisIndex: 0,
        data: opts.top.values,
        itemStyle: { color: opts.top.color, borderRadius: [6, 6, 0, 0] },
        barMaxWidth: 26,
        ...(opts.showValues ? valueLabels(true, (v) => fmtInt(v)) : {}),
      },
      ...(opts.top.overlay
        ? [
            {
              name: opts.top.overlay.name,
              type: 'line' as const,
              xAxisIndex: 0,
              yAxisIndex: 0,
              data: opts.top.overlay.values,
              smooth: true,
              showSymbol: false,
              lineStyle: { width: 2, type: 'dashed' as const, color: '#111827' },
              itemStyle: { color: '#111827' },
            },
          ]
        : []),
      {
        name: opts.bottom.name,
        type: 'line',
        xAxisIndex: 1,
        yAxisIndex: 1,
        data: opts.bottom.values,
        smooth: true,
        symbolSize: 5,
        areaStyle: { color: 'rgba(47,158,106,0.14)' },
        lineStyle: { width: 2, color: opts.bottom.color },
        itemStyle: { color: opts.bottom.color },
      },
    ],
  }
}

/**
 * Compact bar for small-multiple grids: track + actual, optionally an actual
 * bullet chart when `target`/`bands` are supplied — a target tick (markLine)
 * and qualitative poor/fair/good background zones instead of a plain track.
 * With neither, the output is unchanged from the original 2-series shape.
 */
export function bulletOption(
  actual: number,
  max: number,
  opts?: {
    format?: (v: number) => string
    /** Vertical reference tick, e.g. a sourced benchmark value. */
    target?: number
    /** Ascending qualitative background zones (poor→good), each an upper bound + color. */
    bands?: { to: number; color: string }[]
  },
): EChartsOption {
  const fmt = opts?.format ?? ((v: number) => fmtNum(v, 1))
  const target = opts?.target
  const bands = opts?.bands
  const bandCeil = bands && bands.length > 0 ? bands[bands.length - 1].to : 0
  const ceil = Math.max(max, actual, target ?? 0, bandCeil, 1)

  const tooltipFormatter = () =>
    target != null
      ? `Load factor: <b>${fmt(actual)}</b> \u00b7 target ${fmt(target)}`
      : `Load factor: <b>${fmt(actual)}</b>`

  const targetMarkLine =
    target != null
      ? {
          symbol: 'none' as const,
          silent: true,
          animation: false,
          lineStyle: { color: '#111827', width: 2, type: 'solid' as const },
          label: { show: false },
          data: [{ xAxis: target }],
        }
      : undefined

  const shared = {
    tooltip: { trigger: 'item' as const, formatter: tooltipFormatter },
    grid: { left: 4, right: 44, top: 10, bottom: 10, containLabel: true },
    xAxis: { type: 'value' as const, max: ceil, show: false },
    yAxis: { type: 'category' as const, data: [''], show: false },
  }

  if (!bands || bands.length === 0) {
    // Unchanged from the pre-existing shape (same series count/colors) when
    // called without bands, so plain track+actual usage is unaffected.
    return {
      ...shared,
      series: [
        { type: 'bar', data: [ceil], barWidth: 16, itemStyle: { color: '#F1F3F5', borderRadius: 3 }, silent: true, z: 1 },
        {
          type: 'bar',
          data: [actual],
          barWidth: 16,
          barGap: '-100%',
          itemStyle: { color: '#1B7A4E', borderRadius: 3 },
          label: {
            show: true,
            position: 'right',
            distance: 6,
            fontSize: 11,
            fontWeight: 600,
            color: '#374151',
            formatter: () => fmt(actual),
          },
          markLine: targetMarkLine,
          z: 2,
        },
      ],
    }
  }

  // Qualitative bands as stacked background segments — each series' `data`
  // is the segment's WIDTH (to - previous band's to), not a cumulative
  // value, so stacking them left-to-right paints consecutive colored zones
  // across the full 0..ceil range. The last segment is stretched to `ceil`
  // so the background never falls short if the actual value exceeds every
  // defined band.
  const segments = bands.map((b, i) => {
    const lo = i === 0 ? 0 : bands[i - 1].to
    const hi = i === bands.length - 1 ? Math.max(b.to, ceil) : b.to
    return { width: Math.max(0, hi - lo), color: b.color }
  })

  return {
    ...shared,
    series: [
      ...segments.map((s) => ({
        type: 'bar' as const,
        stack: 'bands',
        data: [s.width],
        barWidth: 16,
        itemStyle: { color: s.color },
        silent: true,
        z: 1,
      })),
      {
        type: 'bar',
        data: [actual],
        barWidth: 7,
        barGap: '-100%',
        itemStyle: { color: '#111827', borderRadius: 2 },
        label: {
          show: true,
          position: 'right',
          distance: 6,
          fontSize: 11,
          fontWeight: 600,
          color: '#374151',
          formatter: () => fmt(actual),
        },
        markLine: targetMarkLine,
        z: 2,
      },
    ],
  }
}

/* ── Chart component ──────────────────────────────────────────────────── */

export type ChartEventHandlers = {
  click?: (params: unknown) => void
  brushselected?: (params: unknown) => void
  datazoom?: (params: unknown) => void
}

export function Chart({
  option,
  height = 320,
  loading = false,
  empty = false,
  emptyMessage = 'No data for this selection.',
  group,
  onEvent,
}: {
  option: EChartsOption
  height?: number
  loading?: boolean
  empty?: boolean
  emptyMessage?: string
  /** Charts sharing a group id sync hover via echarts.connect. */
  group?: string
  onEvent?: ChartEventHandlers
}) {
  const ref = useRef<InstanceType<typeof ReactECharts> | null>(null)

  useEffect(() => {
    const inst = ref.current?.getEchartsInstance()
    if (!inst) return
    if (group) {
      inst.group = group
      echarts.connect(group)
    }
    if (loading) inst.showLoading('default', {
      text: '',
      color: '#1B7A4E',
      maskColor: 'rgba(255,255,255,0.6)',
      spinnerRadius: 12,
      lineWidth: 2,
    })
    else inst.hideLoading()
  }, [group, loading])

  if (empty) {
    return (
      <div className="chart-plot chart-empty" style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <EmptyState>{emptyMessage}</EmptyState>
      </div>
    )
  }

  const events: Record<string, (p: unknown) => void> = {}
  if (onEvent?.click) events.click = onEvent.click
  if (onEvent?.brushselected) events.brushselected = onEvent.brushselected
  if (onEvent?.datazoom) events.datazoom = onEvent.datazoom

  return (
    <div className="chart-plot" style={{ height }}>
      <ReactECharts
        ref={ref}
        option={baseOption({ ...a11yDecal(), ...option })}
        style={{ height: '100%', width: '100%' }}
        opts={{ renderer: 'canvas' }}
        notMerge
        lazyUpdate
        onEvents={events}
      />
    </div>
  )
}
