/**
 * BelegeListPage — Übersicht aller Belege mit Filter + Pagination
 *
 * Spec: T014 Mitarbeiter-Webapp Beleg-Upload + Listen-View
 * Backend: GET /api/v1/belege?page=1&page_size=50&status=received
 */

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getActiveTenantId } from '../api';
import { listBelege, type Beleg, type BelegStatus } from '../api/belege';
import NoTenantHint from '../components/NoTenantHint';
import { SkeletonTable } from '../components/Skeleton';
import { useToast } from '../components/ToastProvider';

// ── Konstanten ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 50;

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'Alle Status' },
  { value: 'received', label: 'Empfangen' },
  { value: 'extracting', label: 'Extrahiert (läuft)' },
  { value: 'extracted', label: 'Extrahiert' },
  { value: 'categorizing', label: 'Kategorisierung (läuft)' },
  { value: 'categorized', label: 'Kategorisiert' },
  { value: 'archiving', label: 'Archivierung (läuft)' },
  { value: 'archived', label: 'Archiviert' },
  { value: 'exporting', label: 'Export (läuft)' },
  { value: 'exported', label: 'Exportiert' },
  { value: 'completed', label: 'Abgeschlossen' },
  { value: 'requires_review', label: 'Prüfung nötig' },
  { value: 'error', label: 'Fehler' },
];

// ── Status-Farben + Labels ────────────────────────────────────────────────────

function statusColor(status: BelegStatus): string {
  switch (status) {
    case 'received':                                return 'var(--text-subtle)';
    case 'extracting':
    case 'categorizing':
    case 'archiving':
    case 'exporting':                               return 'var(--orange)';
    case 'extracted':
    case 'categorized':
    case 'archived':
    case 'exported':
    case 'completed':                               return 'var(--green)';
    case 'requires_review':                         return 'var(--pink)';
    case 'error':                                   return '#f87171'; // red-400
    default:                                        return 'var(--text-muted)';
  }
}

function statusLabel(status: BelegStatus): string {
  const found = STATUS_OPTIONS.find((o) => o.value === status);
  return found?.label ?? status;
}

// ── Hilfsfunktionen ───────────────────────────────────────────────────────────

