import { describe, expect, it } from 'vitest'
import {
  markAvg,
  markBands,
  markExtremes,
  markTarget,
  trendSeries,
  zoomDefaults,
  toolboxDefaults,
  valueLabels,
  a11yDecal,
  donutOption,
  heatmapMatrixOption,
  horizontalBarOption,
  bulletOption,
  scatterOption,
  kpiBulletOption,
  normalizedMatrixOption,
  quadrantScatterOption,
  rankedShareBarOption,
  stackedShareBarOption,
  varianceBarOption,
} from '../components/Chart'

describe('mark helpers', () => {
  it('builds an average markLine', () => {
    const m = markAvg('Avg') as { markLine: { data: Array<{ type: string }>; lineStyle: { type: string } } }
    expect(m.markLine.data[0]).toEqual(expect.objectContaining({ type: 'average' }))
    expect(m.markLine.lineStyle.type).toBe('dashed')
  })

  it('builds a target markLine at a fixed y', () => {
    const m = markTarget(0.6, 'LF target') as { markLine: { data: Array<{ yAxis: number }> } }
    expect(m.markLine.data[0]).toEqual(expect.objectContaining({ yAxis: 0.6 }))
  })

  it('builds tone-coloured bands', () => {
    const m = markBands([
      { from: 0, to: 0.4, tone: 'bad' },
      { from: 0.4, to: 0.6, tone: 'warn' },
      { from: 0.6, to: 1, tone: 'good' },
    ]) as { markArea: { data: Array<[{ yAxis: number }, { yAxis: number }]> } }
    expect(m.markArea.data).toHaveLength(3)
    expect(m.markArea.data[0][0].yAxis).toBe(0)
    expect(m.markArea.data[2][1].yAxis).toBe(1)
  })

  it('builds max/min markPoints', () => {
    const m = markExtremes() as { markPoint: { data: Array<{ type: string }> } }
    expect(m.markPoint.data.map((d) => d.type)).toEqual(['max', 'min'])
  })

  it('builds a dashed trend series from a perfect line', () => {
    const s = trendSeries([0, 2, 4, 6], 'Trend')
    expect(s.name).toBe('Trend')
    expect(s.type).toBe('line')
    expect(s.lineStyle.type).toBe('dashed')
    expect(s.data[0]).toBeCloseTo(0, 10)
    expect(s.data[3]).toBeCloseTo(6, 10)
  })
})

describe('interaction defaults', () => {
  it('ships inside + slider zoom', () => {
    const z = zoomDefaults({ start: 10, end: 90 })
    expect(z.dataZoom).toHaveLength(2)
    expect(z.dataZoom[0].type).toBe('inside')
    expect(z.dataZoom[1].start).toBe(10)
  })

  it('offers reset without an image download', () => {
    const t = toolboxDefaults('ridership')
    expect(t.toolbox.feature.restore).toBeDefined()
    expect('saveAsImage' in t.toolbox.feature).toBe(false)
  })

  it('toggles value labels', () => {
    const on = valueLabels(true) as { label: { show: boolean } }
    const off = valueLabels(false) as { label: { show: boolean } }
    expect(on.label.show).toBe(true)
    expect(off.label.show).toBe(false)
  })

  it('keeps screen-reader descriptions on but leaves hatch decals off', () => {
    expect(a11yDecal().aria.enabled).toBe(true)
    expect(a11yDecal().aria.decal.show).toBe(false)
  })
})

