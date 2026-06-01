/**
 * T016 — Onboarding-Wizard Done-Page
 *
 * Spec: Onboarding_Wizard.md §1.3 (Übergangs-Zustand: "Wizard abgeschlossen → Auto-Task")
 *
 * Was passiert nach Abschluss:
 * - Backend-Task für PP-Mitarbeiter wird ausgelöst (Freischaltung)
 * - Wirt sieht Bestätigungs-Screen
 * - Weiterleitung zu WhatsApp (wenn Kanal = WhatsApp) oder sonstiger Instruction
 */

import type { WizardState } from './wizard.types';

interface DonePageProps {
  wizardState: WizardState;
  onRestart?: () => void;
}

export default function DonePage({ wizardState, onRestart }: DonePageProps) {
  const firmenname = wizardState.step2?.firmenname ?? 'dein Betrieb';
  const sumupConnected = wizardState.step3?.sumupStatus === 'connected';

  return (
    <div style={{ width: '100%', textAlign: 'center' }} aria-label="Setup abgeschlossen">
      {/* Success Icon */}
      <div style={{
        width: '80px',
        height: '80px',
        borderRadius: '50%',
        background: 'rgba(45,212,191,0.15)',
        border: '2px solid var(--teal)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '2.5rem',
        margin: '0 auto 1.5rem',
      }}>
        ✓
      </div>

      <h1 style={{
        fontSize: '1.75rem',
        fontWeight: 700,
        marginBottom: '0.75rem',
        background: 'var(--grad-brand)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
      }}>
        Geschafft!
      </h1>

      <p style={{ color: 'var(--text-muted)', fontSize: '1rem', lineHeight: 1.7, marginBottom: '2rem' }}>
        Wir haben alles für <strong style={{ color: 'var(--text)' }}>{firmenname}</strong> eingerichtet.
        <br />
        Unser Team prüft dein Setup und schaltet dich innerhalb von <strong style={{ color: 'var(--text)' }}>24 Stunden</strong> frei.
      </p>

      {/* Zusammenfassung */}
      <div style={{
        background: 'var(--card-2)',
        border: '1px solid var(--border)',
        borderRadius: '0.75rem',
        padding: '1.25rem',
        marginBottom: '2rem',
        textAlign: 'left',
      }}>
        <h2 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Was als nächstes passiert
        </h2>
        <ol style={{ paddingLeft: '1.25rem', lineHeight: 2, fontSize: '0.9rem', color: 'var(--text-muted)' }}>
          <li>Unser Team prüft dein Setup (bis zu 24h)</li>
          <li>Du bekommst eine Bestätigungs-E-Mail</li>
          <li>Ab dann kannst du Belege per WhatsApp oder E-Mail schicken</li>
          {sumupConnected && <li>SumUp-Tagesabschlüsse werden ab morgen automatisch importiert</li>}
        </ol>
      </div>

      {/* CTA: WhatsApp-Nummer speichern */}
      <div style={{
        padding: '1.25rem',
        background: 'rgba(45,212,191,0.07)',
        border: '1px solid rgba(45,212,191,0.2)',
        borderRadius: '0.75rem',
        marginBottom: '2rem',
      }}>
        <p style={{ fontSize: '0.9rem', color: 'var(--text)', lineHeight: 1.6 }}>
          <strong>Tipp:</strong> Speichere unsere WhatsApp-Nummer als "ProzessPilot" im Handy.
          Sie wird dir per E-Mail zugeschickt.
        </p>
      </div>

      {/* Dev-Helper: Neu starten */}
      {onRestart && (
        <button
          type="button"
          onClick={onRestart}
          style={{
            padding: '0.5rem 1rem',
            background: 'transparent',
            border: '1px solid var(--border)',
            borderRadius: '0.375rem',
            color: 'var(--text-subtle)',
            fontSize: '0.75rem',
            cursor: 'pointer',
          }}
        >
          [Dev] Wizard neu starten
        </button>
      )}
    </div>
  );
}
