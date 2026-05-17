/**
 * M14 — LoginPage
 *
 * Spec §6.2: Email + Password. Generic-Error (OWASP). Bei
 * password_must_change → Redirect /change-password.
 */

import { useState, useEffect, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../api/_client';

export default function LoginPage() {
  const { loginWithPassword, user, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (user) {
      if (user.password_must_change) {
        navigate('/change-password', { replace: true });
        return;
      }
      const from = (location.state as { from?: { pathname: string } })?.from?.pathname ?? '/';
      navigate(from, { replace: true });
    }
  }, [user, navigate, location.state]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!email || !password) {
      setError('Bitte Email und Passwort eingeben.');
      return;
    }
    setSubmitting(true);
    try {
      await loginWithPassword(email, password);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'ACCOUNT_LOCKED') {
        setError('Konto vorübergehend gesperrt. Bitte später erneut versuchen.');
      } else {
        // OWASP: kein "unbekannte Email" vs "falsches Passwort"
        setError('Login fehlgeschlagen. Bitte prüfe Email und Passwort.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', color: 'var(--text-muted)' }}>
        Wird geladen…
      </div>
    );
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
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🧭</div>
          <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.5px', margin: 0 }}>
            ProzessPilot
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 6 }}>
            Melde dich an, um fortzufahren
          </p>
        </div>

        <form onSubmit={handleSubmit} noValidate aria-label="Login">
          <div className="field" style={{ marginBottom: 20 }}>
            <label htmlFor="email" style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 13 }}>
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="du@beispiel.de"
              autoComplete="username"
              required
              disabled={submitting}
              style={{ width: '100%' }}
            />
          </div>

          <div className="field" style={{ marginBottom: 24 }}>
            <label htmlFor="password" style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 13 }}>
              Passwort
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                required
                disabled={submitting}
                style={{ flex: 1 }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Verbergen' : 'Anzeigen'}
                style={{ padding: '0 12px', background: 'var(--surface-2, var(--surface))', border: '1px solid var(--border)', borderRadius: 6 }}
              >
                {showPassword ? '🙈' : '👁'}
              </button>
            </div>
          </div>

          {error && (
            <div className="error-box" role="alert" style={{ marginBottom: 16, fontSize: 13 }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            className="primary"
            disabled={submitting}
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
            {submitting && <span className="spinner" />}
            {submitting ? 'Wird angemeldet…' : 'Anmelden'}
          </button>

          <p style={{ marginTop: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
            Passwort vergessen? Bitte deinen Admin kontaktieren.
          </p>
        </form>
      </div>
    </div>
  );
}
