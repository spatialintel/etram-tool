export interface SkeletonProps {
  width?: number | string
  height?: number | string
  radius?: number | string
  className?: string
}

export function Skeleton({ width = '100%', height = 16, radius = 8, className }: SkeletonProps) {
  return (
    <span
      className={['ui-skeleton', className].filter(Boolean).join(' ')}
      style={{ width, height, borderRadius: radius }}
      aria-hidden="true"
    />
  )
}

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={['ui-skeleton-card', className].filter(Boolean).join(' ')} aria-hidden="true">
      <Skeleton width="40%" height={12} />
      <Skeleton width="70%" height={28} />
      <Skeleton width="55%" height={12} />
    </div>
  )
}

export function SkeletonChart({ height = 280, className }: { height?: number; className?: string }) {
  return (
    <div className={['ui-skeleton-chart', className].filter(Boolean).join(' ')} style={{ height }} aria-hidden="true">
      <Skeleton width="30%" height={14} />
      <Skeleton width="100%" height={height - 40} radius={12} />
    </div>
  )
}

export function SkeletonPage() {
  return (
    <div className="page" aria-busy="true" aria-label="Loading dashboard">
      <div className="bento-kpi">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
      <div className="bento-mid">
        <SkeletonChart height={320} />
        <SkeletonChart height={280} />
      </div>
    </div>
  )
}
