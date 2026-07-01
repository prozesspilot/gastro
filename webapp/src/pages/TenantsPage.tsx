import { useEffect, useState } from 'react';
import {
  ApiError,
  createTenant,
  type CreateTenantInput,
  getTenants,
  setActiveTenantId,
  type TenantListItem,
  type TenantPackage,
} from '../api';
import { SkeletonTable } from '../components/Skeleton';

/**
 * A3-Reboot (T059): read-only Mandanten-Liste.
 * T093: Anlage „Neuer Kunde" (Sales/Staff legt den Mandanten an — der Wirt
 * registriert sich NICHT selbst, vgl. Onboarding_Wizard.md §1.2/§1.3).
 */
export default function TenantsPage() {
  const [tenants, setTenants] = useState<TenantListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

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

  function handleCreated(created: TenantListItem) {
    // Neuen Mandanten sofort oben einreihen (kein Reload nötig).
    setTenants((prev) => [created, ...prev.filter((t) => t.id !== created.id)]);
    setShowForm(false);
  }

  return (
    <div>
      <div
        style={{
          marginBottom: 20,
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>Mandanten</h1>
          <p style={{ color: 'var(--text-muted)', marginTop: 2 }}>
            {tenants.length} Mandant{tenants.length !== 1 ? 'en' : ''}
          </p>
        </div>
        {!showForm && (
          <button
            type="button"
            className="primary"
            data-testid="btn-new-tenant"
            onClick={() => setShowForm(true)}
          >
            + Neuer Kunde
          </button>
        )}
      </div>

      {showForm && (
        <NewTenantForm onCreated={handleCreated} onCancel={() => setShowForm(false)} />
      )}

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

/** Anlage-Formular für einen neuen Mandanten. */
function NewTenantForm({
  onCreated,
  onCancel,
}: {
  onCreated: (t: TenantListItem) => void;
  onCancel: () => void;
}) {
  const [displayName, setDisplayName] = useState('');
  const [legalName, setLegalName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [pkg, setPkg] = useState<TenantPackage>('standard');
  const [slug, setSlug] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const canSubmit = displayName.trim().length >= 3 && !submitting;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setFormError(null);

    const input: CreateTenantInput = {
      display_name: displayName.trim(),
      package: pkg,
      ...(legalName.trim() ? { legal_name: legalName.trim() } : {}),
      ...(contactEmail.trim() ? { contact_email: contactEmail.trim() } : {}),
      ...(contactPhone.trim() ? { contact_phone: contactPhone.trim() } : {}),
      ...(slug.trim() ? { slug: slug.trim() } : {}),
    };

    try {
      const created = await createTenant(input);
      onCreated(created);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Anlegen fehlgeschlagen.');
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      aria-label="Neuen Mandanten anlegen"
      className="card"
      style={{ padding: 20, marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 14 }}
    >
      <h2 style={{ fontSize: 16, fontWeight: 700 }}>Neuen Kunden anlegen</h2>

      {formError && (
        <div className="error-box" data-testid="new-tenant-error">
          {formError}
        </div>
      )}

      <div className="field">
        <label htmlFor="nt-display-name">Firmenname / Gastro-Name *</label>
        <input
          id="nt-display-name"
          data-testid="input-display-name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="z. B. Pizzeria Bella Italia"
          maxLength={120}
          required
        />
      </div>

      <div className="field">
        <label htmlFor="nt-legal-name">Firmenname laut Gewerbeschein (optional)</label>
        <input
          id="nt-legal-name"
          data-testid="input-legal-name"
          value={legalName}
          onChange={(e) => setLegalName(e.target.value)}
          maxLength={200}
        />
      </div>

      <div className="field">
        <label htmlFor="nt-contact-email">Kontakt-E-Mail (für den Setup-Link)</label>
        <input
          id="nt-contact-email"
          data-testid="input-contact-email"
          type="email"
          value={contactEmail}
          onChange={(e) => setContactEmail(e.target.value)}
          placeholder="wirt@example.de"
        />
      </div>

      <div className="field">
        <label htmlFor="nt-contact-phone">Telefon (optional)</label>
        <input
          id="nt-contact-phone"
          data-testid="input-contact-phone"
          value={contactPhone}
          onChange={(e) => setContactPhone(e.target.value)}
          maxLength={40}
        />
      </div>

      <div className="field">
        <label htmlFor="nt-package">Paket</label>
        <select
          id="nt-package"
          data-testid="select-package"
          value={pkg}
          onChange={(e) => setPkg(e.target.value as TenantPackage)}
        >
          <option value="solo">Solo</option>
          <option value="standard">Standard</option>
          <option value="pro">Pro</option>
          <option value="filiale">Filiale</option>
        </select>
      </div>

      <div className="field">
        <label htmlFor="nt-slug">Slug (optional — sonst aus dem Namen erzeugt)</label>
        <input
          id="nt-slug"
          data-testid="input-slug"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder="pizzeria-bella-italia"
          maxLength={60}
        />
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
        <button type="button" className="secondary" onClick={onCancel} disabled={submitting}>
          Abbrechen
        </button>
        <button
          type="submit"
          className="primary"
          data-testid="btn-create-tenant"
          disabled={!canSubmit}
        >
          {submitting ? 'Wird angelegt…' : 'Anlegen'}
        </button>
      </div>
    </form>
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
