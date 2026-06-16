import { type ReactNode, useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { getActiveTenantId } from '../api';
import { listBelege } from '../api/belege';
import TenantSelector from './TenantSelector';
import UserMenu from './UserMenu';

/**
 * Interne Staff-Webapp-Shell (A3-Reboot T059).
 * Schlanke Navigation auf der belege-Welt; Geister-Einträge (receipts/stats/
 * advisor/communications/plugins/users) entfernt.
 */

interface NavSpec {
  to: string;
  icon: string;
  label: string;
}

const NAV: NavSpec[] = [
  { to: '/', icon: '⊞', label: 'Dashboard' },
  { to: '/belege', icon: '📋', label: 'Belege' },
  { to: '/belege/upload', icon: '📤', label: 'Beleg hochladen' },
  { to: '/tenants', icon: '🏢', label: 'Mandanten' },
];

const NAV_BOTTOM: NavSpec[] = [{ to: '/settings', icon: '⚙️', label: 'Einstellungen' }];

export default function Layout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const breadcrumb = buildBreadcrumb(location.pathname);
  const [pendingCount, setPendingCount] = useState(0);

  // Pending-Badge: Belege im Status requires_review für den aktiven Tenant.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!getActiveTenantId()) return; // ohne Tenant kein Call (sonst 400)
      try {
        const res = await listBelege({ status: 'requires_review', pageSize: 1 });
        if (!cancelled) setPendingCount(res.pagination.total);
      } catch {
        // Badge ist optional
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
      <a href="#main-content" className="skip-link">
        Zum Hauptinhalt springen
      </a>

      {/* ── Sidebar ── */}
      <aside className="sidebar" aria-label="Hauptnavigation">
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon" aria-hidden="true">
            P
          </div>
          <div>
            <div className="sidebar-logo-text">ProzessPilot</div>
            <div className="sidebar-logo-sub">Mitarbeiter-Tool</div>
          </div>
        </div>

        <nav className="sidebar-section" aria-label="Primäre Navigation">
          {NAV.map((item) => (
            <NavItem
              key={item.to}
              item={item}
              showPendingDot={item.to === '/belege' && pendingCount > 0}
              pendingCount={item.to === '/belege' ? pendingCount : 0}
            />
          ))}
        </nav>

        <nav
          className="sidebar-section"
          style={{ marginTop: 'auto', paddingBottom: 0 }}
          aria-label="Konfiguration"
        >
          {NAV_BOTTOM.map((item) => (
            <NavItem key={item.to} item={item} showPendingDot={false} pendingCount={0} />
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="status-dot">
            <span className="status-dot-green" aria-hidden="true" />
            <span>System läuft · v0.1.0</span>
          </div>
        </div>
      </aside>

      {/* ── Hauptbereich ── */}
      <div className="main-content">
        <div className="top-bar">
          <nav className="top-bar-breadcrumb" aria-label="Brotkrumen">
            {breadcrumb.map((crumb, i) => (
              <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {i > 0 && (
                  <span className="top-bar-sep" aria-hidden="true">
                    ›
                  </span>
                )}
                {crumb}
              </span>
            ))}
          </nav>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <TenantSelector />
            <UserMenu />
          </div>
        </div>

        <main id="main-content" className="page-body" key={location.pathname} tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}

function NavItem({
  item,
  showPendingDot,
  pendingCount,
}: {
  item: NavSpec;
  showPendingDot: boolean;
  pendingCount: number;
}) {
  return (
    <NavLink
      to={item.to}
      end={item.to === '/' || item.to === '/belege'}
      className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
      aria-label={
        showPendingDot && pendingCount > 0 ? `${item.label} (${pendingCount} ausstehend)` : item.label
      }
    >
      <span className="nav-icon" aria-hidden="true">
        {item.icon}
      </span>
      <span>{item.label}</span>
      {showPendingDot && <span className="nav-pending-dot" aria-hidden="true" />}
    </NavLink>
  );
}

function buildBreadcrumb(path: string): ReactNode[] {
  const segments = path.split('/').filter(Boolean);
  if (segments.length === 0) {
    return [
      <span key="home" style={{ color: 'var(--text)', fontWeight: 500 }}>
        Dashboard
      </span>,
    ];
  }

  const labelMap: Record<string, string> = {
    belege: 'Belege',
    upload: 'Beleg hochladen',
    tenants: 'Mandanten',
    settings: 'Einstellungen',
  };

  const crumbs: ReactNode[] = [];
  let currentPath = '';
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    currentPath += `/${seg}`;
    let label = labelMap[seg] ?? seg;
    if (i === segments.length - 1 && segments[0] === 'belege' && segments.length === 2) {
      label = `Beleg ${seg.slice(0, 8)}…`;
    }
    const isLast = i === segments.length - 1;
    if (isLast) {
      crumbs.push(
        <span key={currentPath} style={{ color: 'var(--text)', fontWeight: 500 }}>
          {label}
        </span>,
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
