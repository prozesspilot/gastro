/**
 * T067 — Wizard-Schritt 5: Archiv-Verbindung (Spec §2.6).
 *
 * Provider-Auswahl → `archive_provider` wird beim Abschluss in tenants promotet.
 * Der echte OAuth-Flow (Google Drive / Dropbox) fehlt als Modul → klar markierter
 * Platzhalter ("kommt bald"). Nur die Auswahl wird gespeichert.
 */
import { type FormEvent, useState } from 'react';
import { saveStep, type StepProps, WizardApiError } from '../lib/api';

/** [value, label, beschreibung, oauthPlatzhalter] */
const PROVIDERS: ReadonlyArray<[string, string, string, boolean]> = [
  ['google_drive', '🟢 Google Drive (empfohlen)', 'Kostenlos bis 15 GB.', true],
  ['dropbox', '🔵 Dropbox', 'Alternative Cloud.', true],
  ['pp_internal', '⚪ ProzessPilot-Archiv', 'Unser eigenes Archiv (Phase 3).', false],
];

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

export function Step5Archive({ token, initialData, onSaved }: StepProps) {
  const [provider, setProvider] = useState(str(initialData?.archive_provider) || 'google_drive');
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const showOauthHint = provider === 'google_drive' || provider === 'dropbox';

  async function handleSubmit(ev: FormEvent) {
    ev.preventDefault();
    setServerError(null);
    setSubmitting(true);
    try {
      const session = await saveStep(token, 5, { archive_provider: provider });
      onSaved(session);
    } catch (err) {
      setServerError(
        err instanceof WizardApiError ? err.message : 'Speichern fehlgeschlagen. Bitte erneut versuchen.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate aria-label="Archiv-Verbindung">
      <h2 style={{ fontFamily: 'var(--font-display)', marginBottom: 'var(--space-2)' }}>
        Wo sollen deine Belege archiviert werden?
      </h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: 'var(--space-5)', fontSize: '.875rem' }}>
        10 Jahre Aufbewahrung sind Pflicht (GoBD). Wir legen sie sicher für dich ab.
      </p>

      {PROVIDERS.map(([v, label, desc]) => {
        const checked = provider === v;
        return (
          <label
            key={v}
            style={{
              display: 'flex',
              gap: 'var(--space-3)',
              alignItems: 'flex-start',
              padding: 'var(--space-4)',
              marginBottom: 'var(--space-3)',
              border: `1px solid ${checked ? 'var(--text-brand)' : 'var(--border-subtle)'}`,
              borderRadius: 'var(--radius-lg)',
              cursor: 'pointer',
            }}
          >
            <input
              type="radio"
              name="archive_provider"
              value={v}
              checked={checked}
              onChange={() => setProvider(v)}
              style={{ marginTop: 4 }}
            />
            <span>
              <strong style={{ display: 'block' }}>{label}</strong>
              <span style={{ fontSize: '.8125rem', color: 'var(--text-muted)' }}>{desc}</span>
            </span>
          </label>
        );
      })}

      {showOauthHint && (
        <button
          type="button"
          className="secondary"
          disabled
          style={{ width: '100%', marginBottom: 'var(--space-2)' }}
        >
          Direkt-Anbindung kommt bald
        </button>
      )}
      {showOauthHint && (
        <p style={{ fontSize: '.75rem', color: 'var(--text-subtle)' }}>
          Die Verbindung richten wir beim Setup-Review für dich ein — deine Auswahl reicht.
        </p>
      )}

      {serverError && (
        <div className="error-box" role="alert" style={{ margin: 'var(--space-4) 0' }}>
          {serverError}
        </div>
      )}

      <button
        type="submit"
        className="primary"
        disabled={submitting}
        style={{ width: '100%', height: 48, marginTop: 'var(--space-4)' }}
      >
        {submitting ? 'Wird gespeichert…' : 'Weiter'}
      </button>
    </form>
  );
}
