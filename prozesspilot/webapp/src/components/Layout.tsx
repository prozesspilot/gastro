import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { fetchReceiptStats, fetchTenants, getActiveTenantId } from '../api';
import { useKeyboardShortcut } from '../hooks/useKeyboardShortcut';
import GlobalSearch from './GlobalSearch';

interface NavSpec {
  to: string;
  icon: string;
  label: string;
}

interface NavGroup {
  label: string;
  items: NavSpec[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Belege',
    items: [
      { to: '/',         icon: '⊞',  label: 'Dashboard'        },
      { to: '/upload',   icon: '📤', label: 'Belege hochladen' },
      { to: '/receipts', icon: '📋', label: 'Belegliste'       },
      { to: '/stats',    icon: '📊', label: 'Statistiken'      },
    ],
  },
  {
    label: 'Verwaltung',
    items: [
      { to: '/tenants',        icon: '🏢', label: 'Mandanten'              },
      { to: '/advisor',        icon: '👤', label: 'Steuerberater-Portal'   },
      { to: '/communications', icon: '✉',  label: 'Lieferanten-Komm.'     },
    ],
  },
  {
    label: 'System',
    items: [
      { to: '/plugins', icon: '🔌', label: 'Plugins'   },
    ],
  },
];

const NAV_BOTTOM: NavSpec[] = [
  { to: '/settings', icon: '⚙️', label: 'Einstellungen' },
];

export default function Layout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const breadcrumb = buildBreadcrumb(location.pathname);
  const [pendingCount, setPendingCount] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);

  useKeyboardShortcut(['Mod+k'], () => setSearchOpen(true));

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const tenantId = getActiveTenantId();
        let id = tenantId;
        if (!id) {
          const list = await fetchTenants();
          id = list[0]?.id ?? null;
        }
        if (!id) return;
        const stats = await fetchReceiptStats(id);
        if (!cancelled) {
          const open = (stats.by_status['received'] ?? 0)
            + (stats.by_status['extracting'] ?? 0)
            + (stats.by_status['extracted'] ?? 0)
            + (stats.by_status['categorizing'] ?? 0)
            + (stats.by_status['requires_review'] ?? 0);
          setPendingCount(open);
        }
      } catch {
        // Silent — Sidebar-Badge ist optional
      }
    }

    load();
    const interval = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">Zum Hauptinhalt springen</a>

      {/* ── Sidebar ── */}
      <aside className="sidebar" aria-label="Hauptnavigation">
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon" aria-hidden="true">P</div>
          <div>
            <div className="sidebar-logo-text">ProzessPilot</div>
            <div className="sidebar-logo-sub">Steuerberater-Suite</div>
          </div>
        </div>

        <nav className="sidebar-section" aria-label="Primäre Navigation">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <div className="sidebar-section-label">{group.label}</div>
              {group.items.map((item) => (
                <NavItem
                  key={item.to}
                  item={item}
                  showPendingDot={item.to === '/receipts' && pendingCount > 0}
                  pendingCount={item.to === '/receipts' ? pendingCount : 0}
                />
              ))}
            </div>
          ))}
        </nav>

        <nav className="sidebar-section" style={{ marginTop: 'auto', paddingBottom: 0 }} aria-label="Konfiguration">
          <div className="sidebar-section-label">Konfiguration</div>
          {NAV_BOTTOM.map((item) => (
            <NavItem key={item.to} item={item} showPendingDot={false} pendingCount={0} />
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="status-dot">
            <span className="status-dot-green" aria-hidden="true" />
            <span>System läuft · v0.1.0 · dev</span>
          </div>
        </div>
      </aside>

      {/* ── Hauptbereich ── */}
      <div className="main-content">
        <div className="top-bar">
          <nav className="top-bar-breadcrumb" aria-label="Brotkrumen">
            {breadcrumb.map((crumb, i) => (
              <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {i > 0 && <span className="top-bar-sep" aria-hidden="true">›</span>}
                {crumb}
              </span>
            ))}
          </nav>

          <button
            type="button"
            className="global-search-trigger"
            onClick={() => setSearchOpen(true)}
            aria-label="Globale Suche öffnen (Cmd+K)"
            aria-haspopup="dialog"
          >
            <span aria-hidden="true">🔍</span>
            <span>Suche…</span>
            <kbd aria-hidden="true">⌘K</kbd>
          </button>
        </div>

        <main id="main-content" className="page-body" key={location.pathname} tabIndex={-1}>
          {children}
        </main>
      </div>

      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}

function NavItem({ item, showPendingDot, pendingCount }: { item: NavSpec; showPendingDot: boolean; pendingCount: number }) {
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
      aria-label={showPendingDot && pendingCount > 0 ? `${item.label} (${pendingCount} ausstehend)` : item.label}
    >
      <span className="nav-icon" aria-hidden="true">{item.icon}</span>
      <span>{item.label}</span>
      {showPendingDot && <span className="nav-pending-dot" aria-hidden="true" />}
    </NavLink>
  );
}

function buildBreadcrumb(path: string): ReactNode[] {
  const segments = path.split('/').filter(Boolean);
  if (segments.length === 0) {
    return [<span key="home" style={{ color: 'var(--text)', fontWeight: 500 }}>Dashboard</span>];
  }

  const labelMap: Record<string, string> = {
    upload:       'Belege hochladen',
    receipts:     'Belege',
    stats:        'Statistiken',
    tenants:      'Mandanten',
    customers:    'Kunden',
    profile:      'Profil & Module',
    reports:      'Monatsberichte',
    settings:     'Einstellungen',
    advisor:      'Steuerberater-Portal',
    communications: 'Lieferanten-Kommunikation',
  };

  const crumbs: ReactNode[] = [];
  let currentPath = '';

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    currentPath += `/${seg}`;
    let label = labelMap[seg] ?? seg;
    // Wenn wir auf /receipts/:id landen, hat das letzte Segment das Format einer ID
    if (i === segments.length - 1 && segments[0] === 'receipts' && segments.length === 2) {
      label = `Beleg ${seg.slice(0, 8)}…`;
    }
    const isLast = i === segments.length - 1;

    if (isLast) {
      crumbs.push(
        <span key={currentPath} style={{ color: 'var(--text)', fontWeight: 500 }}>{label}</span>,
      );
    } else {
      crumbs.push(
        <NavLink key={currentPath} to={currentPath} style={{ color: 'var(--text-muted)' }}>
          {label}
        </NavLink>,
      );
    }
  }

  return crumbs;
}
