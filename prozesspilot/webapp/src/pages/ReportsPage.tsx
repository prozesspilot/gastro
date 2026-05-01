import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { buildReport, downloadReport, getReports } from '../api/reports';
import type { Report, ReportTotals } from '../api/reports';
import { useToast } from '../components/ToastProvider';
import { SkeletonBlock } from '../components/Skeleton';

export default function ReportsPage() {
  const { customerId } = useParams<{ customerId: string }>();
  const { toast } = useToast();

  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [building, setBuilding] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!customerId) return;
    loadReports();
  }, [customerId]);

  async function loadReports() {
    if (!customerId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getReports(customerId);
      setReports(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleBuildReport() {
    if (!customerId) return;
    setBuilding(true);
    try {
      const result = await buildReport(customerId, {});
      toast('success', `Bericht ${result.period} erfolgreich erstellt (Status: ${result.status})`);
      await loadReports();
    } catch (e) {
      toast('error', `Bericht erstellen fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBuilding(false);
    }
  }

  async function handleDownload(reportId: string, period: string) {
    if (!customerId) return;
    setDownloading(reportId);
    try {
      const blob = await downloadReport(customerId, reportId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bericht-${period}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast('error', `Download fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-subtle)', marginBottom: 6 }}>
            M08 REPORTING
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.8px' }}>
            Monatsberichte
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 6 }}>
            PDF-Berichte mit Ausgaben-Übersicht, Top-Kategorien und Lieferanten
          </p>
        </div>
        <div>
          <button
            className="primary"
            disabled={building}
            onClick={handleBuildReport}
          >
            {building ? <span className="spinner" /> : '+'} Bericht jetzt erstellen
          </button>
        </div>
      </div>

      {error && <div className="error-box">{error}</div>}

      {/* Reports-Tabelle */}
      <div className="card" style={{ padding: 0 }}>
        {loading ? (
          <div style={{ padding: 24 }}><SkeletonBlock height={300} /></div>
        ) : reports.length === 0 ? (
          <div className="empty-illustration">
            <div className="empty-illustration-icon">📊</div>
            <div className="empty-illustration-title">Noch keine Berichte</div>
            <div className="empty-illustration-text">
              Klicke auf "Bericht jetzt erstellen" um den ersten Monatsbericht zu generieren.
            </div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={thStyle}>Zeitraum</th>
                <th style={thStyle}>Belege</th>
                <th style={thStyle}>Gesamtsumme (Brutto)</th>
                <th style={thStyle}>Trend</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Erstellt</th>
                <th style={thStyle}>Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => (
                <ReportRow
                  key={r.report_id}
                  report={r}
                  onDownload={() => handleDownload(r.report_id, r.period)}
                  isDownloading={downloading === r.report_id}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function ReportRow({
  report,
  onDownload,
  isDownloading,
}: {
  report: Report;
  onDownload: () => void;
  isDownloading: boolean;
}) {
  const t = report.totals as ReportTotals | null;
  const trend = t?.trend_pct;

  return (
    <tr style={{ borderBottom: '1px solid var(--border)' }}>
      <td style={tdStyle}>
        <span style={{ fontWeight: 700, fontSize: 14 }}>{report.period}</span>
      </td>
      <td style={tdStyle}>
        {t ? t.receipts_count : <span style={{ color: 'var(--text-subtle)' }}>—</span>}
      </td>
      <td style={{ ...tdStyle, fontWeight: 600 }}>
        {t
          ? t.gross_sum.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
          : <span style={{ color: 'var(--text-subtle)' }}>—</span>}
      </td>
      <td style={tdStyle}>
        {trend !== null && trend !== undefined ? (
          <span style={{
            fontWeight: 700, fontSize: 12,
            color: trend > 0 ? '#f87171' : trend < 0 ? '#34d399' : 'var(--text-muted)',
          }}>
            {trend > 0 ? '▲' : trend < 0 ? '▼' : '='} {trend > 0 ? '+' : ''}{trend.toFixed(1)}%
          </span>
        ) : <span style={{ color: 'var(--text-subtle)' }}>—</span>}
      </td>
      <td style={tdStyle}>
        <StatusPill status={report.status} />
      </td>
      <td style={{ ...tdStyle, fontSize: 12, color: 'var(--text-muted)' }}>
        {new Date(report.created_at).toLocaleDateString('de-DE', {
          day: '2-digit', month: '2-digit', year: 'numeric',
        })}
      </td>
      <td style={tdStyle}>
        {report.status === 'done' ? (
          <button
            className="secondary"
            disabled={isDownloading}
            onClick={onDownload}
            style={{ fontSize: 12, padding: '4px 12px' }}
          >
            {isDownloading ? <span className="spinner" /> : 'PDF'} herunterladen
          </button>
        ) : (
          <span style={{ fontSize: 12, color: 'var(--text-subtle)' }}>
            {report.status === 'building' ? 'Wird erstellt ...' : 'Fehlgeschlagen'}
          </span>
        )}
      </td>
    </tr>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; klass: string }> = {
    done:     { label: 'Fertig',       klass: 'badge active' },
    building: { label: 'Wird erstellt', klass: 'badge info' },
    failed:   { label: 'Fehler',       klass: 'badge error' },
  };
  const spec = map[status] ?? { label: status, klass: 'badge' };
  return <span className={spec.klass}>{spec.label}</span>;
}

const thStyle: React.CSSProperties = {
  padding: '12px 16px',
  textAlign: 'left',
  fontSize: 11,
  fontWeight: 700,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.6px',
  color: 'var(--text-muted)',
};

const tdStyle: React.CSSProperties = {
  padding: '14px 16px',
  fontSize: 13,
  verticalAlign: 'middle',
};
