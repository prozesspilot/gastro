import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  getActiveTenantId,
  getCustomers,
  getReceipts,
  getTenants,
  setActiveTenantId,
  updateReceiptStatus,
} from '../api';
import { mapReceipt } from '../api/receipts';
import { useDebounce } from '../hooks/useDebounce';
import { useReceiptEvents } from '../hooks/useReceiptEvents';
import { SkeletonTable } from '../components/Skeleton';
import StatusBadge from '../components/StatusBadge';
import ConfidenceBadge from '../components/ConfidenceBadge';
import CategoryBadge from '../components/CategoryBadge';
import { useToast } from '../components/ToastProvider';
import type { Customer, Receipt, ReceiptStatus, Tenant } from '../types';

type StatusGroup = 'all' | 'open' | 'error' | 'completed';

const OPEN_STATES: ReceiptStatus[] = [
  'received', 'extracting', 'extracted', 'categorizing', 'categorized',
  'archiving', 'archived', 'exporting', 'requires_review',
];
const COMPLETED_STATES: ReceiptStatus[] = ['exported', 'completed'];

function inGroup(status: ReceiptStatus, group: StatusGroup): boolean {
  if (group === 'all') return true;
  if (group === 'open') return OPEN_STATES.includes(status);
  if (group === 'error') return status === 'error';
  if (group === 'completed') return COMPLETED_STATES.includes(status);
  return false;
}

