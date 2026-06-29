/**
 * T067/T084 — Wizard-Schritt 3: Steuerberater-Anbindung (Spec §2.4).
 *
 * Inhalt hängt vom in Schritt 2 gewählten `advisor_system` ab:
 *  - lexware_office → echter API-Key-Eintrag (T084). Lexware hat KEIN OAuth →
 *    der Wirt/die Steuerberaterin trägt den API-Schlüssel ein, das Backend prüft
 *    ihn live gegen Lexware und speichert ihn verschlüsselt. Überspringbar
 *    (Schlüssel kommt oft erst von der Steuerberaterin → später nachreichbar).
 *  - DATEV/Desktop/CSV-Systeme → Info: monatliche DATEV-CSV per Mail.
 *  - unbekannt → Hinweis auf Premium-Setup.
 * Speichert eine Bestätigung in step_data['3'] und rückt vor.
 */
import { useState } from 'react';
import { type StepProps, WizardApiError, connectLexware, saveStep } from '../lib/api';

interface Step3Props extends StepProps {
  /** Aus step_data['2'].advisor_system (von WizardFlow durchgereicht). */
  advisorSystem: string;
}

function content(advisorSystem: string): { title: string; body: string } {
  if (advisorSystem === 'unbekannt') {
    return {
      title: 'Wir klären das mit deinem Steuerberater',
      body: 'Kein Problem — wähle Premium-Setup oder überspringe diesen Schritt. Wir kontaktieren deinen Steuerberater direkt und klären, welches System er nutzt.',
    };
  }
  return {
    title: 'Übergabe per DATEV-CSV',
    body: 'Dein Steuerberater nutzt ein System, das wir per monatlicher DATEV-CSV-Datei (per Mail) bedienen — das kann jedes dieser Programme problemlos importieren. Du musst hier nichts tun.',
  };
}

export function Step3OAuthAccountant({ token, onSaved, advisorSystem }: Step3Props) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const isLexware = advisorSystem === 'lexware_office';

  // Lexware-spezifischer Eingabe-State.
  const [apiToken, setApiToken] = useState('');
  const [displayName, setDisplayName] = useState('');
  // undefined = noch nicht verbunden; string = verbunden (Firmenname, '' wenn unbekannt).
  const [connectedCompany, setConnectedCompany] = useState<string | undefined>(undefined);

  /** Schritt 3 in step_data persistieren + vorrücken. */
  async function advance(lexwareConnected: boolean, company: string | null) {
    setServerError(null);
    setSubmitting(true);
    try {
      const session = await saveStep(token, 3, {
        acknowledged: true,
        advisor_system: advisorSystem,
        lexware_connected: lexwareConnected,
        company_name: company,
      });
      onSaved(session);
    } catch (err) {
      setServerError(
        err instanceof WizardApiError ? err.message : 'Speichern fehlgeschlagen. Bitte erneut versuchen.',
      );
      setSubmitting(false);
    }
  }

  /** Lexware-API-Key live prüfen + speichern. */
  async function handleConnectLexware() {
    if (apiToken.trim().length < 10) {
      setServerError('Bitte gib den vollständigen Lexware-API-Schlüssel ein.');
      return;
    }
    setServerError(null);
    setSubmitting(true);
    try {
      const { company_name } = await connectLexware(
        token,
        apiToken.trim(),
        displayName.trim() || undefined,
      );
      setConnectedCompany(company_name ?? '');
    } catch (err) {
      setServerError(
        err instanceof WizardApiError
          ? err.message
          : 'Der Schlüssel konnte nicht gespeichert werden. Bitte erneut versuchen.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  // ── Lexware: bereits verbunden ────────────────────────────────────────────
  if (isLexware && connectedCompany !== undefined) {
    return (
      <div aria-label="Lexware Office verbunden">
        <h2 style={{ fontFamily: 'var(--font-display)', marginBottom: 'var(--space-2)' }}>
          Lexware Office verbunden
        </h2>
        <p style={{ color: 'var(--text-muted)', marginBottom: 'var(--space-5)', fontSize: '.875rem' }}>
          ✓ Verbunden{connectedCompany ? ` mit ${connectedCompany}` : ''}. Dein Steuerberater-Konto
          ist hinterlegt — Belege werden künftig direkt dorthin gebucht.
        </p>
        <button
          type="button"
          className="primary"
          disabled={submitting}
          onClick={() => advance(true, connectedCompany || null)}
          style={{ width: '100%', height: 48 }}
        >
          {submitting ? 'Einen Moment…' : 'Weiter'}
        </button>
      </div>
    );
  }

  // ── Lexware: Schlüssel eingeben ───────────────────────────────────────────
  if (isLexware) {
    return (
      <div aria-label="Lexware Office verbinden">
        <h2 style={{ fontFamily: 'var(--font-display)', marginBottom: 'var(--space-2)' }}>
          Lexware Office verbinden
        </h2>
        <p style={{ color: 'var(--text-muted)', marginBottom: 'var(--space-4)', fontSize: '.875rem' }}>
          Trag den Lexware-API-Schlüssel ein (in Lexware Office unter Einstellungen → Öffentliche
          API zu erzeugen). Den hat oft deine Steuerberaterin — wenn du ihn noch nicht hast, kannst
          du diesen Schritt überspringen und später nachreichen.
        </p>

        <label style={{ display: 'block', marginBottom: 'var(--space-3)', fontSize: '.875rem' }}>
          API-Schlüssel
          <input
            type="password"
            value={apiToken}
            onChange={(e) => setApiToken(e.target.value)}
            placeholder="z. B. abc123…"
            autoComplete="off"
            style={{ width: '100%', marginTop: 'var(--space-1)' }}
          />
        </label>

        <label style={{ display: 'block', marginBottom: 'var(--space-4)', fontSize: '.875rem' }}>
          Bezeichnung (optional)
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="z. B. Steuerkanzlei Müller"
            style={{ width: '100%', marginTop: 'var(--space-1)' }}
          />
        </label>

        {serverError && (
          <div className="error-box" role="alert" style={{ margin: 'var(--space-4) 0' }}>
            {serverError}
          </div>
        )}

        <button
          type="button"
          className="primary"
          disabled={submitting || apiToken.trim().length < 10}
          onClick={handleConnectLexware}
          style={{ width: '100%', height: 48, marginBottom: 'var(--space-2)' }}
        >
          {submitting ? 'Prüfe Schlüssel…' : 'Speichern & prüfen'}
        </button>
        <button
          type="button"
          className="secondary"
          disabled={submitting}
          onClick={() => advance(false, null)}
          style={{ width: '100%' }}
        >
          Überspringen — später nachreichen
        </button>
      </div>
    );
  }

  // ── Andere Steuerberater-Systeme (DATEV-CSV / unbekannt) ───────────────────
  const c = content(advisorSystem);
  return (
    <div aria-label="Steuerberater-Anbindung">
      <h2 style={{ fontFamily: 'var(--font-display)', marginBottom: 'var(--space-2)' }}>{c.title}</h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: 'var(--space-5)', fontSize: '.875rem' }}>
        {c.body}
      </p>

      {serverError && (
        <div className="error-box" role="alert" style={{ margin: 'var(--space-4) 0' }}>
          {serverError}
        </div>
      )}

      <button
        type="button"
        className="primary"
        disabled={submitting}
        onClick={() => advance(false, null)}
        style={{ width: '100%', height: 48, marginTop: 'var(--space-2)' }}
      >
        {submitting ? 'Einen Moment…' : 'Verstanden — weiter'}
      </button>
    </div>
  );
}
