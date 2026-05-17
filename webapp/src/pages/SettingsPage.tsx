import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  createCustomer,
  createTenant,
  fetchCustomers,
  fetchHealth,
  fetchReady,
  fetchReceipts,
  fetchTenants,
  pingUrl,
  updateReceiptStatus,
  uploadReceipt,
} from '../api';
import {
  requestDeletion,
  exportCustomerData,
  getPiiInventory,
  type PiiInventoryEntry,
} from '../api/dsgvo';
import type { Tenant } from '../types';

type ConnectionState = 'idle' | 'checking' | 'ok' | 'fail';

interface ConnectionRow {
  id: 'backend' | 'n8n' | 'postgres' | 'redis';
  label: string;
  url: string;
  state: ConnectionState;
  detail: string;
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const N8N_URL = import.meta.env.VITE_N8N_URL || 'http://localhost:5678';

const TOGGLE_STORAGE_KEY = 'pp_processing_settings';

interface ProcessingSettings {
  autoOcr: boolean;
  autoCategorize: boolean;
}

function readToggles(): ProcessingSettings {
  try {
    const raw = window.localStorage.getItem(TOGGLE_STORAGE_KEY);
    if (raw) return { autoOcr: false, autoCategorize: false, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { autoOcr: true, autoCategorize: true };
}

function writeToggles(s: ProcessingSettings) {
  window.localStorage.setItem(TOGGLE_STORAGE_KEY, JSON.stringify(s));
}

export default function SettingsPage() {
  const [conns, setConns] = useState<ConnectionRow[]>([
    { id: 'backend',  label: 'Backend API',     url: '/api/v1',                 state: 'idle', detail: '' },
    { id: 'n8n',      label: 'n8n Workflows',   url: N8N_URL,                    state: 'idle', detail: '' },
    { id: 'postgres', label: 'PostgreSQL',      url: 'via /ready',               state: 'idle', detail: '' },
    { id: 'redis',    label: 'Redis Streams',   url: 'via /ready',               state: 'idle', detail: '' },
  ]);

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantStats, setTenantStats] = useState<Record<string, { customers: number }>>({});
  const [tenantsLoading, setTenantsLoading] = useState(true);

  const [toggles, setToggles] = useState<ProcessingSettings>(readToggles);

  const [seedBusy, setSeedBusy] = useState(false);
  const [seedMsg, setSeedMsg] = useState<{ ok?: string; err?: string } | null>(null);
  const [resetText, setResetText] = useState('');
  const [resetBusy, setResetBusy] = useState(false);

  const [testBusy, setTestBusy] = useState(false);
  const [testMsg, setTestMsg] = useState<string | null>(null);

  // ── DSGVO-State ──────────────────────────────────────────────────────────
  const [dsgvoCustomerId, setDsgvoCustomerId] = useState('');
  const [dsgvoRequestedBy, setDsgvoRequestedBy] = useState('');
  const [dsgvoReason, setDsgvoReason] = useState('');
  const [dsgvoBusy, setDsgvoBusy] = useState(false);
  const [dsgvoMsg, setDsgvoMsg] = useState<{ ok?: string; err?: string } | null>(null);
  const [piiInventory, setPiiInventory] = useState<PiiInventoryEntry[]>([]);
  const [piiLoading, setPiiLoading] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportCustomerId, setExportCustomerId] = useState('');

  // ── Bei Mount: alle Connections prüfen + Tenants laden ───────────────────
  useEffect(() => {
    checkAllConnections();
    loadTenants();
  }, []);

  useEffect(() => { writeToggles(toggles); }, [toggles]);

  async function loadTenants() {
    setTenantsLoading(true);
    try {
      const list = await fetchTenants();
      setTenants(list);
      const stats: Record<string, { customers: number }> = {};
      await Promise.all(
        list.map(async (t) => {
          try {
            const c = await fetchCustomers(t.id);
            stats[t.id] = { customers: c.length };
          } catch {
            stats[t.id] = { customers: 0 };
          }
        }),
      );
      setTenantStats(stats);
    } catch {
      setTenants([]);
    } finally {
      setTenantsLoading(false);
    }
  }

  async function checkConnection(id: ConnectionRow['id']) {
    setConns((prev) => prev.map((c) => c.id === id ? { ...c, state: 'checking', detail: '' } : c));

    try {
      if (id === 'backend') {
        const h = await fetchHealth();
        // Backend liefert { ok: boolean, uptime: number, version: string }
        const statusLabel = h.ok ? 'ok' : 'degraded';
        updateConn('backend', 'ok', `Status: ${statusLabel}${h.uptime ? ` · ${Math.round(h.uptime)}s uptime` : ''}`);
      } else if (id === 'n8n') {
        // n8n wird über den Vite-Proxy geprüft (/n8n → localhost:5678),
        // um Cross-Origin-Blockierungen im Browser zu umgehen.
        const reachable = await pingUrl('/n8n/healthz');
        updateConn('n8n', reachable ? 'ok' : 'fail', reachable ? 'Erreichbar' : 'Nicht erreichbar');
      } else if (id === 'postgres' || id === 'redis') {
        const ready = await fetchReady();
        if (id === 'postgres') {
          // Backend liefert: ready.db.connected
          const connected = ready.db?.connected ?? false;
          const detail = connected
            ? `Verbunden${ready.db?.active_connections != null ? ` · ${ready.db.active_connections} Verbindungen` : ''}`
            : 'Nicht erreichbar';
          updateConn('postgres', connected ? 'ok' : 'fail', detail);
        } else {
          // Backend liefert: ready.redis.connected
          const connected = ready.redis?.connected ?? false;
          updateConn('redis', connected ? 'ok' : 'fail', connected ? 'Verbunden' : 'Nicht erreichbar');
        }
      }
    } catch (e) {
      updateConn(id, 'fail', e instanceof Error ? e.message : 'Fehler');
    }
  }

  function updateConn(id: ConnectionRow['id'], state: ConnectionState, detail: string) {
    setConns((prev) => prev.map((c) => c.id === id ? { ...c, state, detail } : c));
  }

  async function checkAllConnections() {
    await Promise.all([
      checkConnection('backend'),
      checkConnection('n8n'),
      checkConnection('postgres'),
      checkConnection('redis'),
    ]);
  }

  // ── Seed ────────────────────────────────────────────────────────────────
  async function seedDemo() {
    setSeedBusy(true);
    setSeedMsg(null);
    try {
      const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
      const tenant = await createTenant({ name: `Demo-Mandant ${stamp}`, slug: `demo-${stamp}` });
      const names = ['Max Mustermann', 'Erika Beispiel', 'Hans Schuster'];
      for (const n of names) {
        await createCustomer(tenant.id, {
          name: n,
          email: `${n.toLowerCase().replace(/\s+/g, '.')}@example.com`,
        });
      }
      setSeedMsg({ ok: `„${tenant.name}" + ${names.length} Test-Kunden angelegt.` });
      loadTenants();
    } catch (e) {
      setSeedMsg({ err: e instanceof Error ? e.message : 'Seed fehlgeschlagen' });
    } finally {
      setSeedBusy(false);
    }
  }

  // ── Test-Beleg ──────────────────────────────────────────────────────────
  async function processTestReceipt() {
    setTestBusy(true);
    setTestMsg(null);
    try {
      const ts = await fetchTenants();
      const tenant = ts[0];
      if (!tenant) throw new Error('Kein Tenant vorhanden — bitte zuerst Seed-Daten anlegen.');

      const cs = await fetchCustomers(tenant.id);
      const customer = cs[0];
      if (!customer) throw new Error('Kein Kunde im Tenant — bitte zuerst Kunden anlegen.');

      // Test-Beleg als File-Stub
      const stub = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], `test-receipt-${Date.now()}.pdf`, { type: 'application/pdf' });
      const receipt = await uploadReceipt(customer.id, stub);

      // simulieren: kurze Verzögerung, dann auf completed
      await new Promise((r) => setTimeout(r, 800));
      await updateReceiptStatus(receipt.id, 'done');

      setTestMsg(`Test-Beleg #${receipt.id.substring(0, 8)} im Mandanten „${tenant.name}" angelegt und auf „completed" gesetzt.`);
    } catch (e) {
      setTestMsg(e instanceof Error ? e.message : 'Test-Beleg fehlgeschlagen');
    } finally {
      setTestBusy(false);
    }
  }

  // ── Daten zurücksetzen (lokal) ──────────────────────────────────────────
  async function resetLocal() {
    setResetBusy(true);
    try {
      const ts = await fetchTenants();
      const seedTenants = ts.filter((t) => t.slug.startsWith('demo-'));
      // Backend hat kein DELETE — wir entfernen Receipts der Seed-Tenants soft (status=error)
      let cleaned = 0;
      for (const t of seedTenants) {
        try {
          // Aktiver Tenant-Header wird vom Client gesetzt — vor jedem Aufruf umstellen
          localStorage.setItem('pp_tenant_id', t.id);
          const receipts = await fetchReceipts(undefined);
          for (const r of receipts) {
            await updateReceiptStatus(r.id, 'error');
            cleaned++;
          }
        } catch { /* ignore */ }
      }
      window.localStorage.removeItem('pp_onboarding_skipped');
      setSeedMsg({ ok: `${cleaned} Receipts in Demo-Mandanten als „error" markiert (lokaler Reset).` });
      setResetText('');
    } catch (e) {
      setSeedMsg({ err: e instanceof Error ? e.message : 'Reset fehlgeschlagen' });
    } finally {
      setResetBusy(false);
    }
  }

  // ── CSV-Export aller Receipts ───────────────────────────────────────────
  async function exportAllCsv() {
    try {
      const ts = await fetchTenants();
      const allRows: Array<{
        tenant: string; tenantId: string; receiptId: string;
        name: string; source: string; status: string; createdAt: string;
      }> = [];
      for (const t of ts) {
        try {
          localStorage.setItem('pp_tenant_id', t.id);
          const rs = await fetchReceipts(undefined);
          for (const r of rs) {
            allRows.push({
              tenant: t.name,
              tenantId: t.id,
              receiptId: r.id,
              name: r.extracted_data?.vendor_name ?? r.file_name ?? '',
              source: r.file_type,
              status: r.status,
              createdAt: r.created_at,
            });
          }
        } catch { /* skip */ }
      }
      const header = ['tenant', 'tenant_id', 'receipt_id', 'original_name', 'source', 'status', 'created_at'];
      const lines = [header.join(',')];
      for (const r of allRows) {
        lines.push([
          csvEscape(r.tenant), r.tenantId, r.receiptId, csvEscape(r.name), r.source, r.status, r.createdAt,
        ].join(','));
      }
      const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `belege-export-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setSeedMsg({ err: e instanceof Error ? e.message : 'Export fehlgeschlagen' });
    }
  }

  return (
    <div>
      {/* ── Header ── */}
      <div className="page-header">
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-subtle)', marginBottom: 6 }}>
            KONFIGURATION
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.8px' }}>
            <span className="gradient-text">Einstellungen</span> ⚙️
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 6 }}>
            System-Verbindungen, Mandanten und Datenverwaltung
          </p>
        </div>
      </div>

      {/* ── 1. Verbindungen ── */}
      <div className="card" style={{ padding: 24, marginBottom: 20 }}>
        <div className="section-header">
          <span className="section-title">Verbindungen</span>
          <button className="ghost" onClick={checkAllConnections}>
            ↻ Alle prüfen
          </button>
        </div>

        {conns.map((c) => (
          <div key={c.id} className="conn-row">
            <span className={`conn-dot ${c.state === 'ok' ? 'green' : c.state === 'fail' ? 'red' : 'gray'}`} aria-hidden="true" />
            <div className="conn-info">
              <div className="conn-name">{c.label}</div>
              <div className="conn-status">
                <code style={{ background: 'transparent', padding: 0, color: 'var(--text-subtle)' }}>{c.url}</code>
                {c.detail && <span style={{ marginLeft: 8 }}>· {c.detail}</span>}
              </div>
            </div>
            <button
              className="secondary"
              onClick={() => checkConnection(c.id)}
              disabled={c.state === 'checking'}
              style={{ flexShrink: 0 }}
            >
              {c.state === 'checking' && <span className="spinner" style={{ width: 12, height: 12 }} />}
              {c.state === 'checking' ? 'Prüfe…' : 'Verbinden testen'}
            </button>
          </div>
        ))}
      </div>

      {/* ── 2. Mandanten & Module ── */}
      <div className="card" style={{ padding: 24, marginBottom: 20 }}>
        <div className="section-header">
          <span className="section-title">Mandanten & Module</span>
          <Link to="/tenants" style={{ fontSize: 13 }}>Verwalten →</Link>
        </div>

        {tenantsLoading ? (
          <div className="loading-center">
            <span className="spinner" />
            Wird geladen…
          </div>
        ) : tenants.length === 0 ? (
          <div style={{ padding: '20px 0', color: 'var(--text-subtle)', fontSize: 13, textAlign: 'center' }}>
            Noch keine Mandanten vorhanden.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {tenants.map((t) => (
              <div key={t.id} style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: '12px 16px',
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{t.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace', marginTop: 2 }}>
                    {t.slug}
                  </div>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  <strong style={{ color: 'var(--text)' }}>{tenantStats[t.id]?.customers ?? 0}</strong> Kunden
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <span className="module-chip" style={{ fontSize: 11, padding: '2px 8px' }}>M01</span>
                  <span className="module-chip" style={{ fontSize: 11, padding: '2px 8px' }}>M02</span>
                </div>
                <Link to={`/tenants/${t.id}/customers`} style={{ fontSize: 12, marginLeft: 'auto' }}>
                  Kunden →
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── 3. Verarbeitung ── */}
      <div className="card" style={{ padding: 24, marginBottom: 20 }}>
        <div className="section-header">
          <span className="section-title">Verarbeitung</span>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.5 }}>
          Diese Einstellungen werden lokal gespeichert und vom Upload-Flow respektiert.
        </p>

        <ToggleRow
          checked={toggles.autoOcr}
          onChange={(v) => setToggles((s) => ({ ...s, autoOcr: v }))}
          title="Automatische OCR nach Upload"
          sub="Belege werden direkt nach dem Upload mit Google Vision durch OCR geschickt."
        />

        <ToggleRow
          checked={toggles.autoCategorize}
          onChange={(v) => setToggles((s) => ({ ...s, autoCategorize: v }))}
          title="Automatische Kategorisierung nach OCR"
          sub="Sobald OCR-Text vorliegt, wird Claude zur Kategorisierung aufgerufen."
        />
      </div>

      {/* ── 4. Daten ── */}
      <div className="card" style={{ padding: 24, marginBottom: 20 }}>
        <div className="section-header">
          <span className="section-title">Daten</span>
        </div>

        {seedMsg?.ok && <div className="success-box">{seedMsg.ok}</div>}
        {seedMsg?.err && <div className="error-box">{seedMsg.err}</div>}
        {testMsg && <div className="success-box">{testMsg}</div>}

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
          <button className="secondary" onClick={exportAllCsv}>
            📥 Alle Belege als CSV
          </button>
          <button className="secondary" onClick={processTestReceipt} disabled={testBusy}>
            {testBusy && <span className="spinner" />}
            🧪 Test-Beleg verarbeiten
          </button>
          <button className="primary" onClick={seedDemo} disabled={seedBusy}>
            {seedBusy && <span className="spinner" />}
            + Testdaten anlegen
          </button>
        </div>

        {/* Danger Zone */}
        <div style={{
          background: 'rgba(248,113,113,0.04)',
          border: '1px solid rgba(248,113,113,0.18)',
          borderRadius: 'var(--radius)',
          padding: 16,
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, color: '#f87171', marginBottom: 8 }}>
            ⚠ Danger Zone
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.5 }}>
            Markiert alle Belege in Demo-Mandanten (slug beginnt mit „demo-") als Fehler. Setzt zusätzlich den Onboarding-Status zurück.
            Tippen Sie <code>RESET</code> um zu bestätigen.
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            <input
              type="text"
              placeholder="RESET"
              value={resetText}
              onChange={(e) => setResetText(e.target.value)}
              style={{ flex: 1 }}
              aria-label="Reset bestätigen"
            />
            <button
              className="danger"
              onClick={resetLocal}
              disabled={resetText !== 'RESET' || resetBusy}
            >
              {resetBusy && <span className="spinner" />}
              Zurücksetzen
            </button>
          </div>
        </div>
      </div>

      {/* ── 5. DSGVO / Datenschutz ── */}
      <div className="card" style={{ padding: 24, marginBottom: 20 }}>
        <div className="section-header">
          <span className="section-title">DSGVO / Datenschutz</span>
        </div>

        {dsgvoMsg?.ok && <div className="success-box" style={{ marginBottom: 14 }}>{dsgvoMsg.ok}</div>}
        {dsgvoMsg?.err && <div className="error-box" style={{ marginBottom: 14 }}>{dsgvoMsg.err}</div>}

        {/* Datenkopie */}
        <div style={{ marginBottom: 20, paddingBottom: 20, borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Datenkopie anfordern (Art. 20 DSGVO)</div>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 10, lineHeight: 1.5 }}>
            Exportiert alle gespeicherten Daten eines Kunden als JSON-Datei.
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            <input
              type="text"
              placeholder="customer_id"
              value={exportCustomerId}
              onChange={(e) => setExportCustomerId(e.target.value)}
              style={{ flex: 1 }}
              aria-label="Customer ID fuer Export"
            />
            <button
              className="secondary"
              disabled={exportBusy || !exportCustomerId.trim()}
              onClick={async () => {
                setExportBusy(true);
                setDsgvoMsg(null);
                try {
                  const data = await exportCustomerData(exportCustomerId.trim());
                  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `dsgvo-export-${exportCustomerId}.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                  setDsgvoMsg({ ok: 'Datenexport gestartet.' });
                } catch (e) {
                  setDsgvoMsg({ err: e instanceof Error ? e.message : 'Export fehlgeschlagen' });
                } finally {
                  setExportBusy(false);
                }
              }}
            >
              {exportBusy && <span className="spinner" />}
              Daten exportieren
            </button>
          </div>
        </div>

        {/* Datenlöschung */}
        <div style={{ marginBottom: 20, paddingBottom: 20, borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Datenlöschung beantragen (Art. 17 DSGVO)</div>
          <div style={{
            background: 'rgba(248,113,113,0.06)',
            border: '1px solid rgba(248,113,113,0.2)',
            borderRadius: 'var(--radius)',
            padding: 12,
            marginBottom: 12,
            fontSize: 13,
            color: '#fca5a5',
          }}>
            Dieser Vorgang loescht ALLE Belege und Daten des Kunden unwiderruflich.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input
              type="text"
              placeholder="customer_id (leer = ganzer Tenant)"
              value={dsgvoCustomerId}
              onChange={(e) => setDsgvoCustomerId(e.target.value)}
              aria-label="Customer ID fuer Loeschung"
            />
            <input
              type="email"
              placeholder="Angefordert von (E-Mail) *"
              value={dsgvoRequestedBy}
              onChange={(e) => setDsgvoRequestedBy(e.target.value)}
              required
              aria-label="Angefordert von"
            />
            <input
              type="text"
              placeholder="Begruendung (optional)"
              value={dsgvoReason}
              onChange={(e) => setDsgvoReason(e.target.value)}
              aria-label="Begruendung"
            />
            <button
              className="danger"
              disabled={dsgvoBusy || !dsgvoRequestedBy.trim()}
              onClick={async () => {
                setDsgvoBusy(true);
                setDsgvoMsg(null);
                try {
                  const req = await requestDeletion({
                    customer_id: dsgvoCustomerId.trim() || undefined,
                    requested_by: dsgvoRequestedBy.trim(),
                    reason: dsgvoReason.trim() || undefined,
                  });
                  setDsgvoMsg({
                    ok: `Loeschantrag eingereicht (ID: ${req.request_id}). Status: ${req.status}.`,
                  });
                  setDsgvoCustomerId('');
                  setDsgvoRequestedBy('');
                  setDsgvoReason('');
                } catch (e) {
                  setDsgvoMsg({ err: e instanceof Error ? e.message : 'Antrag fehlgeschlagen' });
                } finally {
                  setDsgvoBusy(false);
                }
              }}
            >
              {dsgvoBusy && <span className="spinner" />}
              Loeschantrag einreichen
            </button>
          </div>
        </div>

        {/* PII-Inventar */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>PII-Inventar</div>
            <button
              className="ghost"
              disabled={piiLoading}
              onClick={async () => {
                setPiiLoading(true);
                try {
                  const data = await getPiiInventory();
                  setPiiInventory(data.inventory);
                } catch {
                  setDsgvoMsg({ err: 'PII-Inventar konnte nicht geladen werden' });
                } finally {
                  setPiiLoading(false);
                }
              }}
            >
              {piiLoading && <span className="spinner" />}
              Laden
            </button>
          </div>
          {piiInventory.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ color: 'var(--text-subtle)', textAlign: 'left' }}>
                    <th style={{ padding: '4px 8px', fontWeight: 600 }}>Tabelle</th>
                    <th style={{ padding: '4px 8px', fontWeight: 600 }}>PII-Felder</th>
                    <th style={{ padding: '4px 8px', fontWeight: 600 }}>Verschluesselt</th>
                    <th style={{ padding: '4px 8px', fontWeight: 600 }}>Rechtsgrundlage</th>
                  </tr>
                </thead>
                <tbody>
                  {piiInventory.map((entry) => (
                    <tr key={entry.table} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '6px 8px', fontFamily: 'monospace', fontWeight: 600 }}>{entry.table}</td>
                      <td style={{ padding: '6px 8px', color: 'var(--text-muted)' }}>
                        {entry.fields.join(', ')}
                      </td>
                      <td style={{ padding: '6px 8px' }}>
                        {entry.encrypted.length > 0 ? (
                          <span style={{ color: '#34d399' }}>{entry.encrypted.join(', ')}</span>
                        ) : (
                          <span style={{ color: 'var(--text-subtle)' }}>-</span>
                        )}
                      </td>
                      <td style={{ padding: '6px 8px', color: 'var(--text-muted)', fontSize: 11 }}>
                        {entry.basis}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── 6. Über ── */}
      <div className="card" style={{ padding: 24 }}>
        <div className="section-header">
          <span className="section-title">Über ProzessPilot</span>
          <span style={{ fontSize: 12, color: 'var(--text-subtle)' }}>v0.1.0 · dev</span>
        </div>

        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 18, lineHeight: 1.7 }}>
          ProzessPilot ist eine modulare Steuerberater-Suite für die automatisierte Verarbeitung
          von Belegen aus WhatsApp, E-Mail und manuellem Upload. Die Plattform ist mandantenfähig
          und lässt sich pro Kunde individuell konfigurieren.
        </p>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          <span className="module-chip">React 18</span>
          <span className="module-chip">TypeScript</span>
          <span className="module-chip">Vite</span>
          <span className="module-chip">Fastify</span>
          <span className="module-chip">PostgreSQL</span>
          <span className="module-chip">Redis Streams</span>
          <span className="module-chip">n8n</span>
          <span className="module-chip">Claude API</span>
        </div>

        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 13 }}>
          <a href={`${API_URL}/api/v1/health`} target="_blank" rel="noopener noreferrer">
            🩺 Health-Check
          </a>
          <a href={N8N_URL} target="_blank" rel="noopener noreferrer">
            🔄 n8n öffnen
          </a>
          <a href={`${API_URL}/docs`} target="_blank" rel="noopener noreferrer">
            📚 API-Dokumentation
          </a>
        </div>
      </div>
    </div>
  );
}

function ToggleRow({
  checked, onChange, title, sub,
}: {
  checked: boolean; onChange: (v: boolean) => void; title: string; sub: string;
}) {
  return (
    <label className="toggle-row" style={{ cursor: 'pointer' }}>
      <div className="toggle-text">
        <div className="toggle-title">{title}</div>
        <div className="toggle-sub">{sub}</div>
      </div>
      <span className="toggle">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          aria-label={title}
        />
        <span className="toggle-slider" />
      </span>
    </label>
  );
}

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