describe('builders', () => {
  it('builds a donut with a centre total', () => {
    const opt = donutOption(
      [
        { name: 'R1', value: 100 },
        { name: 'R2', value: 50 },
      ],
      'Ridership',
    )
    const series = Array.isArray(opt.series) ? opt.series : [opt.series]
    expect(series[0]).toEqual(expect.objectContaining({ type: 'pie' }))
    expect(opt.graphic).toBeDefined()
  })

  it('sorts horizontal bars ascending so the largest sits at the top', () => {
    const opt = horizontalBarOption(
      [
        { name: 'A', value: 10 },
        { name: 'B', value: 30 },
        { name: 'C', value: 20 },
      ],
      'pax',
      { showAverage: true },
    )
    const series = (Array.isArray(opt.series) ? opt.series : [opt.series]) as Array<{ data: number[]; markLine?: unknown }>
    expect(series[0].data).toEqual([10, 20, 30])
    expect(series[0].markLine).toBeDefined()
  })

  it('colours a bullet green when actual meets target', () => {
    const opt = bulletOption(80, 60, 100)
    const series = (Array.isArray(opt.series) ? opt.series : [opt.series]) as Array<{ data: number[]; itemStyle?: { color: string } }>
    expect(series[1].data[0]).toBe(80)
    expect(series[1].itemStyle?.color).toBe('#1B7A4E')
  })

  it('colours a bullet amber when actual misses target', () => {
    const opt = bulletOption(40, 60, 100)
    const series = (Array.isArray(opt.series) ? opt.series : [opt.series]) as Array<{ itemStyle?: { color: string } }>
    expect(series[1].itemStyle?.color).toBe('#D97706')
  })

  it('ranks share bars with the largest at the top', () => {
    const opt = rankedShareBarOption(
      [
        { name: 'A', value: 10 },
        { name: 'B', value: 60 },
        { name: 'C', value: 30 },
      ],
      { unit: 'money', valueName: 'Revenue' },
    )
    const y = opt.yAxis as { data: string[] }
    expect(y.data).toEqual(['A', 'C', 'B'])
  })

  it('draws the bullet target line and the observed range', () => {
    const opt = kpiBulletOption({
      actual: 0.55,
      target: 0.6,
      range: { min: 0.4, max: 0.7 },
      format: (v) => `${v}`,
    })
    const series = (Array.isArray(opt.series) ? opt.series : [opt.series]) as Array<{
      itemStyle?: { color: string }
      markLine?: { data: Array<{ xAxis: number }> }
      markArea?: { data: Array<Array<{ xAxis: number }>> }
    }>
    // Track (carrying the observed range as a band) and the actual bar.
    expect(series).toHaveLength(2)
    expect(series[0].markArea?.data[0][0].xAxis).toBe(0.4)
    expect(series[0].markArea?.data[0][1].xAxis).toBe(0.7)
    expect(series[1].markLine?.data[0].xAxis).toBe(0.6)
    expect(series[1].itemStyle?.color).toBe('#D97706')
  })

  it('normalises each matrix column to its own best value', () => {
    const opt = normalizedMatrixOption(
      ['R1', 'R2'],
      ['Load factor'],
      [
        { x: 0, y: 0, norm: 100, display: '80%' },
        { x: 0, y: 1, norm: 50, display: '40%' },
      ],
    )
    const vm = opt.visualMap as { min: number; max: number }
    expect(vm.min).toBe(0)
    expect(vm.max).toBe(100)
  })

  it('colours variance bars by direction of change', () => {
    const opt = varianceBarOption([
      { label: 'Ridership', pct: 12.4, detail: 'a' },
      { label: 'Revenue', pct: -3.1, detail: 'b' },
    ])
    const series = (Array.isArray(opt.series) ? opt.series : [opt.series]) as Array<{
      data: Array<{ value: number; itemStyle: { color: string } }>
    }>
    // reversed so the first listed metric sits at the top of a category axis
    expect(series[0].data[0].itemStyle.color).toBe('#DC2626')
    expect(series[0].data[1].itemStyle.color).toBe('#1B7A4E')
  })

  it('stacks share segments to the total', () => {
    const opt = stackedShareBarOption([
      { name: 'Male', value: 60 },
      { name: 'Female', value: 40 },
    ])
    const x = opt.xAxis as { max: number }
    expect(x.max).toBe(100)
  })

  it('splits the quadrant scatter at the medians', () => {
    const opt = quadrantScatterOption(
      [
        { x: 10, y: 20, size: 1, name: 'A' },
        { x: 30, y: 40, size: 2, name: 'B' },
        { x: 50, y: 60, size: 3, name: 'C' },
      ],
      {
        xName: 'x',
        yName: 'y',
        xFormat: String,
        yFormat: String,
        quadrants: { tr: 'tr', tl: 'tl', br: 'br', bl: 'bl' },
      },
    )
    const series = (Array.isArray(opt.series) ? opt.series : [opt.series]) as Array<{
      markLine: { data: Array<{ xAxis?: number; yAxis?: number }> }
      markPoint: { data: unknown[] }
    }>
    expect(series[0].markLine.data[0].xAxis).toBe(30)
    expect(series[0].markLine.data[1].yAxis).toBe(40)
    expect(series[0].markPoint.data).toHaveLength(4)
  })

  it('scales scatter bubbles by size', () => {
    const opt = scatterOption(
      [
        { x: 100, y: 0.5, size: 10, name: 'A' },
        { x: 200, y: 0.8, size: 50, name: 'B' },
      ],
      { xName: 'Ridership', yName: 'LF' },
    )
    const series = (Array.isArray(opt.series) ? opt.series : [opt.series]) as Array<{ data: Array<{ symbolSize: number }> }>
    expect(series[0].data[1].symbolSize).toBeGreaterThan(series[0].data[0].symbolSize)
  })

  it('drops empty flow cells and buckets the matrix colour scale by quantile', () => {
    const cells: [number, number, number][] = [
      [0, 0, 0],
      [1, 0, 40],
      [0, 1, 120],
      [1, 1, 9000],
    ]
    const opt = heatmapMatrixOption(['A', 'B'], ['X', 'Y'], cells)
    const series = (Array.isArray(opt.series) ? opt.series : [opt.series]) as Array<{
      data: Array<{ value: [number, number, number] }>
    }>
    expect(series[0].data).toHaveLength(3)
    const vm = opt.visualMap as { type: string; pieces: Array<{ gt?: number; lte?: number }> }
    expect(vm.type).toBe('piecewise')
    // A dominant flow must not compress every other pair into one pale bucket.
    expect(vm.pieces.length).toBeGreaterThan(1)
    expect(vm.pieces[0].lte).toBeLessThan(9000)
  })
})
