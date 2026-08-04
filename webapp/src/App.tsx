import { useEffect, useMemo, useState } from 'react'
import Plot from 'react-plotly.js'
import './App.css'

type DashboardData = {
  agency: {
    agency_id: string
    agency_name: string
    date_min: string
    date_max: string
    routes: string[]
    route_directions: string[]
  }
  feature_gates: Record<string, boolean>
  daily: Array<{
    service_date: string
    ridership: number
    revenue: number
    pax_km: number
    capacity_km: number
    trips: number
    buses: number
    lf: number
  }>
  route_trend: Array<{
    service_date: string
    route_code: string
    ridership: number
    revenue: number
    load_factor_route: number
    n_trips: number
    n_buses: number
  }>
  temporal: Array<{
    service_date: string
    route_code: string
    start_hour: number
    ridership: number
    revenue: number
    trips: number
  }>
  stop_map: Array<{
    service_date: string
    route_direction_key: string
    stop_abbr: string
    stop_name: string
    boarding: number
    alighting: number
    peak_load: number
    latitude: number
    longitude: number
  }>
  ba_line_best_trip: Array<{
    service_date: string
    route_direction_key: string
    bus_trip_key: string
    stop_no: number
    stop_name: string
    boarding: number
    alighting: number
    passenger_load: number
  }>
}

const formatInt = (n: number) => Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n)
const formatMoney = (n: number) =>
  Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Math.round(n))

const MAX_FILE_BYTES = 50 * 1024 * 1024
const EXCEL_EXT = /\.(xlsx|xls)$/i

type JobSummary = {
  id: string
  agency_id: string
  status: string
  created_at: string
  updated_at: string
  error: string | null
  logs: string[] | null
}

