import { useState, useEffect } from 'react';
import { listCommunications } from '../api/communications';
import type { Communication } from '../api/communications';
import EmptyState from '../components/EmptyState';

export default function CommunicationsPage() {
  const [communications, setCommunications] = useState<Communication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [directionFilter, setDirectionFilter] = useState<'all' | 'inbound' | 'outbound'>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    loadCommunications();
  }, [directionFilter, statusFilter]);

  async function loadCommunications() {
    setLoading(true);
    setError(null);
    try {
      const params: Parameters<typeof listCommunications>[0] = {};
      if (directionFilter !== 'all') params.direction = directionFilter as 'inbound' | 'outbound';
      if (statusFilter !== 'all') params.status = statusFilter;
      const data = await listCommunications(params);
      setCommunications(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unbekannter Fehler');
    } finally {
      setLoading(false);
    }
  }

  const statusColors: Record<string, string> = {
    sent: 'badge-green',
    mock_sent: 'badge-blue',
    delivered: 'badge-green',
    bounced: 'badge-red',
    reply_received: 'badge-purple',
    pending: 'badge-orange',
  };

  return (
    <div className="page-content">
      <div style={{ marginBottom: 24 }}>
        <h1 className="page-title">Lieferanten-Kommunikation</h1>
        <p className="page-subtitle">Ausgehende Anfragen und eingehende Antworten</p>
      </div>

      {/* Filter */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ color: 'var(--text-muted)', fontSize: 14 }}>Richtung:</label>
          <select
            className="select"
            value={directionFilter}
            onChange={e => setDirectionFilter(e.target.value as typeof directionFilter)}
          >
            <option value="all">Alle</option>
            <option value="outbound">Ausgehend</option>
            <option value="inbound">Eingehend</option>
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ color: 'var(--text-muted)', fontSize: 14 }}>Status:</label>
          <select
            className="select"
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
          >
            <option value="all">Alle</option>
            <option value="sent">Versendet</option>
            <option value="mock_sent">Mock-Versand</option>
            <option value="delivered">Zugestellt</option>
            <option value="bounced">Bounce</option>
            <option value="reply_received">Antwort erhalten</option>
          </select>
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={loadCommunications}
          disabled={loading}
        >
          {loading ? 'Lade...' : 'Aktualisieren'}
        </button>
      </div>

      {error && (
        <div className="alert alert-error" style={{ marginBottom: 16 }}>
          {error}
        </div>
      )}

      {loading ? (
        <div className="skeleton-block" style={{ height: 200 }} />
      ) : communications.length === 0 ? (
        <EmptyState
          icon="✉"
          title="Keine Kommunikations-Eintraege gefunden"
          description="Kommunikationen werden automatisch erstellt wenn Belege eingehen oder fehlende Belege angefordert werden."
        />
      ) : (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Datum</th>
                <th>Richtung</th>
                <th>Lieferant/Absender</th>
                <th>Betreff</th>
                <th>Template</th>
                <th>Status</th>
                <th>Referenz</th>
              </tr>
            </thead>
            <tbody>
              {communications.map(comm => (
                <tr key={comm.communication_id}>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {new Date(comm.created_at).toLocaleString('de-DE', {
                      day: '2-digit',
                      month: '2-digit',
                      year: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td>
                    <span className={`badge ${comm.direction === 'outbound' ? 'badge-blue' : 'badge-purple'}`}>
                      {comm.direction === 'outbound' ? 'Ausgehend' : 'Eingehend'}
                    </span>
                  </td>
                  <td>
                    {comm.direction === 'outbound'
                      ? comm.to_address ?? '–'
                      : comm.from_address ?? '–'}
                  </td>
                  <td style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {comm.subject ?? '–'}
                  </td>
                  <td>
                    {comm.template
                      ? <code style={{ fontSize: 12 }}>{comm.template}</code>
                      : <span style={{ color: 'var(--text-muted)' }}>–</span>}
                  </td>
                  <td>
                    <span className={`badge ${statusColors[comm.status] ?? 'badge-gray'}`}>
                      {comm.status}
                    </span>
                  </td>
                  <td>
                    {comm.reference_id
                      ? <code style={{ fontSize: 11 }}>{comm.reference_id}</code>
                      : <span style={{ color: 'var(--text-muted)' }}>–</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ marginTop: 16, fontSize: 13, color: 'var(--text-muted)' }}>
        {communications.length} Eintraege gesamt
      </div>
    </div>
  );
}
