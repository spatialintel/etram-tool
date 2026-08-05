import { useMemo, useState, type ReactNode } from 'react'
import { SearchInput } from './SearchInput'

export type ThresholdTone = 'good' | 'warn' | 'bad'

export type Column<T> = {
  key: keyof T & string
  header: string
  align?: 'left' | 'right'
  width?: number
  format?: (v: unknown, row: T) => ReactNode
  sortable?: boolean
  /** Render a proportional bar behind a numeric cell. */
  bar?: boolean
  threshold?: (v: number) => ThresholdTone | undefined
  /** When false, the column is excluded from CSV and totals. Default true for numbers. */
  numeric?: boolean
}

export type DataTableProps<T> = {
  rows: T[]
  columns: Column<T>[]
  initialSort?: { key: string; dir: 'asc' | 'desc' }
  pageSize?: number
  onRowClick?: (row: T) => void
  stickyHeader?: boolean
  totalsRow?: boolean
  exportName?: string
  searchable?: boolean
  emptyMessage?: string
  className?: string
  rowKey?: (row: T, index: number) => string
}

function isNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

function compareValues(a: unknown, b: unknown): number {
  if (isNumber(a) && isNumber(b)) return a - b
  return String(a ?? '').localeCompare(String(b ?? ''), undefined, { numeric: true, sensitivity: 'base' })
}

