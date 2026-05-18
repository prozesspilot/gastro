/**
 * BelegeDetailPage — Beleg-Detailansicht (Skelett für T015)
 *
 * Spec: T014 — minimales Skelett, T015 wird OCR-Korrektur + Aktionen ergänzen.
 * Backend: GET /api/v1/belege/:id  → { beleg, download_url, download_expires_at }
 */

import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getBeleg, type Beleg } from '../api/belege';
import { useToast } from '../components/ToastProvider';

// ── Hilfsfunktionen ───────────────────────────────────────────────────────────

function formatAmount(amount: number | null, currency: string): string {
  if (amount === null) return '—';
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: currency || 'EUR' }).format(amount);
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

type StatusLevel = 'idle' | 'progress' | 'done' | 'review' | 'error';

function statusLevel(status: Beleg['status']): StatusLevel {
  switch (status) {
    case 'received':                                        return 'idle';
    case 'extracting':
    case 'categorizing':
    case 'archiving':
    case 'exporting':                                       return 'progress';
    case 'extracted':
    case 'categorized':
    case 'archived':
    case 'exported':
    case 'completed':                                       return 'done';
    case 'requires_review':                                 return 'review';
    case 'error':                                           return 'error';
    default:                                                return 'idle';
  }
}

const LEVEL_COLOR: Record<StatusLevel, string> = {
  idle:     'var(--text-subtle)',
  progress: 'var(--orange)',
  done:     'var(--green)',
  review:   'var(--pink)',
  error:    '#f87171',
};

const STATUS_LABELS: Record<Beleg['status'], string> = {
  received:         'Empfangen',
  extracting:       'Extrahierung läuft',
  extracted:        'Extrahiert',
  categorizing:     'Kategorisierung läuft',
  categorized:      'Kategorisiert',
  archiving:        'Archivierung läuft',
  archived:         'Archiviert',
  exporting:        'Export läuft',
  exported:         'Exportiert',
  completed:        'Abgeschlossen',
  requires_review:  'Prüfung nötig',
  error:            'Fehler',
};

function isPdfMime(mime: string): boolean {
  return mime.includes('pdf');
}

// ── Komponente ────────────────────────────────────────────────────────────────

export default function BelegeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [beleg, setBeleg] = useState<Beleg | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getBeleg(id)
      .then((res) => {
        setBeleg(res.beleg);
        setDownloadUrl(res.download_url);
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : 'Unbekannter Fehler';
        setError(msg);
        toast('error', `Beleg konnte nicht geladen werden: ${msg}`);
      })
      .finally(() => setLoading(false));
  }, [id, toast]);

  // ── Loading ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ padding: '32px 24px', maxWidth: 900, margin: '0 auto' }}>
        <div style={{ height: 24, background: 'var(--card-2)', borderRadius: 6, marginBottom: 32, width: 120, animation: 'skeletonPulse 1.5s ease-in-out infinite' }} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          <div style={{ height: 400, background: 'var(--card-2)', borderRadius: 'var(--radius-lg)', animation: 'skeletonPulse 1.5s ease-in-out infinite' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} style={{ height: 20, background: 'var(--card-2)', borderRadius: 4, animation: 'skeletonPulse 1.5s ease-in-out infinite' }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !beleg) {
    return (
      <div style={{ padding: '32px 24px', maxWidth: 900, margin: '0 auto' }}>
        <button type="button" className="ghost" onClick={() => navigate('/belege')} style={{ marginBottom: 24, fontSize: 13 }}>
          &larr; Zurück
        </button>
        <div className="error-box" role="alert">
          {error ?? 'Beleg nicht gefunden.'}
        </div>
      </div>
    );
  }

  const level = statusLevel(beleg.status);

  return (
    <div style={{ padding: '28px 24px', maxWidth: 900, margin: '0 auto' }}>
      {/* Back */}
      <button
        type="button"
        className="ghost"
        onClick={() => navigate('/belege')}
        style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}
        aria-label="Zurück zur Belegliste"
      >
        &larr; Zurück zur Liste
      </button>

      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 24,
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>
            {beleg.supplier_name ?? 'Beleg'}
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>
            ID: <code style={{ fontFamily: 'monospace', fontSize: 12 }}>{beleg.id}</code>
          </p>
        </div>
        {/* Status-Badge */}
        <span
          style={{
            display: 'inline-block',
            padding: '5px 14px',
            borderRadius: 20,
            fontSize: 13,
            fontWeight: 700,
            background: `${LEVEL_COLOR[level]}22`,
            color: LEVEL_COLOR[level],
            border: `1px solid ${LEVEL_COLOR[level]}55`,
          }}
          data-testid="status-badge"
          aria-label={`Status: ${STATUS_LABELS[beleg.status]}`}
        >
          {STATUS_LABELS[beleg.status]}
        </span>
      </div>

      {/* Grid: Vorschau links, Metadata rechts */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr)',
          gap: 24,
          alignItems: 'start',
        }}
      >
        {/* Vorschau */}
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            overflow: 'hidden',
            minHeight: 300,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          data-testid="preview-container"
        >
          {downloadUrl ? (
            isPdfMime(beleg.file_mime_type) ? (
              <iframe
                src={downloadUrl}
                title={`Beleg ${beleg.id}`}
                style={{ width: '100%', height: 480, border: 'none' }}
                aria-label="PDF-Vorschau"
                data-testid="pdf-preview"
              />
            ) : (
              <img
                src={downloadUrl}
                alt={`Beleg ${beleg.id}`}
                style={{ maxWidth: '100%', maxHeight: 480, objectFit: 'contain', display: 'block' }}
                data-testid="image-preview"
              />
            )
          ) : (
            <div style={{ textAlign: 'center', color: 'var(--text-subtle)', padding: 32 }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📄</div>
              <p style={{ fontSize: 13 }}>Keine Vorschau verfügbar</p>
            </div>
          )}
        </div>

        {/* Metadaten */}
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            padding: '20px 20px',
          }}
        >
          <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16, color: 'var(--text-muted)' }}>
            Beleginformationen
          </h2>
          <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '10px 16px', margin: 0 }}>
            <MetaRow label="Lieferant"    value={beleg.supplier_name ?? '—'} />
            <MetaRow label="Belegdatum"   value={formatDate(beleg.document_date)} />
            <MetaRow label="Betrag"       value={formatAmount(beleg.total_gross, beleg.currency)} />
            <MetaRow label="Kategorie"    value={beleg.category ?? '—'} />
            <MetaRow label="Kanal"        value={beleg.source_channel} />
            <MetaRow label="Empfangen"    value={formatDate(beleg.received_at)} />
            <MetaRow label="MIME-Typ"     value={beleg.file_mime_type || '—'} />
          </dl>

          {/* T015-Hinweis: OCR-Korrektur + Aktionen folgen hier */}
          {/* DECISION: Detail-Aktionen (Kategorie-Override, Freigabe etc.) kommen in T015 */}
          <div
            style={{
              marginTop: 20,
              padding: '12px 14px',
              background: 'var(--card-2)',
              borderRadius: 'var(--radius)',
              fontSize: 12,
              color: 'var(--text-subtle)',
            }}
          >
            Weitere Aktionen (OCR-Korrektur, Kategorie-Override, Freigabe) werden in T015 ergänzt.
          </div>
        </div>
      </div>
    </div>
  );
}

// ── MetaRow ───────────────────────────────────────────────────────────────────

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', alignSelf: 'center' }}>
        {label}
      </dt>
      <dd
        style={{
          fontSize: 13,
          margin: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
        title={value}
      >
        {value}
      </dd>
    </>
  );
}
