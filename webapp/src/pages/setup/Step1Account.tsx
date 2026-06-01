/**
 * T016 — Onboarding-Wizard Step 1: Account anlegen
 *
 * Spec: Onboarding_Wizard.md §2.2 (Schritt 1 — Stammdaten / Account)
 *       T016-Task: Email + Passwort + TOTP-QR + TOTP-Eingabe zur Bestätigung
 *
 * DECISION: Kein echtes qrcode-npm-Paket installiert (nicht in package.json).
 * Wir generieren stattdessen einen otpauth://-URI und zeigen den als
 * kopierbaren Text + Link auf einen QR-Generator. In Phase 1.2 wird qrcode-Library
 * installiert und das durch ein echtes QR-Bild ersetzt.
 */

import { useState, type FormEvent } from 'react';
import type { Step1Data } from './wizard.types';

// ── Validation ─────────────────────────────────────────────────────────────────

function validateStep1(data: Partial<Step1Data>): string | null {
  if (!data.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    return 'Bitte eine gültige E-Mail-Adresse eingeben.';
  }
  if (!data.password || data.password.length < 8) {
    return 'Passwort muss mindestens 8 Zeichen lang sein.';
  }
  if (data.password !== data.passwordConfirm) {
    return 'Passwörter stimmen nicht überein.';
  }
  if (!data.totpConfirm || !/^\d{6}$/.test(data.totpConfirm)) {
    return 'Bitte den 6-stelligen TOTP-Code aus deiner Authenticator-App eingeben.';
  }
  return null;
}

// ── Stub: TOTP-Secret generieren ───────────────────────────────────────────────
// DECISION: Im echten Flow kommt das Secret vom Backend (POST /api/wizard/{token}/totp/setup).
// Für das Skeleton wird es client-seitig als Placeholder generiert. CSPRNG
// (crypto.getRandomValues), damit CodeQL-„insecure-randomness"-Warnung wegfällt
// und das Stub-Secret keinem späteren Copy-Paste-Bug zum Opfer fällt.

