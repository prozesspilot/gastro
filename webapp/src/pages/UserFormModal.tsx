/**
 * M14 — UserFormModal: Anlegen / Bearbeiten
 *
 * Spec §6.3 + §3.3 (Presets).
 * - Preset-Dropdown
 * - Permission-Editor wenn Preset=custom
 * - Temp-Passwort wird einmalig angezeigt nach Create
 */

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { AuthUserDto } from '../api/auth';
import {
  createUser,
  resetUserPassword,
  updateUser,
  type CreateUserInput,
  type UpdateUserInput,
} from '../api/users';
import { ApiError } from '../api/_client';
import { useAuth } from '../auth/AuthContext';

interface Props {
  open: boolean;
  mode: 'create' | 'edit';
  user?: AuthUserDto;
  onClose: () => void;
  onSaved: () => void;
}

type Preset = 'super_admin' | 'admin' | 'operator' | 'viewer' | 'custom';

const PRESET_OPTIONS: { value: Preset; label: string; description: string }[] = [
  { value: 'admin', label: 'Admin', description: 'Voller Zugriff im Tenant (außer super_admin)' },
  { value: 'operator', label: 'Operator', description: 'Belege lesen + bearbeiten, Reports lesen' },
  { value: 'viewer', label: 'Viewer', description: 'Nur lesen' },
  { value: 'custom', label: 'Custom', description: 'Eigene Permissions wählen' },
];

const ALL_PERMISSIONS = [
  'receipts.read', 'receipts.write', 'receipts.delete', 'receipts.export',
  'customers.read', 'customers.write', 'customers.delete',
  'users.read', 'users.manage',
  'settings.read', 'settings.edit',
  'plugins.read', 'plugins.install', 'plugins.configure',
  'reports.read', 'reports.export',
  'dsgvo.read', 'dsgvo.execute',
  'audit.read',
];

export default function UserFormModal({ open, mode, user, onClose, onSaved }: Props) {
  const { user: me } = useAuth();
  const isSuperAdminCaller = me?.tenantId === null;

  const presetOptions = useMemo(() => {
    return isSuperAdminCaller
      ? [{ value: 'super_admin' as Preset, label: 'Super-Admin', description: 'Tenant-übergreifend, "*"' }, ...PRESET_OPTIONS]
      : PRESET_OPTIONS;
  }, [isSuperAdminCaller]);

  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [preset, setPreset] = useState<Preset>('viewer');
  const [permissions, setPermissions] = useState<string[]>([]);
  const [isActive, setIsActive] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (mode === 'edit' && user) {
      setEmail(user.email);
      setDisplayName(user.display_name);
      setPreset((user.preset as Preset) ?? 'custom');
      setPermissions(user.permissions);
      setIsActive(user.is_active);
    } else {
      setEmail('');
      setDisplayName('');
      setPreset('viewer');
      setPermissions([]);
      setIsActive(true);
    }
    setError('');
    setTempPassword(null);
  }, [open, mode, user]);

  if (!open) return null;

  function togglePermission(p: string) {
    setPermissions((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      if (mode === 'create') {
        const body: CreateUserInput = {
          email,
          display_name: displayName,
          preset,
          permissions: preset === 'custom' ? permissions : undefined,
        };
        const res = await createUser(body);
        setTempPassword(res.temporary_password);
      } else if (mode === 'edit' && user) {
        const body: UpdateUserInput = {
          display_name: displayName,
          preset,
          is_active: isActive,
          permissions: preset === 'custom' ? permissions : undefined,
        };
        await updateUser(user.id, body);
        onSaved();
        onClose();
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Speichern fehlgeschlagen.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResetPassword() {
    if (!user) return;
    setError('');
    try {
      const res = await resetUserPassword(user.id);
      setTempPassword(res.temporary_password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Reset fehlgeschlagen.');
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="user-form-title"
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        width: '100%', maxWidth: 560,
        padding: 28,
        maxHeight: '90vh', overflow: 'auto',
      }}>
        <h2 id="user-form-title" style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
          {mode === 'create' ? 'Neuen User anlegen' : `User bearbeiten — ${user?.email}`}
        </h2>

        {tempPassword ? (
          <div style={{ marginTop: 20 }}>
            <p style={{ marginBottom: 8 }}>
              <strong>Temporäres Passwort wurde gesetzt:</strong>
            </p>
            <code
              data-testid="temp-password"
              style={{ display: 'block', padding: '12px 16px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, fontFamily: 'monospace', fontSize: 15 }}
            >
              {tempPassword}
            </code>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 10 }}>
              Diese Anzeige erscheint nur einmal. Bitte sicher übergeben.
              Beim ersten Login muss der User ein neues Passwort setzen.
            </p>
            <button
              type="button"
              onClick={() => { setTempPassword(null); onSaved(); onClose(); }}
              className="primary"
              style={{ marginTop: 16 }}
            >
              Verstanden
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate style={{ marginTop: 16 }}>
            <div className="field" style={{ marginBottom: 14 }}>
              <label htmlFor="email" style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 13 }}>Email</label>
              <input
                id="email" type="email" value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={mode === 'edit' || submitting} required
                style={{ width: '100%' }}
              />
            </div>

            <div className="field" style={{ marginBottom: 14 }}>
              <label htmlFor="display-name" style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 13 }}>Display-Name</label>
              <input
                id="display-name" value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                disabled={submitting} required
                style={{ width: '100%' }}
              />
            </div>

            <div className="field" style={{ marginBottom: 14 }}>
              <label htmlFor="preset" style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 13 }}>Preset</label>
              <select
                id="preset" value={preset}
                onChange={(e) => setPreset(e.target.value as Preset)}
                disabled={submitting} style={{ width: '100%' }}
              >
                {presetOptions.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 4 }}>
                {presetOptions.find((o) => o.value === preset)?.description}
              </p>
            </div>

            {preset === 'custom' && (
              <div className="field" style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 13 }}>
                  Permissions
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                  {ALL_PERMISSIONS.map((p) => (
                    <label key={p} style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input
                        type="checkbox"
                        checked={permissions.includes(p)}
                        onChange={() => togglePermission(p)}
                      />
                      <code>{p}</code>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {mode === 'edit' && (
              <div className="field" style={{ marginBottom: 14 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                  />
                  Aktiv
                </label>
              </div>
            )}

            {error && (
              <div className="error-box" role="alert" style={{ marginBottom: 12, fontSize: 13 }}>{error}</div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
              <button type="button" onClick={onClose} disabled={submitting} style={{ flex: 1 }}>
                Abbrechen
              </button>
              {mode === 'edit' && (
                <button type="button" onClick={handleResetPassword} disabled={submitting}>
                  Passwort zurücksetzen
                </button>
              )}
              <button type="submit" className="primary" disabled={submitting} style={{ flex: 1 }}>
                {submitting ? 'Speichern…' : mode === 'create' ? 'Anlegen' : 'Speichern'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
