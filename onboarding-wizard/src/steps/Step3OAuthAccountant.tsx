/**
 * T067 — Wizard-Schritt 3: OAuth Steuerberater-Tool (Spec §2.4).
 *
 * KEIN echtes Formular. Inhalt hängt vom in Schritt 2 gewählten `advisor_system` ab:
 *  - lexware_office → echte Direkt-Anbindung (OAuth) ist als Modul noch nicht gebaut →
 *    klar markierter Platzhalter ("kommt bald", wird beim Setup-Review übernommen).
 *  - DATEV/Desktop/CSV-Systeme → Info: monatliche DATEV-CSV per Mail.
 *  - unbekannt → Hinweis auf Premium-Setup.
 * Speichert nur eine Bestätigung in step_data['3'] (nicht promotet) und rückt vor.
 */
import { useState } from 'react';
import { saveStep, type StepProps, WizardApiError } from '../lib/api';

interface Step3Props extends StepProps {
  /** Aus step_data['2'].advisor_system (von WizardFlow durchgereicht). */
  advisorSystem: string;
}

function content(advisorSystem: string): { title: string; body: string; placeholder: boolean } {
  if (advisorSystem === 'lexware_office') {
    return {
      title: 'Lexware Office verbinden',
      body: 'Wir verbinden uns direkt mit dem Lexware-Konto deines Steuerberaters — das spart ihm Zeit und dir Geld. Die Direkt-Anbindung kommt bald; bis dahin übernehmen wir sie beim Setup-Review für dich.',
      placeholder: true,
    };
  }
  if (advisorSystem === 'unbekannt') {
    return {
      title: 'Wir klären das mit deinem Steuerberater',
      body: 'Kein Problem — wähle Premium-Setup oder überspringe diesen Schritt. Wir kontaktieren deinen Steuerberater direkt und klären, welches System er nutzt.',
      placeholder: false,
    };
  }
  return {
    title: 'Übergabe per DATEV-CSV',
    body: 'Dein Steuerberater nutzt ein System, das wir per monatlicher DATEV-CSV-Datei (per Mail) bedienen — das kann jedes dieser Programme problemlos importieren. Du musst hier nichts tun.',
    placeholder: false,
  };
}

export function Step3OAuthAccountant({ token, onSaved, advisorSystem }: Step3Props) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const c = content(advisorSystem);

  async function handleContinue() {
    setServerError(null);
    setSubmitting(true);
    try {
      const session = await saveStep(token, 3, {
        acknowledged: true,
        advisor_system: advisorSystem,
        oauth_status: 'placeholder',
      });
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
    <div aria-label="OAuth Steuerberater-Tool">
      <h2 style={{ fontFamily: 'var(--font-display)', marginBottom: 'var(--space-2)' }}>{c.title}</h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: 'var(--space-5)', fontSize: '.875rem' }}>
        {c.body}
      </p>

      {c.placeholder && (
        <button
          type="button"
          className="secondary"
          disabled
          style={{ width: '100%', marginBottom: 'var(--space-4)' }}
        >
          Mit Lexware Office verbinden — kommt bald
        </button>
      )}

      {serverError && (
        <div className="error-box" role="alert" style={{ margin: 'var(--space-4) 0' }}>
          {serverError}
        </div>
      )}

      <button
        type="button"
        className="primary"
        disabled={submitting}
        onClick={handleContinue}
        style={{ width: '100%', height: 48, marginTop: 'var(--space-2)' }}
      >
        {submitting ? 'Einen Moment…' : 'Verstanden — weiter'}
      </button>
    </div>
  );
}