function generateStubTotpSecret(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

function buildOtpauthUri(secret: string, email: string): string {
  const label = encodeURIComponent(`ProzessPilot:${email}`);
  const issuer = encodeURIComponent('ProzessPilot');
  return `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Step1AccountProps {
  initialData: Partial<Step1Data>;
  onComplete: (data: Step1Data) => void;
}

export default function Step1Account({ initialData, onComplete }: Step1AccountProps) {
  const [email, setEmail] = useState(initialData.email ?? '');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [totpSecret] = useState(() => initialData.totpSecret || generateStubTotpSecret());
  const [totpConfirm, setTotpConfirm] = useState('');
  const [showQr, setShowQr] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const otpauthUri = buildOtpauthUri(totpSecret, email || 'benutzer@example.com');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const data: Partial<Step1Data> = { email, password, passwordConfirm, totpSecret, totpConfirm };
    const validationError = validateStep1(data);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    try {
      // DECISION: Im Skeleton kein echter Backend-Call. Skeleton simuliert Erfolg.
      // In Phase 1.2: POST /api/wizard/{token}/step/1 mit Verifikation.
      await new Promise<void>((resolve) => setTimeout(resolve, 400));
      onComplete(data as Step1Data);
    } catch {
      setError('Fehler beim Speichern. Bitte erneut versuchen.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ width: '100%' }} aria-label="Schritt 1: Account anlegen">
      <h1 style={{
        fontSize: '1.5rem',
        fontWeight: 700,
        marginBottom: '0.5rem',
        background: 'var(--grad-brand)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
      }}>
        Dein Account
      </h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: '2rem', fontSize: '0.9rem', lineHeight: 1.6 }}>
        Erstelle deinen ProzessPilot-Account. Du wirst danach automatisch eingeloggt.
      </p>

      {/* E-Mail */}
      <fieldset style={{ border: 'none', marginBottom: '1.25rem' }}>
        <label htmlFor="wizard-email" style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
          E-Mail-Adresse *
        </label>
        <input
          id="wizard-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          placeholder="deine@email.de"
          style={inputStyle}
        />
      </fieldset>

      {/* Passwort */}
      <fieldset style={{ border: 'none', marginBottom: '1.25rem' }}>
        <label htmlFor="wizard-password" style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
          Passwort *
        </label>
        <input
          id="wizard-password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          placeholder="Mindestens 8 Zeichen"
          style={inputStyle}
        />
      </fieldset>

      {/* Passwort bestätigen */}
      <fieldset style={{ border: 'none', marginBottom: '1.5rem' }}>
        <label htmlFor="wizard-password-confirm" style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
          Passwort bestätigen *
        </label>
        <input
          id="wizard-password-confirm"
          type="password"
          autoComplete="new-password"
          value={passwordConfirm}
          onChange={(e) => setPasswordConfirm(e.target.value)}
          required
          placeholder="Gleich wie oben"
          style={inputStyle}
        />
      </fieldset>

      {/* TOTP-Setup */}
      <div style={{
        background: 'var(--card-2)',
        border: '1px solid var(--border-bright)',
        borderRadius: '0.75rem',
        padding: '1.25rem',
        marginBottom: '1.5rem',
      }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>
          Zwei-Faktor-Authentifizierung
        </h2>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem', lineHeight: 1.6 }}>
          Für deine Sicherheit aktivieren wir 2FA. Scanne den QR-Code mit einer
          Authenticator-App (Google Authenticator, Authy o.ä.) und gib dann den
          6-stelligen Code ein.
        </p>

        {/* QR-Code Toggle */}
        <button
          type="button"
          onClick={() => setShowQr((v) => !v)}
          style={{
            ...secondaryButtonStyle,
            marginBottom: '1rem',
          }}
        >
          {showQr ? 'QR-Code ausblenden' : 'QR-Code anzeigen'}
        </button>

        {showQr && (
          <div style={{ marginBottom: '1rem' }}>
            {/* DECISION: Kein QR-Bild — Link zu externem QR-Generator als Fallback.
                Phase 1.2: qrcode-Library installieren + echtes <canvas> QR. */}
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
              Scanne diesen Link in deiner Authenticator-App:
            </p>
            <a
              href={otpauthUri}
              data-testid="totp-otpauth-link"
              style={{
                display: 'block',
                wordBreak: 'break-all',
                fontSize: '0.7rem',
                color: 'var(--blue)',
                padding: '0.75rem',
                background: 'var(--surface)',
                borderRadius: '0.5rem',
                border: '1px solid var(--border)',
                fontFamily: 'monospace',
              }}
            >
              {otpauthUri}
            </a>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', marginTop: '0.4rem' }}>
              Alternativ: Klicke auf den Link wenn du mobil bist.
            </p>
          </div>
        )}

        {/* TOTP-Code eingeben */}
        <label htmlFor="wizard-totp" style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
          Code aus Authenticator-App *
        </label>
        <input
          id="wizard-totp"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={totpConfirm}
          onChange={(e) => setTotpConfirm(e.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder="123456"
          style={{ ...inputStyle, letterSpacing: '0.2em', textAlign: 'center', fontSize: '1.1rem' }}
        />
      </div>

      {/* Error */}
      {error && (
        <div
          role="alert"
          style={{
            padding: '0.75rem 1rem',
            background: 'rgba(248,113,113,0.1)',
            border: '1px solid rgba(248,113,113,0.3)',
            borderRadius: '0.5rem',
            color: '#f87171',
            fontSize: '0.875rem',
            marginBottom: '1rem',
          }}
        >
          {error}
        </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={submitting}
        style={primaryButtonStyle}
      >
        {submitting ? 'Wird gespeichert…' : 'Weiter →'}
      </button>
    </form>
  );
}

// ── Shared Styles ─────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.75rem 1rem',
  background: 'var(--surface)',
  border: '1px solid var(--border-bright)',
  borderRadius: '0.5rem',
  color: 'var(--text)',
  fontSize: '1rem',
  outline: 'none',
  boxSizing: 'border-box',
};

const primaryButtonStyle: React.CSSProperties = {
  width: '100%',
  padding: '1rem',
  background: 'var(--grad-blue)',
  border: 'none',
  borderRadius: '0.625rem',
  color: '#fff',
  fontWeight: 700,
  fontSize: '1rem',
  cursor: 'pointer',
  minHeight: '56px',
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: '0.5rem 1rem',
  background: 'transparent',
  border: '1px solid var(--border-bright)',
  borderRadius: '0.375rem',
  color: 'var(--text-muted)',
  fontSize: '0.85rem',
  cursor: 'pointer',
};