function validateExcelFile(file: File): string | null {
  if (!EXCEL_EXT.test(file.name)) {
    return `${file.name}: only .xlsx or .xls files are allowed`
  }
  if (file.size > MAX_FILE_BYTES) {
    return `${file.name}: exceeds 50MB limit`
  }
  if (file.size === 0) {
    return `${file.name}: file is empty`
  }
  return null
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

type UploadSlot = 'etm' | 'supporting' | 'stops'

function classifyUploadFile(name: string): UploadSlot | null {
  const lower = name.toLowerCase()
  if (/supporting/.test(lower)) return 'supporting'
  if (/^etm/.test(lower) || /\betm[_\s-]/i.test(name)) return 'etm'
  if (/stops\s*seq|stopsseq|stop\s*sequence/.test(lower)) return 'stops'
  if (/^\d+\s*-\s*\d+/.test(name)) return 'stops'
  if (EXCEL_EXT.test(name)) return 'stops'
  return null
}

function App() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [jobStatus, setJobStatus] = useState<string>('idle')
  const [jobError, setJobError] = useState<string | null>(null)
  const [etmFile, setEtmFile] = useState<File | null>(null)
  const [supportingFile, setSupportingFile] = useState<File | null>(null)
  const [stopSeqFiles, setStopSeqFiles] = useState<File[]>([])
  const [dragTarget, setDragTarget] = useState<'bulk' | 'etm' | 'supporting' | 'stops' | null>(
    null,
  )
  const [recentJobs, setRecentJobs] = useState<JobSummary[]>([])
  const [selectedJobLogs, setSelectedJobLogs] = useState<string[]>([])
  const [date, setDate] = useState<string>('')
  const [route, setRoute] = useState<string>('ALL')
  const [routeDirection, setRouteDirection] = useState<string>('ALL')
  const [page, setPage] = useState<'overview' | 'routes' | 'temporal' | 'stops'>('overview')

  useEffect(() => {
    fetch('/data/bhavnagar-dashboard.json')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status} loading dataset`)
        return res.json()
      })
      .then((json: DashboardData) => {
        setData(json)
        setDate(json.agency.date_min)
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  useEffect(() => {
    refreshRecentJobs()
  }, [])

  async function refreshRecentJobs() {
    try {
      const res = await fetch('/api/jobs?limit=10')
      if (!res.ok) return
      const payload = await res.json()
      const jobs: JobSummary[] = payload.jobs ?? []
      setRecentJobs(jobs)
      const latest = jobs[0]
      if (!latest) return
      if ((latest.status === 'queued' || latest.status === 'running') && !jobId) {
        setJobId(latest.id)
        setJobStatus(latest.status)
      }
      if (jobId && latest.id === jobId && latest.logs) {
        setSelectedJobLogs(latest.logs)
      }
    } catch {
      // API may be offline during static-only dev.
    }
  }

  async function loadJobResult(id: string) {
    setJobError(null)
    try {
      const res = await fetch(`/api/jobs/${id}/result`)
      if (!res.ok) throw new Error(`HTTP ${res.status} loading job result`)
      const json: DashboardData = await res.json()
      setData(json)
      setDate(json.agency.date_min)
      setRoute('ALL')
      setRouteDirection('ALL')
      setPage('overview')
      setJobId(id)
      setJobStatus('succeeded')
    } catch (e) {
      setJobError(e instanceof Error ? e.message : String(e))
    }
  }

  function selectJob(job: JobSummary) {
    setJobId(job.id)
    setJobStatus(job.status)
    setJobError(job.error)
    setSelectedJobLogs(job.logs ?? [])
    if (job.status === 'succeeded') {
      void loadJobResult(job.id)
    }
  }

  useEffect(() => {
    if (!jobId) return
    let cancelled = false
    const timer = setInterval(() => {
      fetch(`/api/jobs/${jobId}`)
        .then((r) => r.json())
        .then((j) => {
          if (cancelled) return
          setJobStatus(j.status)
          if (j.logs) setSelectedJobLogs(j.logs)
          if (j.status === 'failed') {
            setJobError(j.error || 'Job failed')
            clearInterval(timer)
            void refreshRecentJobs()
          }
          if (j.status === 'succeeded') {
            fetch(`/api/jobs/${jobId}/result`)
              .then((res) => {
                if (!res.ok) throw new Error(`HTTP ${res.status} loading job result`)
                return res.json()
              })
              .then((json: DashboardData) => {
                if (cancelled) return
                setData(json)
                setDate(json.agency.date_min)
                setRoute('ALL')
                setRouteDirection('ALL')
                setPage('overview')
              })
              .catch((e) => setJobError(e instanceof Error ? e.message : String(e)))
              .finally(() => {
                clearInterval(timer)
                void refreshRecentJobs()
              })
          }
        })
        .catch((e) => setJobError(e instanceof Error ? e.message : String(e)))
    }, 2000)

    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [jobId])

  async function submitUpload() {
    if (!etmFile || !supportingFile || stopSeqFiles.length === 0) {
      setJobError('Please attach ETM file, Supporting file, and at least one Stops Sequence file.')
      return
    }

    const allFiles = [etmFile, supportingFile, ...stopSeqFiles]
    for (const f of allFiles) {
      const err = validateExcelFile(f)
      if (err) {
        setJobError(err)
        return
      }
    }

    setJobError(null)
    setJobStatus('queued')
    setSelectedJobLogs([])
    const fd = new FormData()
    fd.append('agency_id', 'bhavnagar')
    fd.append('etm_file', etmFile)
    fd.append('supporting_file', supportingFile)
    for (const f of stopSeqFiles) fd.append('stop_sequence_files', f)

    try {
      const resp = await fetch('/api/jobs', { method: 'POST', body: fd })
      if (!resp.ok) {
        const msg = await resp.text()
        throw new Error(msg || `HTTP ${resp.status} creating job`)
      }
      const j = await resp.json()
      setJobId(j.job_id)
      setJobStatus(j.status ?? 'queued')
      void refreshRecentJobs()
    } catch (e) {
      setJobStatus('failed')
      setJobError(e instanceof Error ? e.message : String(e))
    }
  }

  function onDropBulkFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    const list = Array.from(files)

    let nextEtm = etmFile
    let nextSupporting = supportingFile
    const nextStops = [...stopSeqFiles]
    const unclassified: string[] = []

    for (const f of list) {
      const err = validateExcelFile(f)
      if (err) {
        setJobError(err)
        return
      }

      const slot = classifyUploadFile(f.name)
      if (!slot) {
        unclassified.push(f.name)
        continue
      }

      if (slot === 'etm') {
        nextEtm = f
        continue
      }
      if (slot === 'supporting') {
        nextSupporting = f
        continue
      }
      if (!nextStops.some((x) => x.name === f.name && x.size === f.size)) {
        nextStops.push(f)
      }
    }

    setEtmFile(nextEtm)
    setSupportingFile(nextSupporting)
    setStopSeqFiles(nextStops)

    if (unclassified.length > 0) {
      setJobError(
        `Could not classify: ${unclassified.join(', ')}. Rename to match ETM*, Supporting*, or StopsSeq* patterns.`,
      )
      return
    }

    setJobError(null)
  }

  function onDropFiles(slot: UploadSlot, files: FileList | null) {
    if (!files || files.length === 0) return
    const list = Array.from(files)

    if (slot !== 'stops') {
      const file = list[0]
      if (!file) return
      const err = validateExcelFile(file)
      if (err) {
        setJobError(err)
        return
      }
      setJobError(null)
      if (slot === 'etm') {
        setEtmFile(file)
        return
      }
      setSupportingFile(file)
      return
    }

    const valid: File[] = []
    for (const f of list) {
      const err = validateExcelFile(f)
      if (err) {
        setJobError(err)
        return
      }
      valid.push(f)
    }
    setJobError(null)
    setStopSeqFiles((prev) => {
      const merged = [...prev]
      for (const f of valid) {
        if (!merged.some((x) => x.name === f.name && x.size === f.size)) merged.push(f)
      }
      return merged
    })
  }

  const filteredRouteDay = useMemo(() => {
    if (!data) return []
    return data.route_trend.filter(
      (r) => r.service_date === date && (route === 'ALL' || r.route_code === route),
    )
  }, [data, date, route])

  const selectedDaily = useMemo(
    () => data?.daily.find((d) => d.service_date === date) ?? null,
    [data, date],
  )

  const temporalRows = useMemo(() => {
    if (!data) return []
    return data.temporal.filter(
      (r) => r.service_date === date && (route === 'ALL' || r.route_code === route),
    )
  }, [data, date, route])

  const stopMapRows = useMemo(() => {
    if (!data) return []
    return data.stop_map.filter(
      (r) =>
        r.service_date === date &&
        (routeDirection === 'ALL' || r.route_direction_key === routeDirection),
    )
  }, [data, date, routeDirection])

  const baLineRows = useMemo(() => {
    if (!data) return []
    const effectiveRouteDirection =
      routeDirection === 'ALL'
        ? data.agency.route_directions[0] ?? ''
        : routeDirection

    if (!effectiveRouteDirection) return []

    return data.ba_line_best_trip
      .filter((r) => r.service_date === date && r.route_direction_key === effectiveRouteDirection)
      .sort((a, b) => a.stop_no - b.stop_no)
  }, [data, date, routeDirection])

  if (error && !data) return <div className="loading">Error loading dashboard dataset: {error}</div>
  if (!data) return <div className="loading">Loading dashboard dataset...</div>

  return (
    <div className="app">
      <header className="header">
        <div>
          <h1>{data.agency.agency_name} E-TRAM Dashboard</h1>
          <p>Phase 3 React UI over Phase 2 canonical metrics</p>
        </div>
        <div className="filters">
          <select value={date} onChange={(e) => setDate(e.target.value)}>
            {data.daily.map((d) => (
              <option key={d.service_date} value={d.service_date}>
                {d.service_date}
              </option>
            ))}
          </select>
          <select value={route} onChange={(e) => setRoute(e.target.value)}>
            <option value="ALL">All Routes</option>
            {data.agency.routes.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <select value={routeDirection} onChange={(e) => setRouteDirection(e.target.value)}>
            <option value="ALL">All Directions</option>
            {data.agency.route_directions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
      </header>

      <section className="panel">
        <h2>Upload New Excel Dataset</h2>
        <p style={{ marginTop: 0 }}>
          Drop all Excel files at once (auto-routed by filename) or use individual zones below. Max
          50MB per file.
        </p>
        <div className="upload-grid">
          <div
            className={`dropzone dropzone-bulk ${dragTarget === 'bulk' ? 'active' : ''}`}
            onDragOver={(e) => {
              e.preventDefault()
              setDragTarget('bulk')
            }}
            onDragLeave={() => setDragTarget(null)}
            onDrop={(e) => {
              e.preventDefault()
              setDragTarget(null)
              onDropBulkFiles(e.dataTransfer.files)
            }}
          >
            <div className="dropzone-head">
              <strong>Drop all files here</strong>
              {(etmFile || supportingFile || stopSeqFiles.length > 0) && (
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => {
                    setEtmFile(null)
                    setSupportingFile(null)
                    setStopSeqFiles([])
                    setJobError(null)
                  }}
                >
                  Clear all
                </button>
              )}
            </div>
            <span>
              ETM (ETM_*), Supporting (Supporting*), Stops Sequence (StopsSeq* or route files like
              1-2.xlsx)
            </span>
            {(etmFile || supportingFile || stopSeqFiles.length > 0) && (
              <ul className="file-summary">
                <li>{etmFile ? `ETM: ${etmFile.name}` : 'ETM: not set'}</li>
                <li>
                  {supportingFile
                    ? `Supporting: ${supportingFile.name}`
                    : 'Supporting: not set'}
                </li>
                <li>Stops sequence: {stopSeqFiles.length} file(s)</li>
              </ul>
            )}
            <input
              type="file"
              accept=".xlsx,.xls"
              multiple
              onChange={(e) => onDropBulkFiles(e.target.files)}
            />
          </div>

          <details className="upload-details">
            <summary>Individual file zones (optional)</summary>
          <div
            className={`dropzone ${dragTarget === 'etm' ? 'active' : ''}`}
            onDragOver={(e) => {
              e.preventDefault()
              setDragTarget('etm')
            }}
            onDragLeave={() => setDragTarget(null)}
            onDrop={(e) => {
              e.preventDefault()
              setDragTarget(null)
              onDropFiles('etm', e.dataTransfer.files)
            }}
          >
            <div className="dropzone-head">
              <strong>ETM Data</strong>
              {etmFile && (
                <button type="button" className="link-btn" onClick={() => setEtmFile(null)}>
                  Remove
                </button>
              )}
            </div>
            <span>
              {etmFile
                ? `${etmFile.name} (${formatBytes(etmFile.size)})`
                : 'Drag file here or choose manually'}
            </span>
            <input type="file" accept=".xlsx,.xls" onChange={(e) => onDropFiles('etm', e.target.files)} />
          </div>

          <div
            className={`dropzone ${dragTarget === 'supporting' ? 'active' : ''}`}
            onDragOver={(e) => {
              e.preventDefault()
              setDragTarget('supporting')
            }}
            onDragLeave={() => setDragTarget(null)}
            onDrop={(e) => {
              e.preventDefault()
              setDragTarget(null)
              onDropFiles('supporting', e.dataTransfer.files)
            }}
          >
            <div className="dropzone-head">
              <strong>Supporting Data</strong>
              {supportingFile && (
                <button type="button" className="link-btn" onClick={() => setSupportingFile(null)}>
                  Remove
                </button>
              )}
            </div>
            <span>
              {supportingFile
                ? `${supportingFile.name} (${formatBytes(supportingFile.size)})`
                : 'Drag file here or choose manually'}
            </span>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => onDropFiles('supporting', e.target.files)}
            />
          </div>

          <div
            className={`dropzone ${dragTarget === 'stops' ? 'active' : ''}`}
            onDragOver={(e) => {
              e.preventDefault()
              setDragTarget('stops')
            }}
            onDragLeave={() => setDragTarget(null)}
            onDrop={(e) => {
              e.preventDefault()
              setDragTarget(null)
              onDropFiles('stops', e.dataTransfer.files)
            }}
          >
            <div className="dropzone-head">
              <strong>Stops Sequence (multiple)</strong>
              {stopSeqFiles.length > 0 && (
                <button type="button" className="link-btn" onClick={() => setStopSeqFiles([])}>
                  Clear all
                </button>
              )}
            </div>
            {stopSeqFiles.length > 0 ? (
              <ul className="file-list">
                {stopSeqFiles.map((f) => (
                  <li key={`${f.name}-${f.size}`}>
                    <span>
                      {f.name} ({formatBytes(f.size)})
                    </span>
                    <button
                      type="button"
                      className="link-btn"
                      onClick={() =>
                        setStopSeqFiles((prev) =>
                          prev.filter((x) => !(x.name === f.name && x.size === f.size)),
                        )
                      }
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <span>Drag one or more files here or choose manually</span>
            )}
            <input
              type="file"
              accept=".xlsx,.xls"
              multiple
              onChange={(e) => onDropFiles('stops', e.target.files)}
            />
          </div>
          </details>

          <div className="upload-actions">
            <button type="button" onClick={submitUpload}>
              Start Processing
            </button>
            <span>Job status: {jobStatus}</span>
          </div>
          {jobError && <div className="job-error">{jobError}</div>}
          {jobId && <div className="job-meta">Job ID: {jobId}</div>}

          {selectedJobLogs.length > 0 && (
            <div className="job-logs">
              <h3>Job log</h3>
              <ul>
                {selectedJobLogs.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          )}

          {recentJobs.length > 0 && (
            <div className="recent-jobs">
              <h3>Recent jobs</h3>
              <table>
                <thead>
                  <tr>
                    <th>Job</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {recentJobs.map((j) => (
                    <tr key={j.id} className={jobId === j.id ? 'selected' : ''}>
                      <td title={j.id}>{j.id.slice(0, 8)}…</td>
                      <td>{j.status}</td>
                      <td>{new Date(j.created_at).toLocaleString()}</td>
                      <td>
                        <button type="button" className="link-btn" onClick={() => selectJob(j)}>
                          {j.status === 'succeeded' ? 'Load' : 'View'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <nav className="tabs">
        <button className={page === 'overview' ? 'active' : ''} onClick={() => setPage('overview')}>
          Overview
        </button>
        <button className={page === 'routes' ? 'active' : ''} onClick={() => setPage('routes')}>
          Route Performance
        </button>
        <button className={page === 'temporal' ? 'active' : ''} onClick={() => setPage('temporal')}>
          Temporal
        </button>
        <button className={page === 'stops' ? 'active' : ''} onClick={() => setPage('stops')}>
          Stops & Map
        </button>
      </nav>

      {selectedDaily && (
        <section className="cards">
          <div className="card">
            <span>Ridership</span>
            <strong>{formatInt(selectedDaily.ridership)}</strong>
          </div>
          <div className="card">
            <span>Revenue</span>
            <strong>{formatMoney(selectedDaily.revenue)}</strong>
          </div>
          <div className="card">
            <span>Trips / Buses</span>
            <strong>
              {formatInt(selectedDaily.trips)} / {formatInt(selectedDaily.buses)}
            </strong>
          </div>
          <div className="card">
            <span>Load Factor</span>
            <strong>{(selectedDaily.lf * 100).toFixed(2)}%</strong>
          </div>
        </section>
      )}

      {page === 'overview' && (
        <section className="panel">
          <h2>Daily Ridership and Revenue</h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Date</th>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Ridership</th>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Revenue</th>
                </tr>
              </thead>
              <tbody>
                {data.daily.slice(-10).map((d) => (
                  <tr key={d.service_date}>
                    <td style={{ padding: '6px 0' }}>{d.service_date}</td>
                    <td style={{ padding: '6px 0' }}>{formatInt(d.ridership)}</td>
                    <td style={{ padding: '6px 0' }}>{formatMoney(d.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {page === 'routes' && (
        <section className="panel">
          <h2>Route Metrics ({date})</h2>
          <Plot
            data={[
              {
                x: filteredRouteDay.map((r) => r.route_code),
                y: filteredRouteDay.map((r) => r.ridership),
                type: 'bar',
                name: 'Ridership',
              },
              {
                x: filteredRouteDay.map((r) => r.route_code),
                y: filteredRouteDay.map((r) => Number((r.load_factor_route * 100).toFixed(2))),
                type: 'scatter',
                mode: 'lines+markers',
                yaxis: 'y2',
                name: 'LF %',
              },
            ]}
            layout={{
              height: 420,
              margin: { l: 48, r: 48, t: 20, b: 44 },
              yaxis: { title: 'Ridership' },
              yaxis2: { title: 'Load Factor %', overlaying: 'y', side: 'right' },
              legend: { orientation: 'h' },
            }}
            style={{ width: '100%' }}
            config={{ displayModeBar: false, responsive: true }}
            useResizeHandler
          />
        </section>
      )}

      {page === 'temporal' && (
        <section className="panel">
          <h2>Temporal Distribution ({date})</h2>
          <Plot
            data={[
              {
                x: temporalRows.map((r) => `${String(r.start_hour).padStart(2, '0')}:00`),
                y: temporalRows.map((r) => r.ridership),
                type: 'bar',
                name: 'Ridership',
              },
            ]}
            layout={{
              height: 420,
              margin: { l: 48, r: 24, t: 20, b: 44 },
              yaxis: { title: 'Ridership' },
              legend: { orientation: 'h' },
            }}
            style={{ width: '100%' }}
            config={{ displayModeBar: false, responsive: true }}
            useResizeHandler
          />
        </section>
      )}

      {page === 'stops' && (
        <section className="panel">
          <h2>Stops and BA Map ({date})</h2>
          <Plot
            data={[
              {
                type: 'scattermapbox',
                lat: stopMapRows.map((r) => r.latitude),
                lon: stopMapRows.map((r) => r.longitude),
                text: stopMapRows.map(
                  (r) => `${r.stop_name}<br/>B: ${r.boarding} A: ${r.alighting}`,
                ),
                marker: {
                  size: stopMapRows.map((r) => Math.max(8, Math.min(24, r.peak_load / 8))),
                  color: stopMapRows.map((r) => r.boarding - r.alighting),
                  colorscale: 'RdYlGn',
                  showscale: true,
                  colorbar: { title: 'Net B-A' },
                },
                mode: 'markers',
                name: 'Stops',
              },
            ]}
            layout={{
              height: 460,
              margin: { l: 24, r: 24, t: 20, b: 24 },
              mapbox: {
                style: 'open-street-map',
                center:
                  stopMapRows.length > 0
                    ? { lat: stopMapRows[0].latitude, lon: stopMapRows[0].longitude }
                    : { lat: 21.76, lon: 72.15 },
                zoom: 10,
              },
            }}
            style={{ width: '100%' }}
            config={{ displayModeBar: false, responsive: true }}
            useResizeHandler
          />
          <h3>Line Loading (sample trip)</h3>
          <Plot
            data={[
              {
                x: baLineRows.map((r) => r.stop_no),
                y: baLineRows.map((r) => r.passenger_load),
                type: 'scatter',
                mode: 'lines+markers',
                name: 'Passenger Load',
              },
            ]}
            layout={{
              height: 280,
              margin: { l: 48, r: 24, t: 12, b: 44 },
              xaxis: { title: 'Stop No.' },
              yaxis: { title: 'Passenger Load' },
            }}
            style={{ width: '100%' }}
            config={{ displayModeBar: false, responsive: true }}
            useResizeHandler
          />
        </section>
      )}

      <section className="gates">
        <h3>Feature Gates</h3>
        <ul>
          {Object.entries(data.feature_gates).map(([k, v]) => (
            <li key={k}>
              {k}: <strong>{v ? 'enabled' : 'disabled'}</strong>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

export default App

