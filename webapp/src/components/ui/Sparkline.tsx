const TONE: Record<'brand' | 'muted' | 'up' | 'down', string> = {
  brand: '#1B7A4E',
  muted: '#9CA3AF',
  up: '#1B7A4E',
  down: '#DC2626',
}

export interface SparklineProps {
  values: number[]
  width?: number
  height?: number
  tone?: 'brand' | 'muted' | 'up' | 'down'
  className?: string
  /**
   * Stretch to the container width instead of holding a fixed pixel width.
   * Strokes and the end marker are drawn at a constant size so the line does
   * not smear when the box is narrow.
   */
  fluid?: boolean
}

/**
 * Tiny inline SVG sparkline. Kept out of ECharts so StatCards and table cells
 * stay cheap to render.
 */
export function Sparkline({ values, width = 96, height = 28, tone = 'brand', className, fluid }: SparklineProps) {
  if (values.length < 2) {
    return <svg width={width} height={height} className={className} aria-hidden="true" />
  }

  const lo = Math.min(...values)
  const hi = Math.max(...values)
  // Anchoring at zero for non-negative series keeps a 5% wobble looking like a
  // 5% wobble. A min-max domain stretches routine variation into fake drama.
  const min = lo >= 0 ? 0 : lo
  const max = hi
  const span = max - min || 1
  const pad = 2
  const innerW = width - pad * 2
  const innerH = height - pad * 2

  const points = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * innerW
    const y = pad + innerH - ((v - min) / span) * innerH
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })

  const last = values[values.length - 1]
  const lastX = pad + innerW
  const lastY = pad + innerH - ((last - min) / span) * innerH
  const color = TONE[tone]

  return (
    <svg
      width={fluid ? '100%' : width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio={fluid ? 'none' : undefined}
      className={['ui-sparkline', fluid ? 'is-fluid' : '', className].filter(Boolean).join(' ')}
      role="img"
      aria-label={`Trend across ${values.length} periods, from ${lo} to ${hi}`}
    >
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect={fluid ? 'non-scaling-stroke' : undefined}
        points={points.join(' ')}
      />
      {fluid ? (
        // A zero-length round cap stays a circle under non-uniform scaling,
        // which a <circle> would not.
        <line
          x1={lastX}
          y1={lastY}
          x2={lastX}
          y2={lastY}
          stroke={color}
          strokeWidth="4"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      ) : (
        <circle cx={lastX} cy={lastY} r="2" fill={color} />
      )}
    </svg>
  )
}
