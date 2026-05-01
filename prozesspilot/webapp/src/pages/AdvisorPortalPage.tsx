import { useState, useEffect, useCallback } from 'react';
import { getAdvisorOverview, getPendingReceipts, bulkApprove, addComment } from '../api/advisor';
import type { CustomerOverviewItem, PendingReceiptItem } from '../api/advisor';

// Demo advisor ID — in Produktion aus Auth-Context
const DEMO_ADVISOR_ID = 'demo-advisor-001';

export default function AdvisorPortalPage() {
  const [activeTab, setActiveTab] = useState<'overview' | 'review'>('overview');
  const [customers, setCustomers] = useState<CustomerOverviewItem[]>([]);
  const [receipts, setReceipts] = useState<PendingReceiptItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [selectedReceiptIds, setSelectedReceiptIds] = useState<Set<string>>(new Set());
  const [approving, setApproving] = useState(false);
  const [approveComment, setApproveComment] = useState('');
  const [commentingReceipt, setCommentingReceipt] = useState<string | null>(null);
  const [commentText, setCommentText] = useState('');
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cust, recs] = await Promise.all([
        getAdvisorOverview(DEMO_ADVISOR_ID).catch(() => [] as CustomerOverviewItem[]),
        getPendingReceipts(DEMO_ADVISOR_ID, {
          customerId: selectedCustomerId ?? undefined,
        }).catch(() => [] as PendingReceiptItem[]),
      ]);
      setCustomers(cust);
      setReceipts(recs);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unbekannter Fehler');
    } finally {
      setLoading(false);
    }
  }, [selectedCustomerId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function handleCustomerClick(customerId: string) {
    setSelectedCustomerId(prev => prev === customerId ? null : customerId);
    setActiveTab('review');
  }

  function toggleReceiptSelection(receiptId: string) {
    setSelectedReceiptIds(prev => {
      const next = new Set(prev);
      if (next.has(receiptId)) {
        next.delete(receiptId);
      } else {
        next.add(receiptId);
      }
      return next;
    });
  }

  function toggleAllReceipts() {
    if (selectedReceiptIds.size === receipts.length) {
      setSelectedReceiptIds(new Set());
    } else {
      setSelectedReceiptIds(new Set(receipts.map(r => r.receipt_id)));
    }
  }

  async function handleBulkApprove() {
    if (selectedReceiptIds.size === 0) return;
    setApproving(true);
    try {
      const result = await bulkApprove(
        DEMO_ADVISOR_ID,
        Array.from(selectedReceiptIds),
        approveComment || undefined,
      );
      setSuccessMsg(`${result.approved_count} Belege genehmigt.`);
      setSelectedReceiptIds(new Set());
      setApproveComment('');
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fehler beim Genehmigen');
    } finally {
      setApproving(false);
    }
  }

  async function handleAddComment(receiptId: string) {
    if (!commentText.trim()) return;
    try {
      await addComment(receiptId, DEMO_ADVISOR_ID, commentText);
      setCommentingReceipt(null);
      setCommentText('');
      setSuccessMsg('Kommentar gespeichert.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fehler beim Speichern');
    }
  }

  const pendingCustomers = customers.filter(c => c.pending_count > 0);

  return (
    <div className="page-content">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 className="page-title">Steuerberater-Portal</h1>
          <p className="page-subtitle">Multi-Mandanten-Ansicht · Bulk-Freigabe · Kommentarfunktion</p>
        </div>
      </div>

      {/* Status Messages */}
      {successMsg && (
        <div className="alert alert-success" style={{ marginBottom: 16 }}>
          {successMsg}
          <button
            type="button"
            onClick={() => setSuccessMsg(null)}
            style={{ marginLeft: 12, background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}
          >
            x
          </button>
        </div>
      )}
      {error && (
        <div className="alert alert-error" style={{ marginBottom: 16 }}>
          {error}
          <button
            type="button"
            onClick={() => setError(null)}
            style={{ marginLeft: 12, background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}
          >
            x
          </button>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="tab-bar" style={{ marginBottom: 24 }}>
        <button
          type="button"
          className={`tab-btn${activeTab === 'overview' ? ' active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          Mandantenuebersicht ({customers.length})
        </button>
        <button
          type="button"
          className={`tab-btn${activeTab === 'review' ? ' active' : ''}`}
          onClick={() => setActiveTab('review')}
        >
          Zur Pruefung
          {receipts.length > 0 && (
            <span className="badge badge-red" style={{ marginLeft: 8 }}>
              {receipts.length}
            </span>
          )}
        </button>
      </div>

      {loading ? (
        <div className="skeleton-block" style={{ height: 200 }} />
      ) : (
        <>
          {/* Tab 1: Mandantenuebersicht */}
          {activeTab === 'overview' && (
            <div>
              {customers.length === 0 ? (
                <div className="empty-state">
                  <p>Keine Mandanten zugewiesen. Bitte wenden Sie sich an den Administrator.</p>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
                  {customers.map(customer => (
                    <button
                      key={customer.customer_id}
                      type="button"
                      className={`card customer-card${selectedCustomerId === customer.customer_id ? ' selected' : ''}`}
                      onClick={() => handleCustomerClick(customer.customer_id)}
                      style={{ textAlign: 'left', cursor: 'pointer', width: '100%' }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{customer.name}</h3>
                        {customer.pending_count > 0 && (
                          <span className="badge badge-red">{customer.pending_count} ausstehend</span>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 22, fontWeight: 700 }}>{customer.receipt_count}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Gesamt</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 22, fontWeight: 700, color: customer.pending_count > 0 ? 'var(--danger)' : undefined }}>
                            {customer.pending_count}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Ausstehend</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--success)' }}>{customer.exported_count}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Exportiert</div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {pendingCustomers.length > 0 && (
                <div className="info-box" style={{ marginTop: 24 }}>
                  <strong>{pendingCustomers.length} Mandant{pendingCustomers.length > 1 ? 'en' : ''}</strong> mit ausstehenden Belegen.
                  Klicken Sie auf eine Karte, um die Belege zu pruefen.
                </div>
              )}
            </div>
          )}

          {/* Tab 2: Zur Pruefung */}
          {activeTab === 'review' && (
            <div>
              {/* Filter-Anzeige */}
              {selectedCustomerId && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                  <span className="badge badge-blue">
                    Mandant: {customers.find(c => c.customer_id === selectedCustomerId)?.name ?? selectedCustomerId}
                  </span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => { setSelectedCustomerId(null); }}
                  >
                    Filter entfernen
                  </button>
                </div>
              )}

              {/* Bulk-Aktionsleiste */}
              {receipts.length > 0 && (
                <div className="action-bar" style={{ marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: 14 }}>
                    {selectedReceiptIds.size} von {receipts.length} ausgewaehlt
                  </span>
                  {selectedReceiptIds.size > 0 && (
                    <>
                      <input
                        type="text"
                        className="input"
                        placeholder="Kommentar (optional)"
                        value={approveComment}
                        onChange={e => setApproveComment(e.target.value)}
                        style={{ flex: 1, minWidth: 200 }}
                      />
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={handleBulkApprove}
                        disabled={approving}
                      >
                        {approving ? 'Genehmige...' : `Ausgewaehlte genehmigen (${selectedReceiptIds.size})`}
                      </button>
                    </>
                  )}
                </div>
              )}

              {receipts.length === 0 ? (
                <div className="empty-state">
                  <p>Keine ausstehenden Belege{selectedCustomerId ? ' fuer diesen Mandanten' : ''}.</p>
                </div>
              ) : (
                <div className="table-wrapper">
                  <table className="table">
                    <thead>
                      <tr>
                        <th style={{ width: 40 }}>
                          <input
                            type="checkbox"
                            checked={selectedReceiptIds.size === receipts.length}
                            onChange={toggleAllReceipts}
                            aria-label="Alle auswaehlen"
                          />
                        </th>
                        <th>Mandant</th>
                        <th>Datum</th>
                        <th>Lieferant</th>
                        <th>Betrag</th>
                        <th>Grund</th>
                        <th>Aktionen</th>
                      </tr>
                    </thead>
                    <tbody>
                      {receipts.map(receipt => (
                        <>
                          <tr key={receipt.receipt_id} className={selectedReceiptIds.has(receipt.receipt_id) ? 'row-selected' : ''}>
                            <td>
                              <input
                                type="checkbox"
                                checked={selectedReceiptIds.has(receipt.receipt_id)}
                                onChange={() => toggleReceiptSelection(receipt.receipt_id)}
                                aria-label={`Beleg ${receipt.receipt_id} auswaehlen`}
                              />
                            </td>
                            <td>
                              <span style={{ fontWeight: 500 }}>{receipt.customer_name}</span>
                            </td>
                            <td>
                              {receipt.document_date
                                ? new Date(receipt.document_date).toLocaleDateString('de-DE')
                                : <span style={{ color: 'var(--text-muted)' }}>–</span>}
                            </td>
                            <td>{receipt.supplier_name ?? <span style={{ color: 'var(--text-muted)' }}>Unbekannt</span>}</td>
                            <td>
                              {receipt.amount !== undefined
                                ? `${receipt.amount.toFixed(2)} ${receipt.currency ?? 'EUR'}`
                                : <span style={{ color: 'var(--text-muted)' }}>–</span>}
                            </td>
                            <td>
                              {receipt.review_reason
                                ? <span className="badge badge-orange">{receipt.review_reason}</span>
                                : <span style={{ color: 'var(--text-muted)' }}>–</span>}
                            </td>
                            <td>
                              <div style={{ display: 'flex', gap: 8 }}>
                                <button
                                  type="button"
                                  className="btn btn-ghost btn-sm"
                                  onClick={() => {
                                    setCommentingReceipt(
                                      commentingReceipt === receipt.receipt_id ? null : receipt.receipt_id
                                    );
                                    setCommentText('');
                                  }}
                                >
                                  Kommentar
                                </button>
                              </div>
                            </td>
                          </tr>
                          {commentingReceipt === receipt.receipt_id && (
                            <tr key={`comment-${receipt.receipt_id}`}>
                              <td colSpan={7}>
                                <div style={{ display: 'flex', gap: 8, padding: '8px 0', alignItems: 'center' }}>
                                  <input
                                    type="text"
                                    className="input"
                                    placeholder="Kommentar eingeben..."
                                    value={commentText}
                                    onChange={e => setCommentText(e.target.value)}
                                    onKeyDown={e => {
                                      if (e.key === 'Enter') handleAddComment(receipt.receipt_id);
                                      if (e.key === 'Escape') setCommentingReceipt(null);
                                    }}
                                    autoFocus
                                    style={{ flex: 1 }}
                                  />
                                  <button
                                    type="button"
                                    className="btn btn-primary btn-sm"
                                    onClick={() => handleAddComment(receipt.receipt_id)}
                                  >
                                    Speichern
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-ghost btn-sm"
                                    onClick={() => setCommentingReceipt(null)}
                                  >
                                    Abbrechen
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
