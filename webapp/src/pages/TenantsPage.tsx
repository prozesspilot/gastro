import { useEffect, useState } from 'react';
import { getTenants, setActiveTenantId, type TenantListItem } from '../api';
import { SkeletonTable } from '../components/Skeleton';

/**
 * A3-Reboot (T059): read-only Mandanten-Liste. Anlegen/Detail kommt in T061.
 */
export default function TenantsPage() {
  const [tenants, setTenants] = useState<TenantListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getTenants()
      .then((list) => {
        if (cancelled) return;
        setTenants(list);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(String(e));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Mandanten</h1>
        <p style={{ color: 'var(--text-muted)', marginTop: 2 }}>
          {tenants.length} Mandant{tenants.length !== 1 ? 'en' : ''}
        </p>
      </div>

      {error && <div className="error-box">{error}</div>}

      {loading ? (
        <div className="card" style={{ overflow: 'hidden' }}>
          <SkeletonTable rows={4} cols={4} />
        </div>
      ) : tenants.length === 0 ? (
        <div className="card empty">
          <p>Noch keine Mandanten vorhanden.</p>
        </div>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <Th>Name</Th>
                <Th>Slug</Th>
                <Th>Paket</Th>
                <Th>Onboarding</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {tenants.map((t) => (
                <tr key={t.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <Td>
                    <strong>{t.display_name}</strong>
                  </Td>
                  <Td>
                    <code style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t.slug}</code>
                  </Td>
                  <Td style={{ color: 'var(--text-muted)' }}>{t.package}</Td>
                  {/* Onboarding-Status (Badge) — NICHT zu verwechseln mit dem
                      "Als aktiv setzen"-Button, der nur den Arbeits-Tenant wählt. */}
                  <Td>
                    <OnboardingBadge status={t.onboarding_status} />
                  </Td>
                  <Td style={{ textAlign: 'right' }}>
                    <button
                      type="button"
                      className="secondary"
                      style={{ fontSize: 12 }}
                      onClick={() => setActiveTenantId(t.id)}
                      title="Diesen Mandanten als Arbeits-Tenant wählen (Belege-Ansicht)"
                    >
                      Als aktiv setzen
                    </button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Th({ children }: { children?: React.ReactNode }) {
  return (
    <th
      scope="col"
      style={{
        padding: '10px 16px',
        textAlign: 'left',
        fontSize: 12,
        fontWeight: 600,
        color: 'var(--text-muted)',
      }}
    >
      {children}
    </th>
  );
}

function Td({ children, style }: { children?: React.ReactNode; style?: React.CSSProperties }) {
  return <td style={{ padding: '12px 16px', ...style }}>{children}</td>;
}

/**
 * Onboarding-Status als Badge. Bildet die `tenants.onboarding_status`-FSM
 * (pending → wizard_started → wizard_done → activated) auf die Design-System-
 * Badge-Klassen ab. `activated` = der Mandant hat seine Stammdaten eingegeben
 * (T066) und ist freigeschaltet.
 */
function OnboardingBadge({ status }: { status: string }) {
  const map: Record<string, { cls: string; label: string }> = {
    activated: { cls: 'badge active', label: 'Aktiv' },
    wizard_done: { cls: 'badge info', label: 'Wizard fertig' },
    wizard_started: { cls: 'badge info', label: 'Wizard läuft' },
    pending: { cls: 'badge pending', label: 'Offen' },
  };
  const b = map[status] ?? { cls: 'badge pending', label: status || 'Offen' };
  return <span className={b.cls}>{b.label}</span>;
}