function formatAmount(amount: number | null, currency: string): string {
  if (amount === null) return '—';
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: currency || 'EUR' }).format(
    amount,
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function sourceBadge(channel: string): string {
  switch (channel) {
    case 'manual_upload': return 'Upload';
    case 'whatsapp':      return 'WhatsApp';
    case 'email':         return 'E-Mail';
    case 'web_chat':      return 'Chat';
    case 'api':           return 'API';
    case 'sumup':         return 'SumUp';
    default:              return channel;
  }
}

// ── Komponente ────────────────────────────────────────────────────────────────

export default function BelegeListPage() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [belege, setBelege] = useState<Beleg[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [noTenant, setNoTenant] = useState(false);

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const [statusFilter, setStatusFilter] = useState<string>('all');

  // ── Daten laden ───────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    // Ohne aktiven Mandanten kein /belege-Call (sonst 400) — sauberer Hinweis.
    if (!getActiveTenantId()) {
      setNoTenant(true);
      setLoading(false);
      return;
    }
    setNoTenant(false);
    setLoading(true);
    setError(null);
    try {
      const res = await listBelege({
        page,
        pageSize: PAGE_SIZE,
        status: statusFilter === 'all' ? undefined : statusFilter,
      });
      setBelege(res.belege);
      setTotalPages(res.pagination.total_pages);
      setTotal(res.pagination.total);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unbekannter Fehler';
      setError(msg);
      toast('error', `Belege konnten nicht geladen werden: ${msg}`);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  // Filter-Änderung → zurück auf Seite 1
  function handleStatusChange(value: string) {
    setStatusFilter(value);
    setPage(1);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: '28px 24px', maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 24,
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Belege</h1>
          {!loading && total > 0 && (
            <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>
              {total} Beleg{total !== 1 ? 'e' : ''} insgesamt
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => navigate('/belege/upload')}
          style={{
            padding: '9px 18px',
            background: 'var(--grad-green)',
            border: 'none',
            borderRadius: 'var(--radius)',
            color: '#fff',
            fontWeight: 700,
            fontSize: 14,
            cursor: 'pointer',
          }}
          aria-label="Beleg hochladen"
        >
          + Beleg hochladen
        </button>
      </div>

      {/* Filter-Bar */}
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: '12px 16px',
          marginBottom: 16,
          display: 'flex',
          gap: 12,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <label htmlFor="status-filter" style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)' }}>
          Status:
        </label>
        <select
          id="status-filter"
          value={statusFilter}
          onChange={(e) => handleStatusChange(e.target.value)}
          style={{
            background: 'var(--card-2)',
            border: '1px solid var(--border-bright)',
            borderRadius: 6,
            color: 'var(--text)',
            padding: '5px 10px',
            fontSize: 13,
            cursor: 'pointer',
          }}
          aria-label="Status-Filter"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {/* Inhalt */}
      {noTenant ? (
        <NoTenantHint />
      ) : loading ? (
        <SkeletonTable rows={10} cols={5} />
      ) : error ? (
        <div
          className="error-box"
          role="alert"
          style={{ padding: '20px 24px' }}
        >
          {error} —{' '}
          <button type="button" className="ghost" onClick={() => void load()} style={{ fontSize: 13 }}>
            Erneut versuchen
          </button>
        </div>
      ) : belege.length === 0 ? (
        <EmptyState onUpload={() => navigate('/belege/upload')} statusFilter={statusFilter} />
      ) : (
        <>
          <BelegeTable belege={belege} onRowClick={(id) => navigate(`/belege/${id}`)} />
          {totalPages > 1 && (
            <Pagination page={page} totalPages={totalPages} onChange={setPage} />
          )}
        </>
      )}
    </div>
  );
}

// ── Tabelle ───────────────────────────────────────────────────────────────────

function BelegeTable({
  belege,
  onRowClick,
}: {
  belege: Beleg[];
  onRowClick: (id: string) => void;
}) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        overflow: 'hidden',
      }}
    >
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            {['Quelle', 'Hochgeladen', 'Status', 'Lieferant', 'Betrag', 'Kategorie'].map((h) => (
              <th
                key={h}
                style={{
                  padding: '10px 14px',
                  textAlign: 'left',
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--text-muted)',
                  whiteSpace: 'nowrap',
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {belege.map((b) => (
            <tr
              key={b.id}
              onClick={() => onRowClick(b.id)}
              style={{
                borderBottom: '1px solid var(--border)',
                cursor: 'pointer',
                transition: 'background 0.1s',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLTableRowElement).style.background = 'var(--pp-gray-50)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLTableRowElement).style.background = '';
              }}
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter') onRowClick(b.id); }}
              role="button"
              aria-label={`Beleg ${b.id} öffnen`}
              data-testid="beleg-row"
            >
              {/* Quelle */}
              <td style={{ padding: '12px 14px' }}>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    background: 'var(--card-2)',
                    borderRadius: 4,
                    padding: '2px 7px',
                    color: 'var(--text-muted)',
                  }}
                >
                  {sourceBadge(b.source_channel)}
                </span>
              </td>

              {/* Hochgeladen */}
              <td style={{ padding: '12px 14px', fontSize: 13, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                {formatDate(b.received_at)}
              </td>

              {/* Status */}
              <td style={{ padding: '12px 14px' }}>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: statusColor(b.status),
                  }}
                >
                  {statusLabel(b.status)}
                </span>
              </td>

              {/* Lieferant */}
              <td
                style={{
                  padding: '12px 14px',
                  fontSize: 13,
                  maxWidth: 200,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  color: b.supplier_name ? 'var(--text)' : 'var(--text-subtle)',
                }}
                title={b.supplier_name ?? undefined}
              >
                {b.supplier_name ?? '—'}
              </td>

              {/* Betrag */}
              <td style={{ padding: '12px 14px', fontSize: 13, whiteSpace: 'nowrap' }}>
                {formatAmount(b.total_gross, b.currency)}
              </td>

              {/* Kategorie */}
              <td
                style={{
                  padding: '12px 14px',
                  fontSize: 12,
                  color: b.category ? 'var(--blue)' : 'var(--text-subtle)',
                }}
              >
                {b.category ?? '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Empty-State ───────────────────────────────────────────────────────────────

function EmptyState({ onUpload, statusFilter }: { onUpload: () => void; statusFilter: string }) {
  const isFiltered = statusFilter !== 'all';
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        padding: '64px 32px',
        textAlign: 'center',
      }}
      data-testid="empty-state"
    >
      <div style={{ fontSize: 48, marginBottom: 16 }}>🧾</div>
      <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>
        {isFiltered ? 'Keine Belege für diesen Filter' : 'Noch keine Belege hochgeladen'}
      </h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: 24, fontSize: 14, maxWidth: 340, margin: '0 auto 24px' }}>
        {isFiltered
          ? 'Versuche einen anderen Status-Filter oder lade neue Belege hoch.'
          : 'Leg los — lade deinen ersten Beleg hoch und Gastro beginnt mit der automatischen Verarbeitung.'}
      </p>
      <button
        type="button"
        onClick={onUpload}
        style={{
          padding: '10px 24px',
          background: 'var(--grad-green)',
          border: 'none',
          borderRadius: 'var(--radius)',
          color: '#fff',
          fontWeight: 700,
          fontSize: 14,
          cursor: 'pointer',
        }}
      >
        + Beleg hochladen
      </button>
    </div>
  );
}

// ── Pagination ────────────────────────────────────────────────────────────────

function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (p: number) => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 8,
        marginTop: 20,
        flexWrap: 'wrap',
      }}
      aria-label="Seitennummerierung"
    >
      <button
        type="button"
        className="ghost"
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        aria-label="Vorherige Seite"
        style={{ fontSize: 13, padding: '6px 12px' }}
      >
        &larr; Zurück
      </button>

      <span style={{ fontSize: 13, color: 'var(--text-muted)', padding: '0 8px' }}>
        Seite {page} von {totalPages}
      </span>

      <button
        type="button"
        className="ghost"
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages}
        aria-label="Nächste Seite"
        style={{ fontSize: 13, padding: '6px 12px' }}
      >
        Weiter &rarr;
      </button>
    </div>
  );
}
