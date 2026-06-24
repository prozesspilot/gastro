/**
 * T067 — Wizard-Schritt 2: Steuerberater-Setup (Spec §2.3).
 *
 * Auswahl-Formular. Nur `advisor_system` wird beim Abschluss in tenants promotet;
 * die Kontaktfelder bleiben in step_data (für den Mitarbeiter-Review). Client-
 * Validierung gespiegelt vom Backend-Zod (`step2SteuerberaterSchema`).
 */
import { type FormEvent, useState } from 'react';
import { Field } from '../components/Field';
import { saveStep, type StepProps, WizardApiError } from '../lib/api';

const ADVISOR_SYSTEMS: ReadonlyArray<[string, string]> = [
  ['lexware_office', 'Lexware Office (empfohlen)'],
  ['datev_online', 'DATEV Unternehmen Online'],
  ['datev_csv', 'DATEV klassisch (nur CSV)'],
  ['sevdesk', 'sevDesk'],
  ['lexware_desktop', 'Lexware Pro / Desktop'],
  ['stotax', 'Stotax'],
  ['addison', 'Addison'],
  ['unbekannt', 'Anderes / weiß ich nicht'],
];

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

export function Step2Steuerberater({ token, initialData, onSaved }: StepProps) {
  const init = initialData ?? {};
  const [kanzlei, setKanzlei] = useState(str(init.steuerberater_kanzlei));
  const [ansprechpartner, setAnsprechpartner] = useState(str(init.ansprechpartner));
  const [email, setEmail] = useState(str(init.steuerberater_email));
  const [telefon, setTelefon] = useState(str(init.steuerberater_telefon));
  const [advisorSystem, setAdvisorSystem] = useState(
    str(init.advisor_system) || 'lexware_office',
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function validate(): Record<string, string> {
    const e: Record<string, string> = {};
    if (kanzlei.trim().length < 2) e.kanzlei = 'Bitte ausfüllen.';
    if (ansprechpartner.trim().length < 2) e.ansprechpartner = 'Bitte ausfüllen.';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) e.email = 'Gültige E-Mail angeben.';
    return e;
  }

  async function handleSubmit(ev: FormEvent) {
    ev.preventDefault();
    setServerError(null);
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    const payload: Record<string, unknown> = {
      steuerberater_kanzlei: kanzlei.trim(),
      ansprechpartner: ansprechpartner.trim(),
      steuerberater_email: email.trim(),
      advisor_system: advisorSystem,
    };
    if (telefon.trim()) payload.steuerberater_telefon = telefon.trim();

    setSubmitting(true);
    try {
      const session = await saveStep(token, 2, payload);
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
    <form onSubmit={handleSubmit} noValidate aria-label="Steuerberater-Setup">
      <h2 style={{ fontFamily: 'var(--font-display)', marginBottom: 'var(--space-2)' }}>
        Dein Steuerberater
      </h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: 'var(--space-5)', fontSize: '.875rem' }}>
        Damit wir deine Belege monatlich im richtigen Format übergeben.
      </p>

      <Field id="kanzlei" label="Steuerberater-Kanzlei" error={errors.kanzlei}>
        <input id="kanzlei" value={kanzlei} onChange={(e) => setKanzlei(e.target.value)} />
      </Field>

      <Field id="ansprechpartner" label="Ansprechpartner" error={errors.ansprechpartner}>
        <input
          id="ansprechpartner"
          value={ansprechpartner}
          onChange={(e) => setAnsprechpartner(e.target.value)}
        />
      </Field>

      <Field id="stb-email" label="E-Mail Steuerberater" error={errors.email}>
        <input id="stb-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>

      <Field id="stb-telefon" label="Telefon Steuerberater (optional)">
        <input id="stb-telefon" type="tel" value={telefon} onChange={(e) => setTelefon(e.target.value)} />
      </Field>

      <Field
        id="advisor_system"
        label="Welches System nutzt dein Steuerberater?"
        hint="Weißt du es nicht? Wähle 'Anderes / weiß ich nicht' — wir klären das."
      >
        <select
          id="advisor_system"
          value={advisorSystem}
          onChange={(e) => setAdvisorSystem(e.target.value)}
        >
          {ADVISOR_SYSTEMS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </Field>

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
