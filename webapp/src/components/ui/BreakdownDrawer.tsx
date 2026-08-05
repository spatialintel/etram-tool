import type { ReactNode } from 'react'
import { Drawer } from './Drawer'

export interface BreakdownStat {
  label: string
  value: string
  hint?: string
}

export interface BreakdownTableColumn {
  key: string
  label: string
  align?: 'left' | 'right'
}

/** Compact read-only table for drawer detail. Sorting lives on the page tables. */
export function BreakdownTable({
  columns,
  rows,
  caption,
}: {
  columns: BreakdownTableColumn[]
  rows: Record<string, ReactNode>[]
  caption?: string
}) {
  return (
    <div className="breakdown-section">
      {caption && <div className="breakdown-section-title">{caption}</div>}
      <table className="breakdown-table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={c.align === 'right' ? 'is-right' : undefined}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={String(r.__key ?? i)}>
              {columns.map((c) => (
                <td key={c.key} className={c.align === 'right' ? 'is-right' : undefined}>{r[c.key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export interface BreakdownDrawerProps {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  /** Headline numbers for the thing being broken down. */
  stats?: BreakdownStat[]
  /** One or two sentences on how to read the panel, or what to do about it. */
  note?: ReactNode
  children?: ReactNode
  width?: number
}

/**
 * The shared "click a card, see what is underneath it" panel: the same
 * headline stats, guidance and detail layout on every page.
 */
export function BreakdownDrawer({
  open,
  onClose,
  title,
  subtitle,
  stats,
  note,
  children,
  width = 560,
}: BreakdownDrawerProps) {
  return (
    <Drawer open={open} onClose={onClose} title={title} subtitle={subtitle} width={width}>
      {stats && stats.length > 0 && (
        <dl className="ops-grid breakdown-stats">
          {stats.map((s) => (
            <div key={s.label}>
              <dt className="ops-item-label">{s.label}</dt>
              <dd className="ops-item-value">{s.value}</dd>
              {s.hint && <dd className="breakdown-hint">{s.hint}</dd>}
            </div>
          ))}
        </dl>
      )}
      {note && <p className="breakdown-note">{note}</p>}
      {children}
    </Drawer>
  )
}
