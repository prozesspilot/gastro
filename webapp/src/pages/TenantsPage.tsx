import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createTenant, getTenants, setActiveTenantId } from '../api';
import { SkeletonTable } from '../components/Skeleton';
import type { Tenant } from '../types';

export default function TenantsPage() {
  const [tenants, setTenants]     = useState<Tenant[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [showForm, setShowForm]   = useState(false);
  const navigate = useNavigate();

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const list = await getTenants();
      setTenants(list);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  function openCustomers(tenant: Tenant) {
    setActiveTenantId(tenant.id);
    navigate(`/tenants/${tenant.id}/customers`);
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>Mandanten</h1>
          <p style={{ color: 'var(--text-muted)', marginTop: 2 }}>
            {tenants.length} Mandant{tenants.length !== 1 ? 'en' : ''}
          </p>
        </div>
        <button className="primary" onClick={() => setShowForm(true)}>+ Mandant anlegen</button>
      </div>

      {error && <div className="error-box">{error}</div>}

      {showForm && (
        <CreateTenantForm
          onCreated={(t) => { setTenants([t, ...tenants]); setShowForm(false); }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {loading ? (
        <div className="card" style={{ overflow: 'hidden' }}>
          <SkeletonTable rows={4} cols={5} />
        </div>
      ) : tenants.length === 0 ? (
        <div className="card empty">
          <p>Noch keine Mandanten vorhanden.</p>
          <p style={{ marginTop: 8, fontSize: 13 }}>Legen Sie den ersten Mandanten an.</p>
        </div>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: '#fafafa' }}>
                <Th>Name</Th>
                <Th>Slug</Th>
                <Th>Erstellt</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((t) => (
                <tr key={t.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <Td><strong>{t.name}</strong></Td>
                  <Td><code style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t.slug}</code></Td>
                  <Td style={{ color: 'var(--text-muted)' }}>{fmtDate(t.created_at)}</Td>
                  <Td style={{ textAlign: 'right' }}>
                    <button className="secondary" style={{ fontSize: 12 }} onClick={() => openCustomers(t)}>
                      Kunden →
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

// ── CreateTenantForm ──────────────────────────────────────────────────────────

function CreateTenantForm({
  onCreated,
  onCancel,
}: {
  onCreated: (t: Tenant) => void;
  onCancel: () => void;
}) {
  const [name, setName]     = useState('');
  const [slug, setSlug]     = useState('');
  const [error, setError]   = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Slug auto-generieren aus Name
  function handleNameChange(v: string) {
    setName(v);
    setSlug(v.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const t = await createTenant({ name: name.trim(), slug: slug.trim() });
      onCreated(t);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card" style={{ padding: 20, marginBottom: 20 }}>
      <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Neuer Mandant</h2>
      {error && <div className="error-box">{error}</div>}
      <form onSubmit={submit}>
        <div className="field">
          <label>Name *</label>
          <input value={name} onChange={e => handleNameChange(e.target.value)} required placeholder="Mustermann GmbH" />
        </div>
        <div className="field">
          <label>Slug *</label>
          <input value={slug} onChange={e => setSlug(e.target.value)} required placeholder="mustermann-gmbh"
            pattern="[a-z0-9]+(?:-[a-z0-9]+)*" title="Nur Kleinbuchstaben, Ziffern und Bindestriche" />
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
            URL-sicherer Bezeichner, z. B. &quot;mustermann-gmbh&quot;
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="submit" className="primary" disabled={saving}>{saving ? 'Speichern…' : 'Anlegen'}</button>
          <button type="button" className="secondary" onClick={onCancel}>Abbrechen</button>
        </div>
      </form>
    </div>
  );
}

// ── Hilfsfunktionen ───────────────────────────────────────────────────────────

function Th({ children, style }: { children?: React.ReactNode; style?: React.CSSProperties }) {
  return <th scope="col" style={{ padding: '10px 16px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', ...style }}>{children}</th>;
}

function Td({ children, style }: { children?: React.ReactNode; style?: React.CSSProperties }) {
  return <td style={{ padding: '12px 16px', ...style }}>{children}</td>;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
