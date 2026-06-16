/**
 * T059/A3 — Tenant-Selector (Topbar).
 *
 * Lädt die Mandanten (GET /api/v1/tenants) und setzt den aktiven Tenant
 * (localStorage via setActiveTenantId) → liefert `x-pp-tenant-id` für alle
 * belege-Endpoints. Beim Wechsel ein einfacher Reload, da die geladenen Daten
 * am aktiven Tenant hängen (PR 1; ein reaktiver Context kommt später).
 */
import { useEffect, useState } from 'react';
import { getActiveTenantId, getTenants, setActiveTenantId, type TenantListItem } from '../api';

export default function TenantSelector() {
  const [tenants, setTenants] = useState<TenantListItem[]>([]);
  const [active, setActive] = useState<string | null>(() => getActiveTenantId());
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getTenants()
      .then((list) => {
        if (!cancelled) setTenants(list);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function onChange(id: string) {
    if (!id) return;
    setActiveTenantId(id);
    setActive(id);
    window.location.reload();
  }

  if (failed) {
    return (
      <span className="tenant-selector-error" role="alert">
        Mandanten nicht ladbar
      </span>
    );
  }

  return (
    <select
      className="tenant-selector"
      aria-label="Aktiver Mandant"
      value={active ?? ''}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="" disabled>
        Mandant wählen…
      </option>
      {tenants.map((t) => (
        <option key={t.id} value={t.id}>
          {t.display_name}
        </option>
      ))}
    </select>
  );
}
