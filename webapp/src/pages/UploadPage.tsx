import { useEffect, useState } from 'react'
import { Button, Card, DataTable, StatusBadge, useToast, type Column } from '../components/ui'
import { fmtBytes } from '../lib/format'
import { classifyFile, validateExcelFile } from '../lib/upload'
import type { DashboardData } from '../types'

function relativeTime(iso: string): string {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return iso
  const sec = Math.round((Date.now() - t) / 1000)
  if (sec < 60) return `${sec}s ago`
  const min = Math.round(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.round(min / 60)
  if (hr < 48) return `${hr}h ago`
  return new Date(iso).toLocaleString()
}

function stepIndex(status: string, hasFiles: boolean, hasResult: boolean): number {
  if (hasResult || status === 'succeeded') return 3
  if (status === 'running' || status === 'queued') return 2
  if (hasFiles) return 1
  return 0
}

type JobRow = {
  id: string
  status: string
  created_at: string
  error: string | null
  logs: string[] | null
  shortId: string
  createdLabel: string
}

export function UploadPage({ onDataLoaded }: { onDataLoaded: (d: DashboardData) => void }) {
  const toast = useToast()
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
          if (j.status === 'failed') {
            setError(j.error || 'Job failed')
            toast.push(j.error || 'Upload job failed', 'danger')
            clearInterval(timer)
            void refreshJobs()
          }
          if (j.status === 'succeeded') {
            fetch(`/api/jobs/${jobId}/result`)
              .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
              .then(d => {
                if (!cancelled) {
                  onDataLoaded(d)
                  toast.push('Dataset loaded successfully', 'success')
                }
              })
              .catch(e => {
                const msg = e instanceof Error ? e.message : String(e)
                setError(msg)
                toast.push(msg, 'danger')
              })
              .finally(() => { clearInterval(timer); void refreshJobs() })
          }
        })
        .catch(e => setError(e instanceof Error ? e.message : String(e)))
    }, 2000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [jobId, onDataLoaded])

  const hasFiles = Boolean(etm && supporting && stopsFiles.length > 0)
  const ready = hasFiles && !error
  const step = stepIndex(status, hasFiles, status === 'succeeded')
  const steps = ['Select', 'Validate', 'Process', 'Load']
  const progress =
    status === 'queued' ? 35 :
    status === 'running' ? 70 :
    status === 'succeeded' ? 100 :
    status === 'failed' ? 100 : 0

  return (
    <div className="page">
      <Card
        title="Upload dataset"
        subtitle="Provide ETM tickets, supporting tables, and daily stop-sequence files"
      >
        <div className="upload-grid">
          <ol className="upload-stepper" aria-label="Upload steps">
            {steps.map((label, i) => (
              <li
                key={label}
                className={[
                  'upload-step',
                  i < step ? 'done' : '',
                  i === step ? 'current' : '',
                ].filter(Boolean).join(' ')}
              >
                <span className="upload-step-index">{i + 1}</span>
                <span className="upload-step-label">{label}</span>
              </li>
            ))}
          </ol>

          <div className="upload-validation-chips">
            <StatusBadge tone={etm ? 'up' : 'warn'}>{etm ? `ETM ok · ${etm.name}` : 'ETM missing'}</StatusBadge>
            <StatusBadge tone={supporting ? 'up' : 'warn'}>
              {supporting ? `Supporting ok · ${supporting.name}` : 'Supporting missing'}
            </StatusBadge>
            <StatusBadge tone={stopsFiles.length > 0 ? 'up' : 'warn'}>
              {stopsFiles.length > 0 ? `Stops ok · ${stopsFiles.length} file(s)` : 'Stops missing'}
            </StatusBadge>
            {error && <StatusBadge tone="down">Validation error</StatusBadge>}
            {ready && status === 'idle' && <StatusBadge tone="up">Ready to process</StatusBadge>}
          </div>

          {(status === 'queued' || status === 'running' || status === 'succeeded' || status === 'failed') && (
            <div className="upload-progress" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
              <div
                className={`upload-progress-bar ${status === 'failed' ? 'failed' : ''}`}
                style={{ width: `${progress}%` }}
              />
              <span className="upload-progress-label">{status}</span>
            </div>
          )}

          {/* Bulk drop zone */}
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

          {/* Attached files summary */}
          {(etm || supporting || stopsFiles.length > 0) && (
            <div className="file-tags">
              {etm && <span className="file-tag">ETM: {etm.name} ({fmtBytes(etm.size)}) <button onClick={() => setEtm(null)}>×</button></span>}
              {supporting && <span className="file-tag">Support: {supporting.name} ({fmtBytes(supporting.size)}) <button onClick={() => setSupporting(null)}>×</button></span>}
              {stopsFiles.map(f => (
                <span key={f.name + f.size} className="file-tag">
                  Stops: {f.name} <button onClick={() => setStopsFiles(p => p.filter(x => !(x.name === f.name && x.size === f.size)))}>×</button>
                </span>
              ))}
            </div>
          )}

          {/* Per-slot individual drop zones (collapsible) */}
          <details className="slot-details">
            <summary className="slot-summary">Individual file slots (if auto-classify fails)</summary>
            <div className="slot-grid">
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
                  ? <span className="slot-filename">{etm.name} ({fmtBytes(etm.size)})</span>
                  : <span className="dropzone-hint">Drop ETM*.xlsx here or click to browse</span>
                }
                <input type="file" accept=".xlsx,.xls" onChange={e => handleSlotDrop('etm', e.target.files)} />
              </div>

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
                  ? <span className="slot-filename">{supporting.name} ({fmtBytes(supporting.size)})</span>
                  : <span className="dropzone-hint">Drop Supporting*.xlsx here or click to browse</span>
                }
                <input type="file" accept=".xlsx,.xls" onChange={e => handleSlotDrop('supporting', e.target.files)} />
              </div>

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
                  ? <ul className="slot-file-list">{stopsFiles.map(f => <li key={f.name + f.size}>{f.name} ({fmtBytes(f.size)})</li>)}</ul>
                  : <span className="dropzone-hint">Drop route files (e.g. 1-2.xlsx) here — multiple allowed</span>
                }
                <input type="file" accept=".xlsx,.xls" multiple onChange={e => handleSlotDrop('stops', e.target.files)} />
              </div>
            </div>
          </details>

          {/* Actions */}
          <div className="upload-actions">
            <Button variant="primary" onClick={submit} disabled={status === 'running' || status === 'queued'}>
              {status === 'running' || status === 'queued' ? 'Processing…' : 'Process files'}
            </Button>
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
      </Card>

      {jobs.length > 0 && (
        <Card title="Recent uploads">
          <DataTable
            rows={jobs.map((j) => ({
              ...j,
              shortId: `${j.id.slice(0, 8)}\u2026`,
              createdLabel: relativeTime(j.created_at),
            }))}
            columns={jobColumns(jobId, (j) => {
              setJobId(j.id)
              setStatus(j.status)
              setLogs(j.logs ?? [])
              fetch(`/api/jobs/${j.id}/result`).then(r => r.json()).then(onDataLoaded).catch(() => {})
            })}
            pageSize={10}
            searchable
            exportName="upload-jobs"
            rowKey={(r) => r.id}
          />
        </Card>
      )}
    </div>
  )
}

function jobColumns(
  activeId: string | null,
  onLoad: (j: JobRow) => void,
): Column<JobRow>[] {
  return [
    { key: 'shortId', header: 'Job', numeric: false, format: (v, row) => (
      <span title={row.id} style={{ fontWeight: activeId === row.id ? 600 : 400 }}>{String(v)}</span>
    ) },
    {
      key: 'status',
      header: 'Status',
      numeric: false,
      format: (v) => {
        const s = String(v)
        const tone = s === 'succeeded' ? 'up' : s === 'failed' ? 'down' : 'neutral'
        return <StatusBadge tone={tone}>{s}</StatusBadge>
      },
    },
    { key: 'createdLabel', header: 'Created', numeric: false },
    {
      key: 'id',
      header: '',
      numeric: false,
      sortable: false,
      format: (_v, row) =>
        row.status === 'succeeded' ? (
          <button type="button" className="link-btn" onClick={(e) => { e.stopPropagation(); onLoad(row) }}>
            Load
          </button>
        ) : null,
    },
  ]
}