export default function ReceiptsPage() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [selectedTenant, setSelectedTenant] = useState<string>('');
  const [tenantsLoading, setTenantsLoading] = useState(true);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const customerMap = useMemo(() => {
    const m = new Map<string, Customer>();
    for (const c of customers) m.set(c.id, c);
    return m;
  }, [customers]);

  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [receiptsLoading, setReceiptsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [statusGroup, setStatusGroup] = useState<StatusGroup>('all');
  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 300);

  // Tenants laden
  useEffect(() => {
    getTenants()
      .then((res) => {
        setTenants(res);
        const stored = getActiveTenantId();
        const initial = stored && res.some((t) => t.id === stored) ? stored : res[0]?.id ?? '';
        if (initial) {
          setSelectedTenant(initial);
          setActiveTenantId(initial);
        }
      })
      .catch((e) => setError(String(e)))
      .finally(() => setTenantsLoading(false));
  }, []);

  // Receipts + Customers laden
  useEffect(() => {
    if (!selectedTenant) {
      setReceipts([]);
      setCustomers([]);
      return;
    }
    setReceiptsLoading(true);
    setError(null);

    Promise.all([
      getReceipts(undefined, {}),
      getCustomers(selectedTenant).catch(() => [] as Customer[]),
    ])
      .then(([r, c]) => {
        setReceipts(r);
        setCustomers(c);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setReceiptsLoading(false));
  }, [selectedTenant]);

  // SSE Live-Updates
  useReceiptEvents(selectedTenant || null, (event, data) => {
    if (!data || typeof data !== 'object') return;
    const payload = data as { receipt?: unknown; id?: string; receipt_id?: string; status?: ReceiptStatus };
    const id = payload.receipt
      ? (mapReceipt(payload.receipt as Parameters<typeof mapReceipt>[0]).id)
      : payload.receipt_id ?? payload.id ?? '';
    if (!id) return;

    if (event === 'receipt:created' && payload.receipt) {
      const r = mapReceipt(payload.receipt as Parameters<typeof mapReceipt>[0]);
      setReceipts((prev) => [r, ...prev.filter((x) => x.id !== id)]);
    } else if (event === 'receipt:status' || event === 'receipt:updated') {
      setReceipts((prev) => prev.map((x) => {
        if (x.id !== id) return x;
        if (payload.receipt) return mapReceipt(payload.receipt as Parameters<typeof mapReceipt>[0]);
        if (payload.status) return { ...x, status: payload.status, updated_at: new Date().toISOString() };
        return x;
      }));
    }
  });

  // Filter
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return receipts.filter((r) => {
      if (!inGroup(r.status, statusGroup)) return false;
      if (q) {
        const fields = [
          r.file_name,
          r.extracted_data?.vendor_name ?? '',
          r.categorization?.category_name ?? '',
          customerMap.get(r.customer_id)?.display_name ?? '',
        ].join(' ').toLowerCase();
        if (!fields.includes(q)) return false;
      }
      return true;
    });
  }, [receipts, statusGroup, search, customerMap]);

  const groupCounts = useMemo(() => ({
    all: receipts.length,
    open: receipts.filter((r) => OPEN_STATES.includes(r.status)).length,
    error: receipts.filter((r) => r.status === 'error').length,
    completed: receipts.filter((r) => COMPLETED_STATES.includes(r.status)).length,
  }), [receipts]);

  function onTenantChange(id: string) {
    setSelectedTenant(id);
    setActiveTenantId(id);
  }

  async function markAsReview(r: Receipt) {
    try {
      const updated = await updateReceiptStatus(r.id, 'requires_review');
      setReceipts((prev) => prev.map((x) => (x.id === r.id ? updated : x)));
      toast('success', 'Beleg zur Überprüfung markiert');
    } catch (e) {
      toast('error', `Fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-subtle)', marginBottom: 6 }}>
            ARCHIV
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.8px' }}>
            <span className="gradient-text">Belege</span> 📋
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 6 }}>
            {receipts.length} Belege · Klick öffnet Detailansicht
          </p>
        </div>
      </div>

      {/* Tenant */}
      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="tenant-select">Tenant</label>
          <select
            id="tenant-select"
            value={selectedTenant}
            onChange={(e) => onTenantChange(e.target.value)}
            disabled={tenantsLoading}
          >
            <option value="">— Bitte wählen —</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Filter-Leiste mit Status-Dropdown */}
      <div className="filter-bar">
        <div className="field" style={{ marginBottom: 0, minWidth: 200 }}>
          <label htmlFor="status-filter" style={{ fontSize: 11 }}>Status</label>
          <select
            id="status-filter"
            value={statusGroup}
            onChange={(e) => setStatusGroup(e.target.value as StatusGroup)}
          >
            <option value="all">Alle ({groupCounts.all})</option>
            <option value="open">Offen ({groupCounts.open})</option>
            <option value="error">Fehler ({groupCounts.error})</option>
            <option value="completed">Abgeschlossen ({groupCounts.completed})</option>
          </select>
        </div>
        <input
          type="text"
          placeholder="🔍 Lieferant, Kunde, Kategorie, Dateiname…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          style={{ flex: 1, minWidth: 200 }}
          aria-label="Belege durchsuchen"
        />
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>
          {filtered.length} von {receipts.length}
        </span>
      </div>

      {error && <div className="error-box">{error}</div>}

      {/* Tabelle */}
      <div className="card" style={{ padding: 0, overflow: 'visible' }}>
        {receiptsLoading ? (
          <SkeletonTable rows={6} cols={7} />
        ) : !selectedTenant ? (
          <div className="empty-illustration">
            <div className="empty-illustration-icon">🏢</div>
            <div className="empty-illustration-title">Kein Tenant ausgewählt</div>
            <div className="empty-illustration-text">
              Wählen Sie oben einen Mandanten, um dessen Belege zu sehen.
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-illustration">
            <div className="empty-illustration-icon">📭</div>
            <div className="empty-illustration-title">
              {receipts.length === 0 ? 'Noch keine Belege' : 'Keine Treffer'}
            </div>
            <div className="empty-illustration-text">
              {receipts.length === 0
                ? 'Sobald Belege per Upload, WhatsApp oder E-Mail eingehen, erscheinen sie hier.'
                : 'Passen Sie Filter oder Suchbegriff an, um mehr Belege zu sehen.'}
            </div>
          </div>
        ) : (
          <table aria-label="Belege-Tabelle">
            <thead>
              <tr>
                <th scope="col">Lieferant / Datei</th>
                <th scope="col">Kunde</th>
                <th scope="col">Kategorie</th>
                <th style={{ width: 90 }} scope="col">Confidence</th>
                <th style={{ textAlign: 'right' }} scope="col">Betrag</th>
                <th style={{ width: 150 }} scope="col">Status</th>
                <th style={{ width: 130 }} scope="col">Datum</th>
                <th style={{ width: 60 }} scope="col" aria-label="Aktionen"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const customer = customerMap.get(r.customer_id);
                const supplier = r.extracted_data?.vendor_name ?? r.file_name;
                const isReview = r.status === 'requires_review';

                return (
                  <tr
                    key={r.id}
                    className={isReview ? 'row-review' : undefined}
                    style={{ cursor: 'pointer' }}
                    onClick={() => navigate(`/receipts/${r.id}`)}
                  >
                    <td style={{ fontWeight: 500 }}>
                      <Link to={`/receipts/${r.id}`} onClick={(e) => e.stopPropagation()} style={{ color: 'var(--text)' }}>
                        {supplier}
                      </Link>
                      {r.extracted_data?.invoice_number && (
                        <div style={{ fontSize: 11, color: 'var(--text-subtle)', fontFamily: 'monospace' }}>
                          {r.extracted_data.invoice_number}
                        </div>
                      )}
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                      {customer?.display_name ?? <span style={{ color: 'var(--text-subtle)' }}>{r.customer_id.substring(0, 8)}…</span>}
                    </td>
                    <td>
                      {r.categorization
                        ? <CategoryBadge category={r.categorization.category_id} label={r.categorization.category_name} />
                        : <span style={{ color: 'var(--text-subtle)' }}>—</span>}
                    </td>
                    <td>
                      <ConfidenceBadge confidence={r.categorization?.confidence ?? r.extracted_data?.confidence} compact />
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>
                      {r.extracted_data?.total_amount !== undefined
                        ? r.extracted_data.total_amount.toLocaleString('de-DE', { style: 'currency', currency: r.extracted_data.currency ?? 'EUR' })
                        : <span style={{ color: 'var(--text-subtle)', fontWeight: 400 }}>—</span>}
                    </td>
                    <td><StatusBadge status={r.status} /></td>
                    <td style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                      {formatDate(r.extracted_data?.invoice_date ?? r.created_at)}
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      {!isReview && (
                        <button
                          type="button"
                          className="ghost"
                          onClick={() => markAsReview(r)}
                          title="Zur Überprüfung markieren"
                          style={{ padding: '4px 8px', fontSize: 12 }}
                        >
                          ⚠
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
