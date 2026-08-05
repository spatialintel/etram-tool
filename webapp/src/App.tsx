import { Suspense, lazy, useEffect, useMemo } from 'react'
import { ErrorBoundary } from './components/ErrorBoundary'
import {
  AppShell, Button, DateRangePicker, FilterBar, FilterChips, MultiSelect,
  PageHeader, PrefsBar, SegmentedControl, Sidebar, SkeletonPage, Switch,
} from './components/ui'
import { DEFAULT_FILTERS, activeChips, clearChip, getComparisonRange, useUrlFilters } from './lib/filters'
import type { DateRange, Granularity, FilterState } from './lib/filters'
import { usePrefs } from './lib/prefs'
import { useDashboardData } from './lib/useDashboardData'
import type { DashboardData, Page } from './types'
import './App.css'

const OverviewPage = lazy(() => import('./pages/OverviewPage').then((m) => ({ default: m.OverviewPage })))
const RoutesPage = lazy(() => import('./pages/RoutesPage').then((m) => ({ default: m.RoutesPage })))
const TrendsPage = lazy(() => import('./pages/TrendsPage').then((m) => ({ default: m.TrendsPage })))
const TemporalPage = lazy(() => import('./pages/TemporalPage').then((m) => ({ default: m.TemporalPage })))
const StopsPage = lazy(() => import('./pages/StopsPage').then((m) => ({ default: m.StopsPage })))
const EfficiencyPage = lazy(() => import('./pages/EfficiencyPage').then((m) => ({ default: m.EfficiencyPage })))
const EntitiesPage = lazy(() => import('./pages/EntitiesPage').then((m) => ({ default: m.EntitiesPage })))
const UploadPage = lazy(() => import('./pages/UploadPage').then((m) => ({ default: m.UploadPage })))
const ComparePage = lazy(() => import('./pages/ComparePage').then((m) => ({ default: m.ComparePage })))
const DefinitionsPage = lazy(() => import('./pages/DefinitionsPage').then((m) => ({ default: m.DefinitionsPage })))

const pageTitles: Record<Page, { title: string; subtitle: string }> = {
  overview: { title: 'Overview', subtitle: 'Service performance for the selected period' },
  routes: { title: 'Route Performance', subtitle: 'Compare routes over the selected period' },
  trends: { title: 'Route Trends', subtitle: 'Multi-day route trajectories' },
  temporal: { title: 'Temporal Analysis', subtitle: 'Hourly demand patterns' },
  stops: { title: 'Stops & Map', subtitle: 'Boarding, alighting, and load by stop' },
  efficiency: { title: 'Efficiency', subtitle: 'Productivity and yield indicators' },
  entities: { title: 'Entities', subtitle: 'Vehicles, drivers, conductors, and stops' },
  compare: { title: 'Compare', subtitle: 'Period A vs Period B and biggest movers' },
  definitions: { title: 'Definitions', subtitle: 'Metric formulas, units, and targets' },
  upload: { title: 'Upload Data', subtitle: 'Ingest ETM, supporting, and stop-sequence files' },
}

const navItems = [
  { id: 'overview', label: 'Overview', section: 'Menu' },
  { id: 'routes', label: 'Route Performance', section: 'Menu' },
  { id: 'entities', label: 'Entities', section: 'Menu' },
  { id: 'trends', label: 'Route Trends', section: 'Menu' },
  { id: 'temporal', label: 'Temporal Analysis', section: 'Menu' },
  { id: 'stops', label: 'Stops & Map', section: 'Menu' },
  { id: 'efficiency', label: 'Efficiency', section: 'Menu' },
  { id: 'compare', label: 'Compare', section: 'Menu' },
  { id: 'upload', label: 'Upload Data', section: 'Data' },
  { id: 'definitions', label: 'Definitions', section: 'Help' },
]

const PAGES = new Set<string>(navItems.map((n) => n.id))
const ROUTE_PAGES = new Set<Page>(['routes', 'trends', 'temporal', 'efficiency', 'compare', 'entities', 'stops'])
const GRANULARITY_PAGES = new Set<Page>(['overview', 'trends'])
const NO_FILTER_PAGES = new Set<Page>(['upload', 'definitions'])

const GRANULARITY_OPTIONS: { value: Granularity; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
]

