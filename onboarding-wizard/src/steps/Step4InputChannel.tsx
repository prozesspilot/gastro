/**
 * T067 — Wizard-Schritt 4: Eingangskanal (Spec §2.5).
 *
 * Mehrfachauswahl WhatsApp / E-Mail → `input_channels` (Array) wird beim Abschluss
 * in tenants.input_channels promotet. Die echte Kanal-Bereitstellung (Twilio-Nummer,
 * Beleg-Mail-Adresse) kommt mit M10/M11 — hier nur die Auswahl + Hinweistext.
 */
import { type FormEvent, useState } from 'react';
import { saveStep, type StepProps, WizardApiError } from '../lib/api';

const CHANNELS: ReadonlyArray<[string, string, string]> = [
  ['whatsapp', '📱 WhatsApp', 'Foto vom Lieferschein, abschicken, fertig (empfohlen).'],
  ['email', '📧 E-Mail', 'Foto oder PDF an deine eigene Beleg-Mail-Adresse.'],
];

function initialChannels(initialData?: Record<string, unknown>): string[] {
  const v = initialData?.input_channels;
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

export function Step4InputChannel({ token, initialData, onSaved }: StepProps) {
  const [selected, setSelected] = useState<string[]>(initialChannels(initialData));
  const [error, setError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function toggle(ch: string) {
    setSelected((s) => (s.includes(ch) ? s.filter((c) => c !== ch) : [...s, ch]));
  }

  async function handleSubmit(ev: FormEvent) {
    ev.preventDefault();
    setServerError(null);
    if (selected.length === 0) {
      setError('Bitte mindestens einen Kanal wählen.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const session = await saveStep(token, 4, { input_channels: selected });
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
    <form onSubmit={handleSubmit} noValidate aria-label="Eingangskanal">
      <h2 style={{ fontFamily: 'var(--font-display)', marginBottom: 'var(--space-2)' }}>
        Wie schickst du uns deine Belege?
      </h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: 'var(--space-5)', fontSize: '.875rem' }}>
        Du kannst auch beides wählen — maximale Flexibilität.
      </p>

      {CHANNELS.map(([v, label, desc]) => {
        const checked = selected.includes(v);
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
              type="checkbox"
              checked={checked}
              onChange={() => toggle(v)}
              aria-label={v}
              style={{ marginTop: 4 }}
            />
            <span>
              <strong style={{ display: 'block' }}>{label}</strong>
              <span style={{ fontSize: '.8125rem', color: 'var(--text-muted)' }}>{desc}</span>
            </span>
          </label>
        );
      })}

      {selected.includes('email') && (
        <p style={{ fontSize: '.75rem', color: 'var(--text-subtle)' }}>
          Deine persönliche Beleg-Mail-Adresse erhältst du nach der Freischaltung.
        </p>
      )}

      {error && (
        <span role="alert" style={{ fontSize: '.75rem', color: 'var(--status-error-fg)' }}>
          {error}
        </span>
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
