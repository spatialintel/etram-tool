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

function BusMark() {
  return (
    <svg viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="1" y="4" width="16" height="10" rx="2" fill="white" fillOpacity="0.9" />
      <rect x="3" y="2" width="12" height="2" rx="1" fill="white" fillOpacity="0.6" />
      <circle cx="4.5" cy="14.5" r="1.5" fill="white" />
      <circle cx="13.5" cy="14.5" r="1.5" fill="white" />
      <rect x="3" y="6" width="4" height="3" rx="0.5" fill="white" fillOpacity="0.45" />
      <rect x="8" y="6" width="4" height="3" rx="0.5" fill="white" fillOpacity="0.45" />
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
            <span className="ui-sidebar-title">Transit Performance</span>
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
            {sectionItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className={['ui-sidebar-item', page === item.id ? 'ui-sidebar-item-active' : '']
                  .filter(Boolean)
                  .join(' ')}
                aria-current={page === item.id ? 'page' : undefined}
                onClick={() => onNavigate(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        ))}
      </nav>

      <footer className="ui-sidebar-footer">CRDF · Transit analytics</footer>
    </aside>
  )
}