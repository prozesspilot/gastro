/**
 * M14 — LoginPage (Discord-OAuth-first)
 *
 * Primäre Anmeldung: Discord-OAuth (Link zu /api/v1/auth/discord/login).
 * Sekundär: Notfall-Login für Geschäftsführer (ausgeklappt via Toggle).
 *
 * Spec: M14_User_Verwaltung_Auth.md §6.1 + §5.2
 */

import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../api/_client';

// Discord-Markenfarbe
const DISCORD_COLOR = '#5865F2';

export default function LoginPage() {
  const { loginWithEmergency, user, isLoading } = useAuth();
  const navigate = useNavigate();

  // Notfall-Formular-State
  const [showEmergency, setShowEmergency] = useState(false);
  const [useBackupCode, setUseBackupCode] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [backupCode, setBackupCode] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Bereits eingeloggt → Redirect zu /
  useEffect(() => {
    if (user) {
      navigate('/', { replace: true });
    }
  }, [user, navigate]);

  function resolveErrorMessage(code: string | undefined, fallback: string): string {
    switch (code) {
      case 'invalid_credentials':
        return 'Zugangsdaten ungültig.';
      case 'totp_invalid':
        return 'TOTP-Code ungültig. Bitte Authenticator-App prüfen.';
      case 'rate_limit_ip':
      case 'rate_limit_email':
        return 'Zu viele Versuche. Bitte 15 Minuten warten.';
      default:
        return fallback || 'Anmeldung fehlgeschlagen.';
    }
  }

  async function handleEmergencySubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (!email || !password) {
      setError('Bitte Email und Passwort eingeben.');
      return;
    }
    if (!useBackupCode && totpCode.length !== 6) {
      setError('TOTP-Code muss 6 Ziffern haben.');
      return;
    }
    if (useBackupCode && !backupCode) {
      setError('Bitte Backup-Code eingeben.');
      return;
    }

    setSubmitting(true);
    try {
      await loginWithEmergency(
        email,
        password,
        useBackupCode ? '' : totpCode,
        useBackupCode ? backupCode : undefined,
      );
      navigate('/', { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(resolveErrorMessage(err.code, err.message));
      } else {
        setError('Anmeldung fehlgeschlagen. Bitte erneut versuchen.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg)',
          color: 'var(--text-muted)',
        }}
      >
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
          maxWidth: 440,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          padding: '40px 36px',
        }}
      >
        {/* Heading */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🧭</div>
          <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.5px', margin: 0 }}>
            ProzessPilot
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 6 }}>
            Mitarbeiter-Anmeldung
          </p>
        </div>

        {/* Discord-Login-Button (primäre Aktion) */}
        <a
          href="/api/v1/auth/discord/login"
          aria-label="Mit Discord anmelden"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            width: '100%',
            padding: '13px 0',
            background: DISCORD_COLOR,
            color: 'white',
            borderRadius: 8,
            fontWeight: 700,
            fontSize: 15,
            textDecoration: 'none',
            boxShadow: '0 0 20px rgba(88,101,242,0.4)',
            transition: 'filter 0.15s, transform 0.15s',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLAnchorElement).style.filter = 'brightness(1.12)';
            (e.currentTarget as HTMLAnchorElement).style.transform = 'translateY(-1px)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLAnchorElement).style.filter = '';
            (e.currentTarget as HTMLAnchorElement).style.transform = '';
          }}
        >
          {/* Discord SVG Logo */}
          <svg width="22" height="17" viewBox="0 0 22 17" fill="none" aria-hidden="true">
            <path
              d="M18.36 1.54A17.82 17.82 0 0 0 13.9.1a.067.067 0 0 0-.07.034c-.19.34-.4.78-.546 1.13a16.46 16.46 0 0 0-4.557 0A11.4 11.4 0 0 0 8.17.134.07.07 0 0 0 8.1.1 17.77 17.77 0 0 0 3.64 1.54a.063.063 0 0 0-.029.025C.524 6.08-.313 10.48.098 14.82a.075.075 0 0 0 .028.051 17.92 17.92 0 0 0 5.404 2.73.071.071 0 0 0 .077-.026c.416-.569.787-1.169 1.104-1.797a.069.069 0 0 0-.038-.097 11.8 11.8 0 0 1-1.687-.804.07.07 0 0 1-.007-.116c.113-.085.226-.173.334-.262a.068.068 0 0 1 .07-.01c3.54 1.617 7.38 1.617 10.877 0a.068.068 0 0 1 .072.009c.108.09.22.178.335.263a.07.07 0 0 1-.006.116c-.539.315-1.1.582-1.688.803a.07.07 0 0 0-.037.098c.322.627.693 1.227 1.103 1.796a.07.07 0 0 0 .077.027 17.87 17.87 0 0 0 5.415-2.73.07.07 0 0 0 .028-.05c.5-5.177-.838-9.538-3.548-13.285a.055.055 0 0 0-.027-.025ZM7.35 12.12c-1.038 0-1.894-.953-1.894-2.123 0-1.17.839-2.123 1.894-2.123 1.063 0 1.91.961 1.893 2.123 0 1.17-.839 2.123-1.893 2.123Zm7.004 0c-1.038 0-1.893-.953-1.893-2.123 0-1.17.838-2.123 1.893-2.123 1.063 0 1.91.961 1.893 2.123 0 1.17-.83 2.123-1.893 2.123Z"
              fill="white"
            />
          </svg>
          Mit Discord anmelden
        </a>

        {/* Trennlinie */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            margin: '24px 0',
          }}
        >
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          <span style={{ color: 'var(--text-subtle)', fontSize: 12, fontWeight: 500 }}>oder</span>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        </div>

        {/* Notfall-Login-Toggle */}
        <button
          type="button"
          className="ghost"
          onClick={() => setShowEmergency((v) => !v)}
          style={{
            width: '100%',
            justifyContent: 'center',
            color: 'var(--text-muted)',
            fontSize: 13,
          }}
          aria-expanded={showEmergency}
          aria-controls="emergency-form"
        >
          {showEmergency ? '▲' : '▼'} Notfall-Login (nur für Geschäftsführer)
        </button>

        {/* Notfall-Formular (ausgeklappt) */}
        {showEmergency && (
          <form
            id="emergency-form"
            onSubmit={handleEmergencySubmit}
            noValidate
            aria-label="Notfall-Login"
            style={{ marginTop: 20 }}
          >
            <div className="field">
              <label htmlFor="emergency-email" style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 13 }}>
                Email
              </label>
              <input
                id="emergency-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="du@prozesspilot.net"
                autoComplete="username"
                required
                disabled={submitting}
                style={{ width: '100%' }}
              />
            </div>

            <div className="field">
              <label htmlFor="emergency-password" style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 13 }}>
                Passwort
              </label>
              <input
                id="emergency-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                required
                disabled={submitting}
                style={{ width: '100%' }}
              />
            </div>

            {/* TOTP oder Backup-Code */}
            {!useBackupCode ? (
              <div className="field">
                <label htmlFor="totp-code" style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 13 }}>
                  TOTP-Code (6 Ziffern)
                </label>
                <input
                  id="totp-code"
                  type="text"
                  inputMode="numeric"
                  pattern="\d{6}"
                  maxLength={6}
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  autoComplete="one-time-code"
                  disabled={submitting}
                  style={{ width: '100%', letterSpacing: '0.3em' }}
                />
                <button
                  type="button"
                  className="ghost"
                  onClick={() => { setUseBackupCode(true); setTotpCode(''); }}
                  style={{ padding: '4px 0', fontSize: 12, color: 'var(--text-subtle)' }}
                >
                  Backup-Code verwenden?
                </button>
              </div>
            ) : (
              <div className="field">
                <label htmlFor="backup-code" style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 13 }}>
                  Backup-Code
                </label>
                <input
                  id="backup-code"
                  type="text"
                  value={backupCode}
                  onChange={(e) => setBackupCode(e.target.value.toUpperCase())}
                  placeholder="BACKUP-CODE"
                  autoComplete="off"
                  disabled={submitting}
                  style={{ width: '100%', letterSpacing: '0.1em' }}
                />
                <button
                  type="button"
                  className="ghost"
                  onClick={() => { setUseBackupCode(false); setBackupCode(''); }}
                  style={{ padding: '4px 0', fontSize: 12, color: 'var(--text-subtle)' }}
                >
                  TOTP-Code verwenden?
                </button>
              </div>
            )}

            {error && (
              <div className="error-box" role="alert" style={{ marginBottom: 16, fontSize: 13 }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              className="secondary"
              disabled={submitting}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                fontSize: 14,
                padding: '10px 0',
                marginTop: 4,
              }}
            >
              {submitting && <span className="spinner" />}
              {submitting ? 'Wird angemeldet…' : 'Notfall-Anmeldung'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