function csvEscape(v: unknown): string {
  const s = v == null ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function downloadCsv(name: string, headers: string[], body: string[][]) {
  const lines = [headers.map(csvEscape).join(','), ...body.map((r) => r.map(csvEscape).join(','))]
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${name}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export function DataTable<T extends object>({
  rows,
  columns,
  initialSort,
  pageSize = 25,
  onRowClick,
  stickyHeader = true,
  totalsRow = false,
  exportName,
  searchable = false,
  emptyMessage = 'No rows to show.',
  className,
  rowKey,
}: DataTableProps<T>) {
  const [sort, setSort] = useState(initialSort ?? null)
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)

  const get = (row: T, key: keyof T & string): unknown => (row as Record<string, unknown>)[key]

  const filtered = useMemo(() => {
    if (!query.trim()) return rows
    const q = query.trim().toLowerCase()
    return rows.filter((row) =>
      columns.some((c) => String(get(row, c.key) ?? '').toLowerCase().includes(q)),
    )
  }, [rows, columns, query])

  const sorted = useMemo(() => {
    if (!sort) return filtered
    const col = columns.find((c) => c.key === sort.key)
    if (!col) return filtered
    const dir = sort.dir === 'asc' ? 1 : -1
    return [...filtered].sort((a, b) => dir * compareValues(get(a, col.key), get(b, col.key)))
  }, [filtered, sort, columns])

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize))
  const safePage = Math.min(page, pageCount - 1)
  const pageRows = sorted.slice(safePage * pageSize, safePage * pageSize + pageSize)

  const maxByKey = useMemo(() => {
    const out: Record<string, number> = {}
    for (const c of columns) {
      if (!c.bar) continue
      out[c.key] = Math.max(0, ...rows.map((r) => {
        const v = get(r, c.key)
        return isNumber(v) ? v : 0
      }))
    }
    return out
  }, [columns, rows])

  const totals = useMemo(() => {
    if (!totalsRow) return null
    const out: Record<string, number | null> = {}
    for (const c of columns) {
      const nums = filtered.map((r) => get(r, c.key)).filter(isNumber)
      out[c.key] = c.numeric === false || nums.length === 0 ? null : nums.reduce((s, n) => s + n, 0)
    }
    return out
  }, [totalsRow, columns, filtered])

  const toggleSort = (key: string, sortable?: boolean) => {
    if (sortable === false) return
    setPage(0)
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: 'desc' }
      if (prev.dir === 'desc') return { key, dir: 'asc' }
      return null
    })
  }

  const exportCsv = () => {
    if (!exportName) return
    downloadCsv(
      exportName,
      columns.map((c) => c.header),
      sorted.map((row) => columns.map((c) => {
        const v = get(row, c.key)
        return isNumber(v) ? String(v) : String(v ?? '')
      })),
    )
  }

  return (
    <div className={['ui-datatable', className].filter(Boolean).join(' ')}>
      {(searchable || exportName) && (
        <div className="ui-datatable-toolbar">
          {searchable && (
            <SearchInput
              value={query}
              onChange={(v) => { setQuery(v); setPage(0) }}
              placeholder="Search table"
              ariaLabel="Search table"
            />
          )}
          {exportName && (
            <button type="button" className="ui-link-btn" onClick={exportCsv} disabled={sorted.length === 0}>
              Export CSV
            </button>
          )}
          <span className="ui-datatable-count">{filtered.length} row{filtered.length === 1 ? '' : 's'}</span>
        </div>
      )}

      <div className="ui-datatable-wrap">
        <table className={`ui-datatable-table${stickyHeader ? ' is-sticky' : ''}`}>
          <thead>
            <tr>
              {columns.map((c) => {
                const active = sort?.key === c.key
                const sortable = c.sortable !== false
                return (
                  <th
                    key={c.key}
                    style={c.width ? { width: c.width } : undefined}
                    className={[c.align === 'right' ? 'is-right' : '', sortable ? 'is-sortable' : '', active ? 'is-sorted' : ''].filter(Boolean).join(' ')}
                    aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                    onClick={() => toggleSort(c.key, c.sortable)}
                  >
                    <span className="ui-datatable-th">
                      {c.header}
                      {sortable && (
                        <span className="ui-datatable-sort" aria-hidden="true">
                          {active ? (sort.dir === 'asc' ? '\u25B2' : '\u25BC') : '\u2195'}
                        </span>
                      )}
                    </span>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="ui-datatable-empty">{emptyMessage}</td>
              </tr>
            ) : (
              pageRows.map((row, i) => (
                <tr
                  key={rowKey ? rowKey(row, safePage * pageSize + i) : safePage * pageSize + i}
                  className={onRowClick ? 'is-clickable' : undefined}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                  onKeyDown={onRowClick ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onRowClick(row) }
                  } : undefined}
                >
                  {columns.map((c) => {
                    const raw = get(row, c.key)
                    const tone = isNumber(raw) && c.threshold ? c.threshold(raw) : undefined
                    const barPct = c.bar && isNumber(raw) && maxByKey[c.key] > 0
                      ? Math.max(0, Math.min(100, (raw / maxByKey[c.key]) * 100))
                      : null
                    return (
                      <td
                        key={c.key}
                        className={[c.align === 'right' || isNumber(raw) ? 'is-right' : '', tone ? `is-${tone}` : ''].filter(Boolean).join(' ')}
                      >
                        {barPct != null && (
                          <span className="ui-datatable-bar" style={{ width: `${barPct}%` }} aria-hidden="true" />
                        )}
                        <span className="ui-datatable-cell">
                          {c.format ? c.format(raw, row) : isNumber(raw) ? raw.toLocaleString('en-IN') : String(raw ?? '\u2014')}
                        </span>
                      </td>
                    )
                  })}
                </tr>
              ))
            )}
          </tbody>
          {totals && (
            <tfoot>
              <tr>
                {columns.map((c, i) => (
                  <td key={c.key} className={c.align === 'right' || totals[c.key] != null ? 'is-right' : undefined}>
                    {i === 0 && totals[c.key] == null
                      ? 'Total'
                      : totals[c.key] != null
                        ? (c.format ? c.format(totals[c.key], {} as T) : (totals[c.key] as number).toLocaleString('en-IN'))
                        : ''}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {sorted.length > pageSize && (
        <div className="ui-datatable-pager">
          <button type="button" className="ui-link-btn" disabled={safePage === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
            Previous
          </button>
          <span>
            Page {safePage + 1} of {pageCount}
          </span>
          <button type="button" className="ui-link-btn" disabled={safePage >= pageCount - 1} onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}>
            Next
          </button>
        </div>
      )}
    </div>
  )
}
