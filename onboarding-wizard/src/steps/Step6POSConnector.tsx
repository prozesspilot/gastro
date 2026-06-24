/**
 * T067 — Wizard-Schritt 6: Kassensystem-Verbindung (Spec §2.7).
 *
 * SumUp ist ECHT angebunden (öffentliche Brücke POST /wizard/:token/oauth/sumup/start):
 *  1. "Mit SumUp verbinden" speichert die Auswahl (pos_connected:false) und holt die
 *     redirect_url → window.location → SumUp-OAuth.
 *  2. SumUp-Callback redirectet zurück auf /{token}?pos_connected=sumup → wir erkennen
 *     das, zeigen "✓ verbunden" und speichern beim Weiter pos_connected:true.
 * Andere Optionen (anderes Cloud-System / klassische Kasse / überspringen) sind reine
 * Auswahl. Nur pos_system (bei SumUp) wird beim Abschluss in tenants promotet.
 */
import { type FormEvent, useEffect, useState } from 'react';
import { Field } from '../components/Field';
import { saveStep, startSumupConnect, type StepProps, WizardApiError } from '../lib/api';

const POS_CHOICES: ReadonlyArray<[string, string, string]> = [
  ['sumup', '✅ Ja, SumUp', 'Direkt verbinden — Tagesabschlüsse kommen automatisch.'],
  ['other_cloud', '⏳ Ja, anderes Cloud-System', 'orderbird / Lightspeed / ready2order — melde dich beim Support.'],
  ['classic', '📃 Nein / klassische Kasse', 'Z-Bon einfach täglich fotografieren wie andere Belege.'],
  ['skip', '⏭️ Überspringen', 'Mache ich später.'],
];

const SUMUP_VARIANTS: ReadonlyArray<[string, string]> = [
  ['sumup_lite', 'SumUp Lite'],
  ['sumup_pos_pro', 'SumUp POS Pro'],
];

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

export function Step6POSConnector({ token, initialData, onSaved }: StepProps) {
  const init = initialData ?? {};
  const [posChoice, setPosChoice] = useState(str(init.pos_choice) || 'sumup');
  const [posSystem, setPosSystem] = useState(str(init.pos_system) || 'sumup_lite');
  const [connected, setConnected] = useState(init.pos_connected === true);
  const [connecting, setConnecting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // Rückkehr vom SumUp-OAuth erkennen (?pos_connected=sumup) + URL säubern,
  // damit ein Refresh den Status nicht erneut triggert.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('pos_connected') === 'sumup') {
      setConnected(true);
      setPosChoice('sumup');
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, []);

  async function handleConnect() {
    setServerError(null);
    setConnecting(true);
    try {
      // Auswahl ZUERST persistieren, damit sie den Redirect überlebt.
      await saveStep(token, 6, { pos_choice: 'sumup', pos_system: posSystem, pos_connected: false });
      const { redirect_url } = await startSumupConnect(token);
      window.location.assign(redirect_url);
    } catch (err) {
      setServerError(
        err instanceof WizardApiError ? err.message : 'SumUp-Verbindung fehlgeschlagen. Bitte erneut versuchen.',
      );
      setConnecting(false);
    }
  }

  async function handleSubmit(ev: FormEvent) {
    ev.preventDefault();
    setServerError(null);
    const payload: Record<string, unknown> =
      posChoice === 'sumup'
        ? { pos_choice: 'sumup', pos_system: posSystem, pos_connected: connected }
        : { pos_choice: posChoice };
    setSubmitting(true);
    try {
      const session = await saveStep(token, 6, payload);
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
    <form onSubmit={handleSubmit} noValidate aria-label="Kassensystem-Verbindung">
      <h2 style={{ fontFamily: 'var(--font-display)', marginBottom: 'var(--space-2)' }}>
        Hast du ein Kassensystem?
      </h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: 'var(--space-5)', fontSize: '.875rem' }}>
        Dann importieren wir Tagesabschlüsse automatisch — optional.
      </p>

      {POS_CHOICES.map(([v, label, desc]) => {
        const checked = posChoice === v;
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
              name="pos_choice"
              value={v}
              checked={checked}
              onChange={() => setPosChoice(v)}
              style={{ marginTop: 4 }}
            />
            <span>
              <strong style={{ display: 'block' }}>{label}</strong>
              <span style={{ fontSize: '.8125rem', color: 'var(--text-muted)' }}>{desc}</span>
            </span>
          </label>
        );
      })}

      {posChoice === 'sumup' && !connected && (
        <>
          <Field id="pos_system" label="SumUp-Variante">
            <select id="pos_system" value={posSystem} onChange={(e) => setPosSystem(e.target.value)}>
              {SUMUP_VARIANTS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <button
            type="button"
            className="secondary"
            disabled={connecting}
            onClick={handleConnect}
            style={{ width: '100%', marginBottom: 'var(--space-2)' }}
          >
            {connecting ? 'Weiterleitung zu SumUp…' : 'Mit SumUp verbinden'}
          </button>
        </>
      )}

      {posChoice === 'sumup' && connected && (
        <div style={{ margin: 'var(--space-3) 0' }}>
          <span className="badge active">✓ SumUp verbunden</span>
        </div>
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
