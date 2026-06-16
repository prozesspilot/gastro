import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getActiveTenantId } from '../api';
import { listBelege } from '../api/belege';

/**
 * A3-Reboot (T059): schlanke Belege-Übersicht des aktiven Mandanten.
 * Ersetzt das alte Kunden-Dashboard (Tasks/SSE/Module = Geister-Welt).
 */
interface Counts {
  total: number;
  requiresReview: number;
}

export default function DashboardPage() {
  const [counts, setCounts] = useState<Counts | null>(null);
  const [noTenant, setNoTenant] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!getActiveTenantId()) {
        setNoTenant(true);
        return;
      }
      try {
        const [all, review] = await Promise.all([
          listBelege({ pageSize: 1 }),
          listBelege({ status: 'requires_review', pageSize: 1 }),
        ]);
        if (!cancelled) {
          setCounts({ total: all.pagination.total, requiresReview: review.pagination.total });
        }
      } catch (e) {
        if (!cancelled) setError(String(e));
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800 }}>Dashboard</h1>
          <p style={{ color: 'var(--text-muted)', marginTop: 4 }}>
            Belege-Übersicht des aktiven Mandanten
          </p>
        </div>
        <Link to="/belege">
          <button type="button" className="primary">
            Zur Belegliste →
          </button>
        </Link>
      </div>

      {noTenant ? (
        <div className="card empty">
          <p>Bitte oben rechts einen Mandanten wählen, um die Belege zu sehen.</p>
        </div>
      ) : error ? (
        <div className="error-box">{error}</div>
      ) : (
        <div className="kpi-grid">
          <KpiCard label="Belege gesamt" value={counts?.total} color="#58a6ff" />
          <KpiCard
            label="Zu prüfen"
            value={counts?.requiresReview}
            color="#fb923c"
            hint="Status: requires_review"
          />
        </div>
      )}
    </div>
  );
}

function KpiCard({
  label,
  value,
  color,
  hint,
}: {
  label: string;
  value?: number;
  color: string;
  hint?: string;
}) {
  return (
    <div className="kpi-card">
      <div className="kpi-card-glow" style={{ background: color }} />
      <div className="kpi-label">{label}</div>
      <div className="kpi-value" style={{ color }}>
        {value ?? '—'}
      </div>
      {hint && <div className="kpi-sub">{hint}</div>}
    </div>
  );
}
