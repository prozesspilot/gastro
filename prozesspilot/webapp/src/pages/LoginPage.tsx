/**
 * D2 — LoginPage
 *
 * Minimal-Login: User wählt Tenant aus Liste + gibt optionales Passwort ein.
 * In Dev-Modus (PP_AUTH_DISABLED=1 am Backend) ist Passwort nicht nötig.
 *
 * Nach Login → Redirect zur ursprünglichen Seite (oder Dashboard).
 */

import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { getTenants } from '../api/tenants';
import type { Tenant } from '../types';

export default function LoginPage() {
  const { login, user }   = useAuth();
  const navigate          = useNavigate();
  const location          = useLocation();

  const [tenants, setTenants]     = useState<Tenant[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [password, setPassword]   = useState('');
  const [loading, setLoading]     = useState(false);
  const [tenantsLoading, setTenantsLoading] = useState(true);
  const [error, setError]         = useState('');

  // Falls bereits eingeloggt → weiterleiten
  useEffect(() => {
    if (user) {
      const from = (location.state as { from?: { pathname: string } })?.from?.pathname ?? '/';
      navigate(from, { replace: true });
    }
  }, [user, navigate, location.state]);

  // Tenants laden
  useEffect(() => {
    getTenants()
      .then((list) => {
        setTenants(list);
        if (list.length > 0) setSelectedId(list[0].id);
      })
      .catch(() => {
        // Backend nicht erreichbar — Demo-Tenant als Fallback
        const demo: Tenant = { id: 'demo', name: 'Demo-Tenant', slug: 'demo', created_at: '' };
        setTenants([demo]);
        setSelectedId(demo.id);
      })
      .finally(() => setTenantsLoading(false));
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!selectedId) {
      setError('Bitte wähle einen Tenant aus.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const tenant = tenants.find((t) => t.id === selectedId);

      // DECISION: In Dev-Modus kein echter Auth-Call — wir validieren nur,
      // dass der Tenant existiert. Password-Prüfung kommt in Phase 3.
      // In Produktion: POST /auth/login mit tenant_id + password → JWT.
      login({
        tenantId:    selectedId,
        tenantName:  tenant?.name ?? selectedId,
        displayName: tenant?.name ?? selectedId,
        // token: wird in Phase 3 befüllt
      });

      const from = (location.state as { from?: { pathname: string } })?.from?.pathname ?? '/';
      navigate(from, { replace: true });
    } catch {
      setError('Login fehlgeschlagen. Bitte versuche es erneut.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg)',
        padding: '24px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 400,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          padding: '40px 36px',
        }}
      >
        {/* Logo / Titel */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🧭</div>
          <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.5px', margin: 0 }}>
            ProzessPilot
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 6 }}>
            Melde dich an, um fortzufahren
          </p>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          {/* Tenant-Auswahl */}
          <div className="field" style={{ marginBottom: 20 }}>
            <label htmlFor="tenant-select" style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 13 }}>
              Mandant / Tenant
            </label>
            {tenantsLoading ? (
              <div style={{ color: 'var(--text-muted)', fontSize: 14, padding: '10px 0' }}>
                Wird geladen…
              </div>
            ) : (
              <select
                id="tenant-select"
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                disabled={loading}
                required
                style={{ width: '100%' }}
              >
                <option value="">— Bitte wählen —</option>
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Passwort (optional in Dev) */}
          <div className="field" style={{ marginBottom: 24 }}>
            <label htmlFor="password" style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 13 }}>
              Passwort{' '}
              <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: 12 }}>
                (optional im Dev-Modus)
              </span>
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Passwort eingeben"
              disabled={loading}
              autoComplete="current-password"
              style={{ width: '100%' }}
            />
          </div>

          {/* Fehlermeldung */}
          {error && (
            <div
              className="error-box"
              role="alert"
              style={{ marginBottom: 16, fontSize: 13 }}
            >
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            className="primary"
            disabled={loading || !selectedId || tenantsLoading}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              fontSize: 15,
              padding: '12px 0',
            }}
          >
            {loading && <span className="spinner" />}
            {loading ? 'Wird angemeldet…' : 'Anmelden'}
          </button>
        </form>

        <p style={{ marginTop: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
          ProzessPilot v0.1 · Dev-Modus
        </p>
      </div>
    </div>
  );
}
