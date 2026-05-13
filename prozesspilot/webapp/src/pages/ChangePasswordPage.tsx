/**
 * M14 — ChangePasswordPage
 *
 * Spec §6.4: Forced Change-Password-Flow.
 * - Aktuelles Passwort + neues + Bestätigung
 * - Min 12 Zeichen (client + server)
 * - Nach Erfolg: Re-Login (Backend revoked alte Sessions)
 */

import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../api/_client';
import { changePassword as apiChangePassword } from '../api/auth';

export default function ChangePasswordPage() {
  const { accessToken, user, updateLocalUser, logout } = useAuth();
  const navigate = useNavigate();

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  if (!user || !accessToken) {
    navigate('/login', { replace: true });
    return null;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (next.length < 12) {
      setError('Neues Passwort muss mindestens 12 Zeichen lang sein.');
      return;
    }
    if (next !== confirm) {
      setError('Die beiden Passwörter stimmen nicht überein.');
      return;
    }
    if (next === current) {
      setError('Neues Passwort muss sich vom aktuellen unterscheiden.');
      return;
    }
    setSubmitting(true);
    try {
      await apiChangePassword(accessToken!, current, next);
      updateLocalUser({ password_must_change: false });
      setSuccess(true);
      // Backend revoked alle Refresh-Tokens — daher Re-Login.
      setTimeout(async () => {
        await logout();
        navigate('/login', { replace: true });
      }, 1200);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'INVALID_CREDENTIALS') {
        setError('Aktuelles Passwort ist falsch.');
      } else if (err instanceof ApiError && err.code === 'WEAK_PASSWORD') {
        setError(err.message);
      } else {
        setError('Passwort-Wechsel fehlgeschlagen.');
      }
    } finally {
      setSubmitting(false);
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
          maxWidth: 440,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          padding: '36px 32px',
        }}
      >
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Passwort ändern</h1>
        {user.password_must_change && (
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 8 }}>
            Bitte lege ein neues Passwort fest, um fortzufahren.
          </p>
        )}

        <form onSubmit={handleSubmit} noValidate style={{ marginTop: 24 }}>
          <div className="field" style={{ marginBottom: 16 }}>
            <label htmlFor="current" style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 13 }}>
              Aktuelles Passwort
            </label>
            <input
              id="current"
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
              required
              disabled={submitting}
              style={{ width: '100%' }}
            />
          </div>

          <div className="field" style={{ marginBottom: 16 }}>
            <label htmlFor="new" style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 13 }}>
              Neues Passwort (mind. 12 Zeichen)
            </label>
            <input
              id="new"
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              autoComplete="new-password"
              required
              minLength={12}
              disabled={submitting}
              style={{ width: '100%' }}
            />
          </div>

          <div className="field" style={{ marginBottom: 24 }}>
            <label htmlFor="confirm" style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 13 }}>
              Neues Passwort bestätigen
            </label>
            <input
              id="confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              required
              disabled={submitting}
              style={{ width: '100%' }}
            />
          </div>

          {error && (
            <div className="error-box" role="alert" style={{ marginBottom: 16, fontSize: 13 }}>
              {error}
            </div>
          )}
          {success && (
            <div role="status" style={{ marginBottom: 16, fontSize: 13, color: 'var(--ok, #3fb950)' }}>
              Passwort geändert — du wirst zum Login geleitet.
            </div>
          )}

          <button
            type="submit"
            className="primary"
            disabled={submitting || success}
            style={{
              width: '100%',
              fontSize: 15,
              padding: '12px 0',
            }}
          >
            {submitting ? 'Wird gespeichert…' : 'Passwort ändern'}
          </button>
        </form>
      </div>
    </div>
  );
}
