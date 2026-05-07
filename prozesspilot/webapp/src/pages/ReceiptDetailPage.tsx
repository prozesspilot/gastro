import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  downloadReceipt,
  getReceipt,
  reprocessReceipt,
  updateReceiptStatus,
} from '../api';
import { apiRequest, unwrap } from '../api/_client';
import StatusBadge from '../components/StatusBadge';
import { useToast } from '../components/ToastProvider';
import { SkeletonBlock } from '../components/Skeleton';
import type { CategorizationMethod, Receipt, ReceiptStatus } from '../types';

type StepState = 'done' | 'active' | 'pending' | 'error';

interface TimelineStep {
  key: string;
  label: string;
  state: StepState;
  timestamp?: string;
  detail?: string;
  errorDetail?: string;
}

export default function ReceiptDetailPage() {
  const { receiptId } = useParams<{ receiptId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showReasoning, setShowReasoning] = useState(false);

  useEffect(() => {
    if (!receiptId) return;
    setLoading(true);
    setError(null);
    getReceipt(receiptId)
      .then(setReceipt)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [receiptId]);

  if (loading) return <SkeletonBlock height={400} />;
  if (error)   return <div className="error-box">{error}</div>;
  if (!receipt) return <div className="error-box">Beleg nicht gefunden.</div>;

  const ed = receipt.extracted_data;
  const cat = receipt.categorization;
  const customerLink = `/tenants/${receipt.tenant_id}/customers/${receipt.customer_id}/receipts`;

  async function action(name: string, fn: () => Promise<Receipt>) {
    setBusy(name);
    try {
      const updated = await fn();
      setReceipt(updated);
      toast('success', `${name} erfolgreich`);
    } catch (e) {
      toast('error', `${name} fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  }

  async function pushToLexoffice() {
    if (!receipt) return;
    setBusy('Lexoffice Export');
    try {
      // The backend push handler returns { receipt, receipt_patch, ... }
      // We reload the receipt from the API to get the updated webapp model
      await unwrap(
        await apiRequest(`/receipts/${receipt.id}/exports/lexoffice`, {
          method: 'POST',
          body: { customer_profile: { customer_id: receipt.customer_id } },
        }),
      );
      // Reload the receipt to get updated export status
      const updated = await getReceipt(receipt.id);
      setReceipt(updated);
      toast('success', 'Lexoffice-Export erfolgreich');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('INVALID_STATUS') || msg.includes('requires_review')) {
        toast('error', 'Export fehlgeschlagen: Beleg muss zuerst kategorisiert/archiviert werden.');
      } else {
        toast('error', `Lexoffice-Export fehlgeschlagen: ${msg}`);
      }
    } finally {
      setBusy(null);
    }
  }

  async function downloadArchive() {
    setBusy('Download');
    try {
      const blob = await downloadReceipt(receipt!.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = receipt!.file_name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast('error', `Download fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  }

  const canReprocess = receipt.status === 'error' || receipt.status === 'requires_review';
  // Download möglich sobald eine Datei hochgeladen wurde (storage_key vorhanden)
  const canDownload = !!receipt.original_path;
  const canMarkReview = receipt.status !== 'requires_review' && receipt.status !== 'error';

  const timeline = buildTimeline(receipt);

  return (
    <div>
      {/* requires_review Banner */}
      {receipt.status === 'requires_review' && (
        <div
          style={{
            background: 'rgba(248, 113, 113, 0.08)',
            border: '1px solid rgba(248, 113, 113, 0.4)',
            borderRadius: 'var(--radius-lg)',
            padding: '14px 18px',
            marginBottom: 20,
            display: 'flex',
            alignItems: 'flex-start',
            gap: 12,
          }}
        >
          <span style={{ fontSize: 22, color: '#f87171' }}>⚠</span>
          <div>
            <div style={{ fontWeight: 700, color: '#fca5a5', marginBottom: 4 }}>
              Manuelle Überprüfung erforderlich
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              {receipt.requires_review_reason ??
                'Konfidenz unterhalb des Schwellenwerts oder Validierungsfehler. Bitte Felder kontrollieren und erneut verarbeiten.'}
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="page-header" style={{ alignItems: 'center' }}>
        <div>
          <button
            type="button"
            className="ghost"
            onClick={() => navigate(customerLink)}
            style={{ marginBottom: 12 }}
          >
            ← Zurück zu Belegen
          </button>
          <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.5px', marginBottom: 6, wordBreak: 'break-word' }}>
            {receipt.file_name}
          </h1>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <StatusBadge status={receipt.status} />
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Hochgeladen am {fmtDateTime(receipt.created_at)}
            </span>
            <span className="badge info" style={{ fontSize: 11, fontFamily: 'monospace' }}>
              {receipt.file_type.toUpperCase()} · {fmtBytes(receipt.file_size)}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {canMarkReview && (
            <button
              className="secondary"
              disabled={busy !== null}
              onClick={() => action('Zur Überprüfung markieren', () => updateReceiptStatus(receipt.id, 'requires_review'))}
            >
              {busy === 'Zur Überprüfung markieren' ? <span className="spinner" /> : '⚠'} Zur Überprüfung markieren
            </button>
          )}
          {canReprocess && (
            <button
              className="secondary"
              disabled={busy !== null}
              onClick={() => action('Erneut verarbeiten', () => reprocessReceipt(receipt.id))}
            >
              {busy === 'Erneut verarbeiten' ? <span className="spinner" /> : '↻'} Erneut verarbeiten
            </button>
          )}
          {canDownload && (
            <button
              className="primary"
              disabled={busy !== null}
              onClick={downloadArchive}
            >
              {busy === 'Download' ? <span className="spinner" /> : '📄'} Archiv herunterladen
            </button>
          )}
        </div>
      </div>

      {/* Status-Timeline */}
      <div className="card" style={{ padding: 24, marginBottom: 20 }}>
        <div className="section-header">
          <span className="section-title">Status-Verlauf</span>
        </div>
        <div className="status-timeline">
          {timeline.map((step) => (
            <div key={step.key} className={`status-timeline-step ${step.state}`}>
              <div className="status-timeline-icon">
                {step.state === 'done'    && '✓'}
                {step.state === 'active'  && <span className="spinner" />}
                {step.state === 'pending' && '○'}
                {step.state === 'error'   && '✕'}
              </div>
              <div className="status-timeline-content">
                <div className="status-timeline-label">{step.label}</div>
                {step.detail && <div className="status-timeline-detail">{step.detail}</div>}
                {step.errorDetail && <div className="status-timeline-error">{step.errorDetail}</div>}
              </div>
              <div className="status-timeline-time">
                {step.timestamp ? fmtDateTime(step.timestamp) : ''}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Zwei-Spalten: Extraction & Categorization */}
      <div className="detail-grid-2">
        {/* Extracted Data */}
        {ed && (
          <div className="detail-card">
            <div className="detail-card-title">Extrahierte Daten</div>
            <Row label="Lieferant"        value={ed.vendor_name} />
            <Row label="Adresse"          value={ed.vendor_address} />
            <Row label="Rechnungs-Nr."    value={ed.invoice_number} mono />
            <Row label="Datum"            value={fmtDate(ed.invoice_date)} />
            <Row label="Brutto-Betrag"
                 value={ed.total_amount !== undefined
                   ? ed.total_amount.toLocaleString('de-DE', { style: 'currency', currency: ed.currency ?? 'EUR' })
                   : undefined} />
            <Row label="MwSt-Betrag"
                 value={ed.tax_amount !== undefined
                   ? ed.tax_amount.toLocaleString('de-DE', { style: 'currency', currency: ed.currency ?? 'EUR' })
                   : undefined} />
            <Row label="MwSt-Satz"
                 value={ed.tax_rate !== undefined ? `${(ed.tax_rate * 100).toFixed(0)}%` : undefined} />
            <Row label="Zahlungsart"      value={ed.payment_method} />

            <div style={{ marginTop: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                <span style={{ color: 'var(--text-muted)' }}>OCR-Konfidenz</span>
                <span style={{ color: 'var(--text)', fontWeight: 600 }}>
                  {Math.round(ed.confidence * 100)}%
                </span>
              </div>
              <ConfidenceBar confidence={ed.confidence} />
            </div>

            {ed.line_items && ed.line_items.length > 0 && (
              <details style={{ marginTop: 16 }}>
                <summary style={{ cursor: 'pointer', fontSize: 12, color: 'var(--text-muted)' }}>
                  Einzelpositionen ({ed.line_items.length})
                </summary>
                <table style={{ marginTop: 8, fontSize: 12 }}>
                  <thead>
                    <tr><th>Beschreibung</th><th style={{ textAlign: 'right' }}>Menge</th><th style={{ textAlign: 'right' }}>Betrag</th></tr>
                  </thead>
                  <tbody>
                    {ed.line_items.map((li, i) => (
                      <tr key={i}>
                        <td>{li.description}</td>
                        <td style={{ textAlign: 'right' }}>{li.quantity ?? '—'}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>
                          {li.amount.toLocaleString('de-DE', { style: 'currency', currency: ed.currency ?? 'EUR' })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            )}
          </div>
        )}

        {/* Categorization */}
        {cat ? (
          <div className="detail-card">
            <div className="detail-card-title">Kategorisierung</div>
            <Row label="Kategorie" value={cat.category_name} />
            <Row label="SKR03"     value={cat.skr03_konto} mono />
            <Row label="SKR04"     value={cat.skr04_konto} mono />
            <div className="detail-row">
              <span className="label">Methode</span>
              <span className="value">{methodBadge(cat.method)}</span>
            </div>

            <div style={{ marginTop: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                <span style={{ color: 'var(--text-muted)' }}>Konfidenz</span>
                <span style={{ color: 'var(--text)', fontWeight: 600 }}>
                  {Math.round(cat.confidence * 100)}%
                </span>
              </div>
              <ConfidenceBar confidence={cat.confidence} />
            </div>

            {cat.method === 'ai' && cat.ai_reasoning && (
              <div style={{ marginTop: 16 }}>
                <button
                  type="button"
                  className="ghost"
                  style={{ padding: '4px 8px', fontSize: 12 }}
                  onClick={() => setShowReasoning((v) => !v)}
                >
                  {showReasoning ? '▾' : '▸'} KI-Begründung anzeigen
                </button>
                {showReasoning && (
                  <div className="rationale-box" style={{ marginTop: 8 }}>
                    {cat.ai_reasoning}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          ed && (
            <div className="detail-card">
              <div className="detail-card-title">Kategorisierung</div>
              <Empty text="Noch nicht kategorisiert" />
            </div>
          )
        )}
      </div>

      {/* Export-Sektion — immer anzeigen wenn Beleg archiviert/kategorisiert oder Export vorhanden */}
      {(receipt.lexoffice_export || receipt.datev_export ||
        receipt.status === 'archived' || receipt.status === 'categorized' || receipt.status === 'exported') && (
        <div className="card" style={{ padding: 24 }}>
          <div className="section-header">
            <span className="section-title">Exporte</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* Lexoffice — entweder Export-Badge oder Push-Button */}
            {receipt.lexoffice_export ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: 'var(--radius-sm)' }}>
                <span style={{ fontSize: 18, color: '#34d399' }}>&#10003;</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>Lexoffice</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    Voucher {receipt.lexoffice_export.voucher_id} · {fmtDateTime(receipt.lexoffice_export.exported_at)}
                  </div>
                </div>
                <span className="badge active">{receipt.lexoffice_export.status}</span>
              </div>
            ) : (receipt.status === 'archived' || receipt.status === 'categorized') ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: 'var(--radius-sm)' }}>
                <span style={{ fontSize: 18, color: 'var(--text-subtle)' }}>&#9675;</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>Lexoffice</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Noch nicht exportiert</div>
                </div>
                <button
                  className="secondary"
                  style={{ fontSize: 12, padding: '4px 12px' }}
                  disabled={busy !== null}
                  onClick={pushToLexoffice}
                >
                  {busy === 'Lexoffice Export' ? <span className="spinner" /> : null} Nach Lexoffice exportieren
                </button>
              </div>
            ) : null}

            {receipt.datev_export && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: 'var(--radius-sm)' }}>
                <span style={{ fontSize: 18 }}>&#9635;</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>DATEV</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                    {receipt.datev_export.file_path}
                  </div>
                </div>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {fmtDateTime(receipt.datev_export.exported_at)}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-Components ────────────────────────────────────────────────────────────

function Row({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  if (value === undefined || value === null || value === '') {
    return (
      <div className="detail-row">
        <span className="label">{label}</span>
        <span className="value" style={{ color: 'var(--text-subtle)' }}>—</span>
      </div>
    );
  }
  return (
    <div className="detail-row">
      <span className="label">{label}</span>
      <span className="value" style={mono ? { fontFamily: 'monospace', fontSize: 12 } : undefined}>{value}</span>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div style={{
      padding: '16px 12px',
      fontSize: 12,
      color: 'var(--text-subtle)',
      background: 'rgba(255,255,255,0.02)',
      borderRadius: 'var(--radius-sm)',
      textAlign: 'center',
    }}>
      {text}
    </div>
  );
}

function ConfidenceBar({ confidence }: { confidence: number }) {
  const pct = Math.max(0, Math.min(100, confidence * 100));
  const klass = pct > 85 ? 'green' : pct > 60 ? 'yellow' : 'red';
  return (
    <div className="confidence-bar">
      <div className={`confidence-bar-fill ${klass}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function methodBadge(method: CategorizationMethod): JSX.Element {
  const map: Record<CategorizationMethod, { label: string; klass: string }> = {
    override:    { label: 'Override',  klass: 'badge purple' },
    master_data: { label: 'Stammdaten', klass: 'badge info' },
    ai:          { label: 'KI',        klass: 'badge active' },
  };
  const spec = map[method];
  return <span className={spec.klass}>{spec.label}</span>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string | undefined): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmtDateTime(iso: string | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function fmtBytes(b: number): string {
  if (!b) return '—';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function buildTimeline(r: Receipt): TimelineStep[] {
  const status = r.status;
  const isError = status === 'error';

  const steps: TimelineStep[] = [];

  // 1. Empfangen
  steps.push({
    key: 'received',
    label: 'Empfangen',
    state: 'done',
    timestamp: r.created_at,
  });

  // 2. OCR Extraktion
  const extractionDone = !!r.extracted_data || stateAfter(status, 'extracted');
  const extractionActive = status === 'extracting';
  steps.push({
    key: 'extraction',
    label: 'OCR Extraktion',
    state: extractionActive ? 'active' : extractionDone ? 'done' : isError ? 'error' : 'pending',
    timestamp: extractionDone ? (r.processing_started_at ?? r.updated_at) : undefined,
    detail: r.extracted_data ? `Confidence ${Math.round(r.extracted_data.confidence * 100)}%` : undefined,
  });

  // 3. Kategorisierung
  const categorizationDone = !!r.categorization || stateAfter(status, 'categorized');
  const categorizationActive = status === 'categorizing';
  steps.push({
    key: 'categorization',
    label: 'Kategorisierung',
    state: categorizationActive ? 'active' : categorizationDone ? 'done' : isError ? 'pending' : 'pending',
    timestamp: categorizationDone ? r.updated_at : undefined,
    detail: r.categorization
      ? `${r.categorization.category_name}${r.categorization.skr03_konto ? ` · Konto ${r.categorization.skr03_konto}` : ''}`
      : undefined,
  });

  // 4. Archivierung
  const archiveDone = !!r.archive_path || stateAfter(status, 'archived');
  const archiveActive = status === 'archiving';
  steps.push({
    key: 'archive',
    label: 'Archivierung',
    state: archiveActive ? 'active' : archiveDone ? 'done' : 'pending',
    timestamp: archiveDone ? r.updated_at : undefined,
  });

  // 5. Export
  const exportDone = !!r.lexoffice_export || !!r.datev_export || status === 'completed' || status === 'exported';
  const exportActive = status === 'exporting';
  steps.push({
    key: 'export',
    label: 'Export',
    state: exportActive ? 'active' : exportDone ? 'done' : 'pending',
    timestamp: exportDone ? (r.lexoffice_export?.exported_at ?? r.processing_completed_at ?? r.updated_at) : undefined,
    detail: r.lexoffice_export ? `Lexoffice (${r.lexoffice_export.voucher_id})` : undefined,
  });

  // Fehler-Status: markiere ersten nicht-erledigten Schritt als error
  if (isError) {
    const idx = steps.findIndex((s) => s.state === 'pending' || s.state === 'active');
    if (idx >= 0) {
      steps[idx].state = 'error';
      steps[idx].errorDetail = r.requires_review_reason ?? 'Verarbeitung fehlgeschlagen';
    }
  }

  return steps;
}

const ORDER: ReceiptStatus[] = [
  'received', 'extracting', 'extracted', 'categorizing', 'categorized',
  'archiving', 'archived', 'exporting', 'exported', 'completed',
];

function stateAfter(current: ReceiptStatus, target: ReceiptStatus): boolean {
  if (current === 'requires_review' || current === 'error') return false;
  return ORDER.indexOf(current) >= ORDER.indexOf(target);
}
