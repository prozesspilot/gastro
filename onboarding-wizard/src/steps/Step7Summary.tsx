/**
 * T067 — Wizard-Schritt 7: Zusammenfassung + Abschluss (Spec §2.8).
 *
 * GF-Entscheidung: KEIN Live-Test-Beleg (kein Eingangskanal/SSE) — reiner
 * Abschluss-Screen. Zeigt die gesammelten Angaben und schließt via completeWizard()
 * ab (promotet step_data 2/4/5/6 in tenants, Status → completed).
 */
import { type ReactNode, useState } from 'react';
import { completeWizard, type StepProps, WizardApiError } from '../lib/api';

interface Step7Props extends StepProps {
  /** Vollständige session.step_data (von WizardFlow durchgereicht) für die Übersicht. */
  stepData: Record<string, unknown>;
}

function obj(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}
function str(v: unknown): string {
  return typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '';
}

const ADVISOR_LABELS: Record<string, string> = {
  lexware_office: 'Lexware Office',
  datev_online: 'DATEV Unternehmen Online',
  datev_csv: 'DATEV klassisch',
  sevdesk: 'sevDesk',
  lexware_desktop: 'Lexware Desktop',
  stotax: 'Stotax',
  addison: 'Addison',
  unbekannt: 'noch offen',
};
const ARCHIVE_LABELS: Record<string, string> = {
  google_drive: 'Google Drive',
  dropbox: 'Dropbox',
  pp_internal: 'ProzessPilot-Archiv',
};
const CHANNEL_LABELS: Record<string, string> = { whatsapp: 'WhatsApp', email: 'E-Mail' };

export function Step7Summary({ token, onSaved, stepData }: Step7Props) {
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const s1 = obj(stepData['1']);
  const s2 = obj(stepData['2']);
  const s4 = obj(stepData['4']);
  const s5 = obj(stepData['5']);
  const s6 = obj(stepData['6']);

  const channels = Array.isArray(s4.input_channels)
    ? (s4.input_channels as unknown[])
        .map((c) => CHANNEL_LABELS[str(c)] ?? str(c))
        .filter(Boolean)
        .join(' + ')
    : '—';
  const posValue =
    s6.pos_choice === 'sumup'
      ? `SumUp${s6.pos_connected === true ? ' (verbunden)' : ''}`
      : s6.pos_choice === 'classic'
        ? 'Klassische Kasse'
        : s6.pos_choice === 'other_cloud'
          ? 'Anderes System'
          : '—';

  async function handleComplete() {
    setServerError(null);
    setSubmitting(true);
    try {
      const session = await completeWizard(token);
      onSaved(session);
    } catch (err) {
      setServerError(
        err instanceof WizardApiError ? err.message : 'Abschluss fehlgeschlagen. Bitte erneut versuchen.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div aria-label="Zusammenfassung">
      <h2 style={{ fontFamily: 'var(--font-display)', marginBottom: 'var(--space-2)' }}>
        Fast geschafft!
      </h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: 'var(--space-5)', fontSize: '.875rem' }}>
        Prüf kurz deine Angaben — dann schließen wir dein Setup ab.
      </p>

      <SummaryRow label="Betrieb" value={str(s1.firmenname) || '—'} />
      <SummaryRow
        label="Steuerberater"
        value={
          [str(s2.steuerberater_kanzlei), ADVISOR_LABELS[str(s2.advisor_system)] ?? str(s2.advisor_system)]
            .filter(Boolean)
            .join(' · ') || '—'
        }
      />
      <SummaryRow label="Eingangskanal" value={channels} />
      <SummaryRow label="Archiv" value={ARCHIVE_LABELS[str(s5.archive_provider)] ?? '—'} />
      <SummaryRow label="Kasse" value={posValue} />

      {serverError && (
        <div className="error-box" role="alert" style={{ margin: 'var(--space-4) 0' }}>
          {serverError}
        </div>
      )}

      <button
        type="button"
        className="primary"
        disabled={submitting}
        onClick={handleComplete}
        style={{ width: '100%', height: 48, marginTop: 'var(--space-5)' }}
      >
        {submitting ? 'Wird abgeschlossen…' : 'Setup abschließen'}
      </button>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: 'var(--space-3)',
        padding: 'var(--space-3) 0',
        borderBottom: '1px solid var(--border-subtle)',
      }}
    >
      <span style={{ color: 'var(--text-muted)', fontSize: '.8125rem' }}>{label}</span>
      <strong style={{ fontSize: '.8125rem', textAlign: 'right' }}>{value}</strong>
    </div>
  );
}
