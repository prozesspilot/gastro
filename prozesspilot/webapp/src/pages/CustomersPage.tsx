import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { createCustomer, deleteCustomer, getCustomers } from '../api';
import type { CreateCustomerInput } from '../api/customers';
import { SkeletonTable } from '../components/Skeleton';
import { useToast } from '../components/ToastProvider';
import type { Customer } from '../types';

export default function CustomersPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const tid = tenantId!;
  const navigate = useNavigate();
  const { toast } = useToast();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [showForm, setShowForm]   = useState(false);

  useEffect(() => { load(); }, [tid]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const list = await getCustomers(tid);
      setCustomers(list);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(c: Customer) {
    if (!confirm(`Kunde „${c.display_name}" wirklich löschen?`)) return;
    try {
      await deleteCustomer(tid, c.id);
      setCustomers((cs) => cs.filter((x) => x.id !== c.id));
      toast('success', 'Kunde gelöscht');
    } catch (e) {
      toast('error', String(e));
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 16, fontSize: 13, color: 'var(--text-muted)' }}>
        <Link to="/tenants">Mandanten</Link>
        <span style={{ margin: '0 6px' }}>›</span>
        <span>Kunden</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>Kunden</h1>
          <p style={{ color: 'var(--text-muted)', marginTop: 2, fontSize: 12, fontFamily: 'monospace' }}>
            Tenant: {tid}
          </p>
        </div>
        <button className="primary" onClick={() => setShowForm(true)}>+ Kunde anlegen</button>
      </div>

      {error && <div className="error-box">{error}</div>}

      {showForm && (
        <CreateCustomerForm
          onCreated={(c) => { setCustomers([c, ...customers]); setShowForm(false); }}
          onCancel={() => setShowForm(false)}
          tenantId={tid}
        />
      )}

      {loading ? (
        <div className="card" style={{ overflow: 'hidden' }}>
          <SkeletonTable rows={5} cols={3} />
        </div>
      ) : customers.length === 0 ? (
        <div className="card empty">
          <p>Noch keine Kunden für diesen Mandanten.</p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table>
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Erstellt</th>
                <th scope="col" style={{ textAlign: 'right' }}></th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 500 }}>
                    <button
                      style={{ background: 'none', padding: 0, color: 'var(--blue)', fontWeight: 600, border: 'none', cursor: 'pointer', textAlign: 'left' }}
                      onClick={() => navigate(`/tenants/${tid}/customers/${c.id}`)}
                    >
                      {c.display_name}
                    </button>
                  </td>
                  <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                    {new Date(c.created_at).toLocaleDateString('de-DE')}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      className="secondary"
                      style={{ fontSize: 12, marginRight: 6 }}
                      onClick={() => navigate(`/tenants/${tid}/customers/${c.id}`)}
                    >
                      Öffnen
                    </button>
                    <button
                      className="danger"
                      style={{ fontSize: 12 }}
                      onClick={() => handleDelete(c)}
                    >
                      Löschen
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CreateCustomerForm({
  tenantId, onCreated, onCancel,
}: {
  tenantId: string;
  onCreated: (c: Customer) => void;
  onCancel: () => void;
}) {
  const [form, setForm]     = useState<CreateCustomerInput>({ name: '' });
  const [error, setError]   = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const c = await createCustomer(tenantId, form);
      onCreated(c);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card" style={{ padding: 20, marginBottom: 20 }}>
      <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Neuer Kunde</h2>
      {error && <div className="error-box">{error}</div>}
      <form onSubmit={submit}>
        <div className="field-grid-2">
          <div className="field">
            <label>Name *</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              placeholder="Max Mustermann"
            />
          </div>
          <div className="field">
            <label>E-Mail</label>
            <input
              type="email"
              value={form.email ?? ''}
              onChange={(e) => setForm({ ...form, email: e.target.value || undefined })}
              placeholder="max@example.com"
            />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="submit" className="primary" disabled={saving}>{saving ? 'Speichern…' : 'Anlegen'}</button>
          <button type="button" className="secondary" onClick={onCancel}>Abbrechen</button>
        </div>
      </form>
    </div>
  );
}
