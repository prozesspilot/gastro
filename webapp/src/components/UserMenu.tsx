/**
 * M14 — UserMenu (Avatar + Dropdown oben rechts)
 *
 * Spec §6.6
 */

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('') || '?';
}

export default function UserMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  if (!user) return null;

  return (
    <div ref={ref} style={{ position: 'relative' }} data-testid="user-menu">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Benutzermenü"
        aria-haspopup="menu"
        aria-expanded={open}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '6px 10px', borderRadius: 999,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          fontSize: 13, fontWeight: 600,
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 28, height: 28, borderRadius: '50%',
            background: 'var(--color-brand)',
            color: '#fff',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12,
          }}
        >
          {initials(user.displayName)}
        </span>
        <span style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {user.displayName}
        </span>
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute', right: 0, top: 'calc(100% + 6px)',
            minWidth: 240,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            padding: 8,
            boxShadow: 'var(--shadow-lg)',
            zIndex: 100,
          }}
        >
          <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>{user.displayName}</div>
            {/* B1: M14-Sessions haben keine Email — Fallback auf displayName */}
            <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{user.email || user.displayName}</div>
            <div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 4 }}>
              {user.role ?? 'Mitarbeiter'}
              {user.tenantId && ` · Tenant: ${user.tenantId.slice(0, 8)}…`}
            </div>
          </div>

          {/* A3-Reboot (T059): "Passwort ändern" (/change-password) und "Benutzer"
              (/users) entfernt — beide Routen gibt es nicht mehr. M14-Cookie-User
              (Discord/Notfall-TOTP) haben kein Passwort-Konto; User-Verwaltung
              kommt ggf. später als eigene Seite. */}
          <button
            type="button"
            role="menuitem"
            onClick={async () => { setOpen(false); await logout(); navigate('/login', { replace: true }); }}
            style={menuItemStyle}
          >
            Logout
          </button>
        </div>
      )}
    </div>
  );
}

const menuItemStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  textAlign: 'left',
  padding: '8px 10px',
  background: 'transparent',
  border: 'none',
  fontSize: 13,
  cursor: 'pointer',
  borderRadius: 6,
};