function App() {
  const { data, error, replace } = useDashboardData()
  const { page: rawPage, filters, setPage, setFilters, reset } = useUrlFilters(DEFAULT_FILTERS, 'overview')
  const page: Page = (PAGES.has(rawPage) ? rawPage : 'overview') as Page
  const [prefs, setPrefs] = usePrefs()

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', prefs.theme)
    document.documentElement.setAttribute('data-density', prefs.density)
  }, [prefs.theme, prefs.density])

  const dateMin = data?.agency.date_min
  const dateMax = data?.agency.date_max
  const fullRange: DateRange | null = useMemo(
    () => (dateMin && dateMax ? { start: dateMin, end: dateMax } : null),
    [dateMin, dateMax],
  )

  useEffect(() => {
    if (!fullRange) return
    const { start, end } = filters.range
    const unset = !start || !end
    const outOfBounds = !unset && (end < fullRange.start || start > fullRange.end)
    if (unset || outOfBounds) setFilters({ range: fullRange })
  }, [fullRange, filters.range, setFilters])

  // The date picker already states the range and comparison, so those chips
  // would only repeat it a line lower.
  const chips = useMemo(
    () => activeChips(filters).filter((c) => c.id !== 'range' && c.id !== 'compare'),
    [filters],
  )
  const comparePreview = useMemo(() => {
    const mode = filters.compare === 'none' ? 'prev-period' : filters.compare
    const r = getComparisonRange({ ...filters, compare: mode }, { min: dateMin })
    if (!r) return undefined
    return `${r.start} to ${r.end}${r.partial ? ' (truncated at the start of the data)' : ''}`
  }, [filters, dateMin])
  const liveMessage = `${pageTitles[page].title}. ${chips.length} active filter${chips.length === 1 ? '' : 's'}.`

  function handleDataUpdate(d: DashboardData) {
    replace(d)
    reset({ start: d.agency.date_min, end: d.agency.date_max })
    setPage('overview')
  }

  if (error && !data) {
    return (
      <div className="loading-screen">
        <p>Unable to load the dashboard.</p>
        <p className="loading-detail">{error}</p>
      </div>
    )
  }
  if (!data) return <div className="loading-screen"><SkeletonPage /></div>

  const rangeReady = Boolean(filters.range.start && filters.range.end)
  const pageFilters: FilterState = rangeReady ? filters : { ...filters, range: fullRange! }
  const showFilters = !NO_FILTER_PAGES.has(page)

  return (
    <AppShell
      sidebar={
        <Sidebar
          agencyName={data.agency.agency_name}
          dateMin={data.agency.date_min}
          dateMax={data.agency.date_max}
          page={page}
          items={navItems}
          onNavigate={setPage}
        />
      }
      header={
        <>
          <div className="aria-live-region" aria-live="polite" aria-atomic="true">{liveMessage}</div>
          <PageHeader
            title={pageTitles[page].title}
            subtitle={pageTitles[page].subtitle}
            actions={
              <>
                <PrefsBar
                  prefs={prefs}
                  onChange={setPrefs}
                  currentUrl={typeof window !== 'undefined' ? window.location.hash || '#/overview' : '#/overview'}
                />
                <Button variant="primary" onClick={() => setPage('upload')}>Upload Data</Button>
              </>
            }
          />
          {showFilters && (
            <>
              <FilterBar>
                <DateRangePicker
                  value={pageFilters.range}
                  onChange={(range) => setFilters({ range })}
                  min={data.agency.date_min}
                  max={data.agency.date_max}
                  availableDates={data.daily.map((d) => d.service_date)}
                  compare={pageFilters.compare}
                  onCompareChange={(compare) => setFilters({ compare })}
                  compareRange={pageFilters.compareRange}
                  onCompareRangeChange={(compareRange) => setFilters({ compareRange })}
                  comparePreview={comparePreview}
                />

                {ROUTE_PAGES.has(page) && (
                  <MultiSelect
                    label="Routes"
                    values={pageFilters.routes}
                    options={data.agency.routes.map((r) => ({ value: r, label: r }))}
                    onChange={(routes) => setFilters({ routes })}
                    allLabel="All routes"
                  />
                )}

                {page === 'stops' && (
                  <MultiSelect
                    label="Directions"
                    values={pageFilters.directions}
                    options={data.agency.route_directions.map((r) => ({ value: r, label: r }))}
                    onChange={(directions) => setFilters({ directions })}
                    allLabel="All directions"
                  />
                )}

                {GRANULARITY_PAGES.has(page) && (
                  <div className="ui-field">
                    <span className="ui-field-label">Granularity</span>
                    <SegmentedControl
                      value={pageFilters.granularity}
                      options={GRANULARITY_OPTIONS}
                      onChange={(granularity) => setFilters({ granularity })}
                      ariaLabel="Time granularity"
                    />
                  </div>
                )}

                <div className="ui-field">
                  <span className="ui-field-label">Chart</span>
                  <div className="filter-toggles">
                    <Switch
                      label="Avg line"
                      checked={pageFilters.showAverage}
                      onChange={(showAverage) => setFilters({ showAverage })}
                    />
                    <Switch
                      label="Values"
                      checked={pageFilters.showValues}
                      onChange={(showValues) => setFilters({ showValues })}
                    />
                  </div>
                </div>
              </FilterBar>

              {chips.length > 0 && (
                <FilterChips
                  chips={chips}
                  onRemove={(id) => setFilters(clearChip(id, fullRange!))}
                  onClearAll={() => reset(fullRange!)}
                />
              )}
            </>
          )}
        </>
      }
    >
      <ErrorBoundary key={`${page}-${prefs.theme}`}>
        <Suspense fallback={<SkeletonPage />}>
          {page === 'overview' && (
            <OverviewPage
              data={data}
              filters={pageFilters}
              onUploadClick={() => setPage('upload')}
              onNavigate={(next, patch) => {
                if (patch) setFilters(patch)
                setPage(next)
              }}
            />
          )}
          {page === 'routes' && <RoutesPage data={data} filters={pageFilters} onFilterChange={setFilters} />}
          {page === 'trends' && <TrendsPage data={data} filters={pageFilters} onFilterChange={setFilters} />}
          {page === 'temporal' && <TemporalPage data={data} filters={pageFilters} onFilterChange={setFilters} />}
          {page === 'stops' && <StopsPage data={data} filters={pageFilters} />}
          {page === 'efficiency' && <EfficiencyPage data={data} filters={pageFilters} />}
          {page === 'entities' && <EntitiesPage data={data} filters={pageFilters} />}
          {page === 'compare' && <ComparePage data={data} filters={pageFilters} />}
          {page === 'definitions' && <DefinitionsPage />}
          {page === 'upload' && <UploadPage onDataLoaded={handleDataUpdate} />}
        </Suspense>
      </ErrorBoundary>
    </AppShell>
  )
}

export default App