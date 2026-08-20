export interface SidebarItem {
  id: string
  label: string
  section?: string
}

export interface SidebarProps {
  agencyName: string
  dateMin: string
  dateMax: string
  page: string
  items: SidebarItem[]
  onNavigate: (id: string) => void
}

const DEFAULT_SECTION = 'Menu'
const SECTION_ORDER = ['Menu', 'Data', 'Help']

function groupItems(items: SidebarItem[]) {
  const groups = new Map<string, SidebarItem[]>()

  for (const item of items) {
    const section = item.section ?? DEFAULT_SECTION
    const list = groups.get(section)
    if (list) {
      list.push(item)
    } else {
      groups.set(section, [item])
    }
  }

  const orderedSections = SECTION_ORDER.filter((section) => groups.has(section))
  for (const section of groups.keys()) {
    if (!orderedSections.includes(section)) {
      orderedSections.push(section)
    }
  }

  return orderedSections.map((section) => ({
    section,
    items: groups.get(section) ?? [],
  }))
}

/* ── Navigation Icons (lightweight inline SVGs) ────────────── */

function OverviewIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="1" y="1" width="7" height="7" rx="2" fill="currentColor" opacity="0.9" />
      <rect x="10" y="1" width="7" height="3" rx="1.5" fill="currentColor" opacity="0.5" />
      <rect x="10" y="5.5" width="7" height="2.5" rx="1" fill="currentColor" opacity="0.35" />
      <rect x="1" y="10" width="7" height="3" rx="1.5" fill="currentColor" opacity="0.5" />
      <rect x="1" y="14.5" width="7" height="2.5" rx="1" fill="currentColor" opacity="0.35" />
      <rect x="10" y="10" width="7" height="7" rx="2" fill="currentColor" opacity="0.6" />
    </svg>
  )
}

function RouteIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M3 15V6a3 3 0 016 0v6a3 3 0 006 0V3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none" />
      <circle cx="3" cy="15" r="1.5" fill="currentColor" opacity="0.6" />
      <circle cx="15" cy="3" r="1.5" fill="currentColor" opacity="0.6" />
    </svg>
  )
}

function EntitiesIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="9" cy="5" r="3" fill="currentColor" opacity="0.7" />
      <path d="M3 16c0-3.3 2.7-6 6-6s6 2.7 6 6" fill="currentColor" opacity="0.4" />
    </svg>
  )
}

function TrendsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M2 14l4-5 3 3 7-9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  )
}

function TemporalIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="9" cy="9" r="7" stroke="currentColor" strokeWidth="1.5" fill="none" opacity="0.5" />
      <path d="M9 5v4.5l3 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function StopsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M9 1C5.7 1 3 3.7 3 7c0 4.5 6 10 6 10s6-5.5 6-10c0-3.3-2.7-6-6-6z" fill="currentColor" opacity="0.5" />
      <circle cx="9" cy="7" r="2" fill="currentColor" opacity="0.9" />
    </svg>
  )
}

function EfficiencyIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M9 1l2.2 4.4 4.8.7-3.5 3.4.8 4.8L9 12.2l-4.3 2.1.8-4.8L2 6.1l4.8-.7z" fill="currentColor" opacity="0.5" />
    </svg>
  )
}

function CompareIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="1" y="8" width="5" height="8" rx="1" fill="currentColor" opacity="0.5" />
      <rect x="7" y="4" width="5" height="12" rx="1" fill="currentColor" opacity="0.7" />
      <rect x="13" y="1" width="4" height="15" rx="1" fill="currentColor" opacity="0.4" />
    </svg>
  )
}

function UploadIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M9 2v10M5 6l4-4 4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2 12v3a1 1 0 001 1h12a1 1 0 001-1v-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
    </svg>
  )
}

function DefinitionsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="3" y="1" width="12" height="16" rx="2" stroke="currentColor" strokeWidth="1.4" fill="none" opacity="0.5" />
      <path d="M6 5h6M6 8h6M6 11h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" opacity="0.7" />
    </svg>
  )
}

const NAV_ICONS: Record<string, () => JSX.Element> = {
  overview: OverviewIcon,
  routes: RouteIcon,
  entities: EntitiesIcon,
  trends: TrendsIcon,
  temporal: TemporalIcon,
  stops: StopsIcon,
  efficiency: EfficiencyIcon,
  compare: CompareIcon,
  upload: UploadIcon,
  definitions: DefinitionsIcon,
}

function BusMark() {
  return (
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="4" y="3" width="16" height="14" rx="3" fill="white" fillOpacity="0.95" />
      <rect x="6" y="6" width="5" height="4" rx="1" fill="white" fillOpacity="0.4" />
      <rect x="13" y="6" width="5" height="4" rx="1" fill="white" fillOpacity="0.4" />
      <circle cx="7.5" cy="19" r="1.8" fill="white" />
      <circle cx="16.5" cy="19" r="1.8" fill="white" />
      <rect x="6" y="12" width="12" height="2" rx="0.5" fill="white" fillOpacity="0.25" />
    </svg>
  )
}

export function Sidebar({
  agencyName,
  dateMin,
  dateMax,
  page,
  items,
  onNavigate,
}: SidebarProps) {
  const sections = groupItems(items)

  return (
    <aside className="ui-sidebar">
      <div className="ui-sidebar-brand">
        <div className="ui-sidebar-logo">
          <div className="ui-sidebar-mark">
            <BusMark />
          </div>
          <div className="ui-sidebar-logo-text">
            <span className="ui-sidebar-title">E-TRAM</span>
            <span className="ui-sidebar-subtitle-text">Transit Analytics</span>
          </div>
        </div>
        <p className="ui-sidebar-agency">{agencyName}</p>
        <p className="ui-sidebar-meta">
          {dateMin} — {dateMax}
        </p>
      </div>

      <nav className="ui-sidebar-nav" aria-label="Primary">
        {sections.map(({ section, items: sectionItems }) => (
          <div key={section} className="ui-sidebar-section">
            <div className="ui-sidebar-section-label">{section}</div>
            {sectionItems.map((item) => {
              const IconComponent = NAV_ICONS[item.id]
              return (
                <button
                  key={item.id}
                  type="button"
                  className={['ui-sidebar-item', page === item.id ? 'ui-sidebar-item-active' : '']
                    .filter(Boolean)
                    .join(' ')}
                  aria-current={page === item.id ? 'page' : undefined}
                  onClick={() => onNavigate(item.id)}
                >
                  {IconComponent && (
                    <span className="ui-sidebar-icon"><IconComponent /></span>
                  )}
                  <span>{item.label}</span>
                </button>
              )
            })}
          </div>
        ))}
      </nav>

      <footer className="ui-sidebar-footer">
        <span className="ui-sidebar-footer-dot" />
        CRDF · Transit Analytics Platform
      </footer>
    </aside>
  )
}