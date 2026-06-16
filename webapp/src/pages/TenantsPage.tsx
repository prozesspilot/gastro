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
                  <Td style={{ textAlign: 'right' }}>
                    <button
                      type="button"
                      className="secondary"
                      style={{ fontSize: 12 }}
                      onClick={() => setActiveTenantId(t.id)}
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
