/**
 * M14 — UsersPage
 *
 * Spec §6.3: Liste + Create + Edit.
 * - Hide statt disable: Buttons fehlen wenn Permission fehlt.
 */

import { useCallback, useEffect, useState } from 'react';
import type { AuthUserDto } from '../api/auth';
import { deleteUser, listUsers } from '../api/users';
import { ApiError } from '../api/_client';
import { useAuth } from '../auth/AuthContext';
import UserFormModal from './UserFormModal';

export default function UsersPage() {
  const { hasPermission, user: me } = useAuth();
  const canManage = hasPermission('users.manage');

  const [users, setUsers] = useState<AuthUserDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [editing, setEditing] = useState<AuthUserDto | undefined>(undefined);

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const list = await listUsers();
      setUsers(list);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Fehler beim Laden');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  function openCreate() {
    setEditing(undefined);
    setModalMode('create');
    setModalOpen(true);
  }

  function openEdit(u: AuthUserDto) {
    setEditing(u);
    setModalMode('edit');
    setModalOpen(true);
  }

  async function handleDeactivate(u: AuthUserDto) {
    if (!window.confirm(`User ${u.email} wirklich deaktivieren?`)) return;
    try {
      await deleteUser(u.id);
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Fehler');
    }
  }

  return (
    <div className="page-container" style={{ padding: '24px 32px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Benutzer</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>
            Verwaltet die User dieses Tenants{me?.tenantId === null && ' (Tenant-übergreifende Sicht als super_admin)'}
          </p>
        </div>
        {canManage && (
          <button type="button" className="primary" onClick={openCreate}>
            + User anlegen
          </button>
        )}
      </div>

      {error && (
        <div className="error-box" role="alert" style={{ marginBottom: 16 }}>{error}</div>
      )}

      {loading ? (
        <p style={{ color: 'var(--text-muted)' }}>Wird geladen…</p>
      ) : users.length === 0 ? (
        <p style={{ color: 'var(--text-muted)' }}>Keine Benutzer gefunden.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
              <th style={{ padding: '8px 12px' }}>Email</th>
              <th style={{ padding: '8px 12px' }}>Name</th>
              <th style={{ padding: '8px 12px' }}>Preset</th>
              <th style={{ padding: '8px 12px' }}>Aktiv</th>
              <th style={{ padding: '8px 12px' }}>Letzter Login</th>
              {canManage && <th style={{ padding: '8px 12px' }}>Aktionen</th>}
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '8px 12px' }}>
                  <code>{u.email}</code>
                  {u.tenant_id === null && (
                    <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--accent, #58a6ff)' }}>super_admin</span>
                  )}
                </td>
                <td style={{ padding: '8px 12px' }}>{u.display_name}</td>
                <td style={{ padding: '8px 12px' }}>{u.preset ?? '—'}</td>
                <td style={{ padding: '8px 12px' }}>{u.is_active ? '✓' : '—'}</td>
                <td style={{ padding: '8px 12px', color: 'var(--text-muted)', fontSize: 12 }}>
                  {u.last_login_at ? new Date(u.last_login_at).toLocaleString('de-DE') : 'nie'}
                </td>
                {canManage && (
                  <td style={{ padding: '8px 12px' }}>
                    <button type="button" onClick={() => openEdit(u)} aria-label={`User ${u.email} bearbeiten`}>
                      Bearbeiten
                    </button>
                    {u.is_active && u.id !== me?.id && (
                      <button
                        type="button"
                        onClick={() => handleDeactivate(u)}
                        style={{ marginLeft: 6 }}
                        aria-label={`User ${u.email} deaktivieren`}
                      >
                        Deaktivieren
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <UserFormModal
        open={modalOpen}
        mode={modalMode}
        user={editing}
        onClose={() => setModalOpen(false)}
        onSaved={() => { void reload(); }}
      />
    </div>
  );
}
