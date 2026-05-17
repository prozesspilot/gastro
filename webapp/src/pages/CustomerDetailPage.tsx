import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getCustomer, getReceipts } from '../api';
import { SkeletonBlock } from '../components/Skeleton';
import StatusBadge from '../components/StatusBadge';
import type { Customer, Receipt } from '../types';

export default function CustomerDetailPage() {
  const { tenantId, customerId } = useParams<{ tenantId: string; customerId: string }>();
  const tid = tenantId!;
  const cid = customerId!;
  const navigate = useNavigate();

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      getCustomer(tid, cid),
      getReceipts(cid).catch(() => [] as Receipt[]),
    ])
      .then(([c, r]) => {
        setCustomer(c);
        setReceipts(r);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [cid, tid]);

  if (loading) return <SkeletonBlock height={300} />;
  if (error)   return <div className="error-box">{error}</div>;
  if (!customer) return null;

  const recent = receipts.slice(0, 5);

  return (
    <div>
      <div style={{ marginBottom: 16, fontSize: 13, color: 'var(--text-muted)' }}>
        <Link to="/tenants">Mandanten</Link>
        <span style={{ margin: '0 6px' }}>›</span>
        <Link to={`/tenants/${tid}/customers`}>Kunden</Link>
        <span style={{ margin: '0 6px' }}>›</span>
        <span>{customer.display_name}</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>{customer.display_name}</h1>
      </div>

      <div className="card" style={{ padding: 24, marginBottom: 20 }}>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
          ID: <code>{customer.id}</code> · Erstellt am {fmtDate(customer.created_at)}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            className="primary"
            onClick={() => navigate(`/tenants/${tid}/customers/${cid}/profile`)}
          >
            Profil & Module bearbeiten →
          </button>
          <button
            className="secondary"
            onClick={() => navigate(`/tenants/${tid}/customers/${cid}/receipts`)}
          >
            Belege anzeigen
          </button>
          <button
            className="ghost"
            onClick={() => navigate(`/tenants/${tid}/customers`)}
            style={{ marginLeft: 'auto' }}
          >
            Zurück
          </button>
        </div>
      </div>

      <div className="card" style={{ padding: 24 }}>
        <div className="section-header">
          <span className="section-title">Letzte Belege</span>
          <Link to={`/tenants/${tid}/customers/${cid}/receipts`} style={{ fontSize: 12 }}>
            Alle ansehen →
          </Link>
        </div>
        {recent.length === 0 ? (
          <div style={{ padding: 24, color: 'var(--text-subtle)', fontSize: 13, textAlign: 'center' }}>
            Noch keine Belege für diesen Kunden.
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Datei / Lieferant</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Betrag</th>
                <th>Datum</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((r) => (
                <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/receipts/${r.id}`)}>
                  <td style={{ fontWeight: 500 }}>{r.extracted_data?.vendor_name ?? r.file_name}</td>
                  <td><StatusBadge status={r.status} /></td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>
                    {r.extracted_data?.total_amount !== undefined
                      ? r.extracted_data.total_amount.toLocaleString('de-DE', { style: 'currency', currency: r.extracted_data.currency ?? 'EUR' })
                      : '—'}
                  </td>
                  <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>{fmtDate(r.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
