/**
 * T016 — Onboarding-Wizard Step 3: Kassensystem-Verbindung (SumUp)
 *
 * Spec: Onboarding_Wizard.md §2.7 (Schritt 6 — Kassensystem, optional)
 *       T016-Task: SumUp-OAuth-Redirect + "Überspringen"-Option
 *
 * DECISION: OAuth-URL ist ein Stub-Pfad (/api/wizard/sumup/oauth).
 * Echter SumUp-OAuth-Flow kommt in T015/M15 (Andreas-Revier).
 * Step überspringen möglich (Spec: "Wirt kann SumUp später verbinden").
 */

import { useState } from 'react';
import type { Step3Data } from './wizard.types';

interface Step3KasseProps {
  initialData: Partial<Step3Data>;
  onComplete: (data: Step3Data) => void;
  onSkip: () => void;
  onBack: () => void;
}

export default function Step3Kasse({ initialData, onComplete, onSkip, onBack }: Step3KasseProps) {
  const [status, setStatus] = useState<'pending' | 'connecting' | 'connected' | 'error'>(
    initialData.sumupStatus === 'connected' ? 'connected' : 'pending',
  );

  function handleConnectSumUp() {
    setStatus('connecting');
    // DECISION: Skeleton — redirect zum SumUp-OAuth.
    // Echter OAuth-Flow via M15-Backend. Nach OAuth-Callback landet Nutzer
    // auf /setup/step-3-kasse?sumup=success → dann setStatus('connected').
    // Hier simulieren wir den Redirect-Klick.
    const oauthUrl = '/api/wizard/sumup/oauth';
    window.location.href = oauthUrl;
  }

  function handleContinueConnected() {
    onComplete({ sumupStatus: 'connected' });
  }

  // Prüfe ob wir nach einem OAuth-Redirect hier landen
  // (In echter Impl: URL-Param ?sumup=success|error auswerten)
  const urlParams = new URLSearchParams(window.location.search);
  const sumupParam = urlParams.get('sumup');
  if (sumupParam === 'success' && status !== 'connected') {
    setStatus('connected');
  }

  return (
    <div style={{ width: '100%' }} aria-label="Schritt 3: Kassensystem verbinden">
      <h1 style={headingStyle}>Kassensystem verbinden</h1>
      <p style={subheadingStyle}>
        Hast du ein SumUp-Kassensystem? Dann können wir Tagesabschlüsse automatisch importieren
        und dir noch mehr Belegarbeit abnehmen.
      </p>

      {/* SumUp-Card */}
      <div style={{
        background: 'var(--card-2)',
        border: `1px solid ${status === 'connected' ? 'rgba(45,212,191,0.4)' : 'var(--border-bright)'}`,
        borderRadius: '0.75rem',
        padding: '1.5rem',
        marginBottom: '1.5rem',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>
          {status === 'connected' ? '✓' : '🔗'}
        </div>
        <h2 style={{ fontWeight: 600, marginBottom: '0.5rem', color: status === 'connected' ? 'var(--teal)' : 'var(--text)' }}>
          {status === 'connected' ? 'SumUp verbunden' : 'SumUp'}
        </h2>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.25rem', lineHeight: 1.5 }}>
          {status === 'connected'
            ? 'Dein SumUp-Konto ist erfolgreich verbunden. Tagesabschlüsse werden automatisch importiert.'
            : 'Verbinde dein SumUp-Konto, damit Kassenumsätze automatisch mit deinen Belegen abgeglichen werden.'}
        </p>

        {status === 'connected' ? (
          <button
            type="button"
            onClick={handleContinueConnected}
            style={primaryButtonStyle}
          >
            Weiter →
          </button>
        ) : (
          <button
            type="button"
            onClick={handleConnectSumUp}
            disabled={status === 'connecting'}
            style={primaryButtonStyle}
          >
            {status === 'connecting' ? 'Weiterleitung…' : 'Mit SumUp verbinden'}
          </button>
        )}

        {status === 'error' && (
          <div role="alert" style={errorStyle}>
            Verbindung fehlgeschlagen. Bitte versuche es erneut oder überspringe den Schritt.
          </div>
        )}
      </div>

      {/* Info-Box */}
      {status !== 'connected' && (
        <div style={{
          padding: '1rem',
          background: 'rgba(88,166,255,0.07)',
          border: '1px solid rgba(88,166,255,0.15)',
          borderRadius: '0.5rem',
          fontSize: '0.82rem',
          color: 'var(--text-muted)',
          lineHeight: 1.6,
          marginBottom: '1.5rem',
        }}>
          <strong style={{ color: 'var(--text)' }}>Kein SumUp?</strong> Kein Problem — du kannst diesen
          Schritt überspringen und SumUp später in den Einstellungen verbinden.
        </div>
      )}

      {/* Navigation */}
      <div style={{ display: 'flex', gap: '0.75rem' }}>
        <button type="button" onClick={onBack} style={{ ...secondaryButtonStyle, flex: '0 0 auto', minWidth: '80px' }}>
          ← Zurück
        </button>
        {status !== 'connected' && (
          <button type="button" onClick={onSkip} style={{ ...secondaryButtonStyle, flex: 1 }}>
            Überspringen — später verbinden
          </button>
        )}
      </div>
    </div>
  );
}

// ── Shared Styles ─────────────────────────────────────────────────────────────

const headingStyle: React.CSSProperties = {
  fontSize: '1.5rem',
  fontWeight: 700,
  marginBottom: '0.5rem',
  background: 'var(--grad-brand)',
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
};

const subheadingStyle: React.CSSProperties = {
  color: 'var(--text-muted)',
  marginBottom: '2rem',
  fontSize: '0.9rem',
  lineHeight: 1.6,
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
  padding: '0.75rem 1rem',
  background: 'transparent',
  border: '1px solid var(--border-bright)',
  borderRadius: '0.625rem',
  color: 'var(--text-muted)',
  fontSize: '0.9rem',
  cursor: 'pointer',
  minHeight: '56px',
};

const errorStyle: React.CSSProperties = {
  marginTop: '0.75rem',
  padding: '0.75rem 1rem',
  background: 'rgba(248,113,113,0.1)',
  border: '1px solid rgba(248,113,113,0.3)',
  borderRadius: '0.5rem',
  color: '#f87171',
  fontSize: '0.85rem',
};
