import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  getCustomer,
  getCustomerProfile,
  getCustomerProfileHistory,
  testLexofficeConnection,
  updateCustomerProfile,
} from '../api';
import type { ProfileHistoryEntry } from '../api';
import { SkeletonBlock } from '../components/Skeleton';
import { useToast } from '../components/ToastProvider';
import type {
  Customer,
  CustomerProfile,
  EnabledModules,
  ModuleKey,
  NotificationLanguage,
  SkrType,
} from '../types';
import { MODULE_META } from '../types';

interface ModuleConflict {
  module: ModuleKey;
  reason: string;
}

export default function CustomerProfilePage() {
  const { tenantId, customerId } = useParams<{ tenantId: string; customerId: string }>();
  const tid = tenantId!;
  const cid = customerId!;
  const navigate = useNavigate();
  const { toast } = useToast();

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [original, setOriginal] = useState<CustomerProfile | null>(null);
  const [draft, setDraft]       = useState<CustomerProfile | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [saving, setSaving]     = useState(false);

  // Lexoffice-Konfig
  const [showApiKey, setShowApiKey] = useState(false);
  const [lexTestState, setLexTestState] = useState<{ ok?: boolean; message?: string; busy?: boolean }>({});

  // Tax-ID Maskierung (separate Edit-State)
  const [editingTaxId, setEditingTaxId] = useState(false);

  // History-Drawer
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyEntries, setHistoryEntries] = useState<ProfileHistoryEntry[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);

  async function openHistory() {
    setHistoryOpen(true);
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const entries = await getCustomerProfileHistory(cid, tid, 20);
      setHistoryEntries(entries);
    } catch (e) {
      setHistoryError(e instanceof Error ? e.message : String(e));
    } finally {
      setHistoryLoading(false);
    }
  }

  useEffect(() => { load(); }, [cid, tid]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [c, p] = await Promise.all([
        getCustomer(tid, cid),
        getCustomerProfile(cid, tid),
      ]);
      // Falls Profile keinen display_name hat (frisches Profil), nimm den vom Customer
      const enriched: CustomerProfile = { ...p, display_name: p.display_name || c.display_name, tenant_id: p.tenant_id || tid };
      setCustomer(c);
      setOriginal(enriched);
      setDraft(enriched);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  const isDirty = useMemo(() => {
    if (!draft || !original) return false;
    return JSON.stringify(draft) !== JSON.stringify(original);
  }, [draft, original]);

  // beforeunload-Warnung bei dirty
  useEffect(() => {
    function handler(e: BeforeUnloadEvent) {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    }
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  const conflicts = useMemo<ModuleConflict[]>(() => {
    if (!draft) return [];
    const list: ModuleConflict[] = [];
    const m = draft.enabled_modules;
    if (m.m04_categorization && !m.m03_extraction)   list.push({ module: 'm04_categorization', reason: 'M04 benötigt M03 (Extraktion)' });
    if (m.m05_lexoffice && !m.m04_categorization)    list.push({ module: 'm05_lexoffice',      reason: 'M05 benötigt M04 (Kategorisierung)' });
    if (m.m08_reporting && !m.m07_notifications)     list.push({ module: 'm08_reporting',      reason: 'M08 benötigt M07 (Benachrichtigungen)' });
    return list;
  }, [draft]);

  function patch(fn: (d: CustomerProfile) => void) {
    if (!draft) return;
    const copy = JSON.parse(JSON.stringify(draft)) as CustomerProfile;
    fn(copy);
    setDraft(copy);
  }

  function setModule(key: ModuleKey, on: boolean) {
    patch((d) => {
      d.enabled_modules[key] = on;
      // Auto-disable abhängiger Module wenn Voraussetzung wegfällt
      if (!on) {
        if (key === 'm03_extraction') {
          d.enabled_modules.m04_categorization = false;
          d.enabled_modules.m05_lexoffice = false;
        }
        if (key === 'm04_categorization') {
          d.enabled_modules.m05_lexoffice = false;
        }
        if (key === 'm07_notifications') {
          d.enabled_modules.m08_reporting = false;
        }
      }
    });
  }

  function isModuleLocked(key: ModuleKey, mods: EnabledModules): { locked: boolean; reason?: string } {
    const meta = MODULE_META[key];
    if (!meta.requires) return { locked: false };
    for (const req of meta.requires) {
      if (!mods[req]) return { locked: true, reason: `Erfordert ${MODULE_META[req].id} (${MODULE_META[req].label})` };
    }
    return { locked: false };
  }

  async function save() {
    if (!draft || conflicts.length > 0) return;
    setSaving(true);
    // Optimistic Update: Original wird vorab gesetzt; bei Fehler wird zurückgerollt.
    const previous = original;
    setOriginal(draft);
    try {
      const updated = await updateCustomerProfile(cid, draft, tid);
      const enriched: CustomerProfile = { ...updated, display_name: updated.display_name || draft.display_name };
      setOriginal(enriched);
      setDraft(enriched);
      toast('success', 'Profil gespeichert');
    } catch (e) {
      // Rollback
      if (previous) setOriginal(previous);
      toast('error', `Speichern fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  async function testLexoffice() {
    if (!draft?.lexoffice_api_key) {
      toast('warning', 'Bitte zuerst API-Key eingeben');
      return;
    }
    setLexTestState({ busy: true });
    const result = await testLexofficeConnection(cid, draft.lexoffice_api_key, tid);
    setLexTestState({ ok: result.ok, message: result.message ?? (result.ok ? 'Verbindung erfolgreich' : 'Verbindung fehlgeschlagen') });
  }

  if (loading) return <SkeletonBlock height={400} />;
  if (error)   return <div className="error-box">{error}</div>;
  if (!customer || !draft) return null;

  const hasWhatsapp = !!draft.whatsapp_number?.trim();
  const m07NeedsNumber = draft.enabled_modules.m07_notifications && !hasWhatsapp;

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>
          {customer.display_name} — Profil
        </h1>
        {isDirty && (
          <span className="badge pending" style={{ fontWeight: 700 }}>
            ● Nicht gespeicherte Änderungen
          </span>
        )}
        <button
          type="button"
          className="ghost"
          onClick={openHistory}
          style={{ marginLeft: 'auto', fontSize: 13, padding: '6px 12px' }}
          title="Profil-Änderungsverlauf anzeigen"
        >
          Änderungsverlauf
        </button>
        <Link to={`/tenants/${tid}/customers/${cid}`} style={{ fontSize: 13 }}>
          ← Kundenakte
        </Link>
      </div>

      {historyOpen && (
        <div
          className="card"
          style={{ padding: 20, marginBottom: 20, border: '1px solid var(--border)' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Änderungsverlauf</h2>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Letzte 20 Profil-Versionen
            </span>
            <button
              type="button"
              className="ghost"
              onClick={() => setHistoryOpen(false)}
              style={{ marginLeft: 'auto', fontSize: 12, padding: '4px 10px' }}
            >
              Schließen
            </button>
          </div>
          {historyLoading && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Lade…</div>}
          {historyError && <div className="error-box">{historyError}</div>}
          {!historyLoading && !historyError && historyEntries.length === 0 && (
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              Keine Einträge vorhanden — das Profil wurde noch nicht aktualisiert.
            </div>
          )}
          {!historyLoading && historyEntries.length > 0 && (
            <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 600 }}>Datum</th>
                  <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 600 }}>Version</th>
                  <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 600 }}>Geändert von</th>
                  <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 600 }}>Zusammenfassung</th>
                </tr>
              </thead>
              <tbody>
                {historyEntries.map((e) => (
                  <tr key={e.history_id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '6px 8px' }}>{new Date(e.changed_at).toLocaleString('de-DE')}</td>
                    <td style={{ padding: '6px 8px' }}>v{e.profile_version}</td>
                    <td style={{ padding: '6px 8px' }}>{e.changed_by ?? 'system'}</td>
                    <td style={{ padding: '6px 8px', color: 'var(--text-muted)' }}>
                      {e.change_summary ?? '–'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <div className="card" style={{ padding: 28 }}>
        {/* ── Abschnitt 1: Stammdaten ─────────────────────────────────────── */}
        <Section title="Stammdaten" subtitle="Grundlegende Kundendaten">
          <div className="field-grid-2">
            <div className="field">
              <label htmlFor="display_name">Anzeigename *</label>
              <input
                id="display_name"
                required
                value={draft.display_name}
                onChange={(e) => patch((d) => { d.display_name = e.target.value; })}
              />
            </div>
            <div className="field">
              <label htmlFor="legal_name">Rechtsform / Firmenname</label>
              <input
                id="legal_name"
                value={draft.legal_name ?? ''}
                onChange={(e) => patch((d) => { d.legal_name = e.target.value; })}
              />
            </div>
          </div>

          <div className="field-grid-2">
            <div className="field">
              <label htmlFor="email">E-Mail</label>
              <input
                id="email"
                type="email"
                value={draft.email ?? ''}
                onChange={(e) => patch((d) => { d.email = e.target.value; })}
                placeholder="kontakt@firma.de"
              />
            </div>
            <div className="field">
              <label htmlFor="whatsapp_number">WhatsApp-Nummer</label>
              <input
                id="whatsapp_number"
                type="tel"
                value={draft.whatsapp_number ?? ''}
                onChange={(e) => patch((d) => { d.whatsapp_number = e.target.value; })}
                placeholder="+4917612345678"
              />
            </div>
          </div>

          <div className="field-grid-2">
            <div className="field">
              <label htmlFor="tax_id">Steuer-ID</label>
              {editingTaxId ? (
                <input
                  id="tax_id"
                  autoFocus
                  value={draft.tax_id ?? ''}
                  onChange={(e) => patch((d) => { d.tax_id = e.target.value; })}
                  onBlur={() => setEditingTaxId(false)}
                  placeholder="DE123456789"
                />
              ) : (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    readOnly
                    value={maskTaxId(draft.tax_id)}
                    onClick={() => setEditingTaxId(true)}
                    style={{ cursor: 'pointer', flex: 1 }}
                  />
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => setEditingTaxId(true)}
                    style={{ padding: '7px 12px' }}
                  >
                    Bearbeiten
                  </button>
                </div>
              )}
            </div>
            <div className="field">
              <label>Kontenrahmen</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {(['SKR03', 'SKR04'] as SkrType[]).map((skr) => (
                  <button
                    type="button"
                    key={skr}
                    className={draft.skr_type === skr ? 'primary' : 'secondary'}
                    onClick={() => patch((d) => { d.skr_type = skr; })}
                    style={{ flex: 1 }}
                  >
                    {skr}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Section>

        {/* ── Abschnitt 2: Module ─────────────────────────────────────────── */}
        <Section title="Aktive Module" subtitle="Welche Funktionen sollen für diesen Kunden laufen?">
          {(Object.keys(MODULE_META) as ModuleKey[]).map((key) => {
            const meta = MODULE_META[key];
            const lockInfo = isModuleLocked(key, draft.enabled_modules);
            const isOn = draft.enabled_modules[key];
            const showWhatsappHint = key === 'm07_notifications' && isOn && !hasWhatsapp;

            return (
              <div key={key} className={`module-card${isOn ? ' enabled' : ''}${lockInfo.locked ? ' locked' : ''}`}>
                <button
                  type="button"
                  className={`toggle${isOn ? ' on' : ''}`}
                  disabled={lockInfo.locked}
                  onClick={() => setModule(key, !isOn)}
                  aria-pressed={isOn}
                  title={lockInfo.locked ? lockInfo.reason : undefined}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div>
                    <span className="module-card-id">{meta.id}</span>
                    <span className="module-card-label">{meta.label}</span>
                  </div>
                  <div className="module-card-meta">
                    {meta.description}
                    {lockInfo.locked && (
                      <span style={{ color: 'var(--orange)', marginLeft: 8 }}>· {lockInfo.reason}</span>
                    )}
                    {showWhatsappHint && (
                      <span style={{ color: 'var(--orange)', marginLeft: 8 }}>· WhatsApp-Nummer fehlt</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {m07NeedsNumber && (
            <div className="warn-box" style={{ marginTop: 8 }}>
              ⚠ M07 ist aktiv, aber es ist keine WhatsApp-Nummer hinterlegt. Bestätigungen können nicht versendet werden.
            </div>
          )}
        </Section>

        {/* ── Abschnitt 3: Lexoffice (nur sichtbar wenn M05 aktiv) ────────── */}
        {draft.enabled_modules.m05_lexoffice && (
          <Section title="Lexoffice-Konfiguration" subtitle="API-Zugang für den Voucher-Push">
            <div className="field">
              <label htmlFor="lex_api_key">API-Key</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  id="lex_api_key"
                  type={showApiKey ? 'text' : 'password'}
                  value={draft.lexoffice_api_key ?? ''}
                  onChange={(e) => {
                    patch((d) => { d.lexoffice_api_key = e.target.value; });
                    setLexTestState({});
                  }}
                  autoComplete="new-password"
                  style={{ flex: 1 }}
                  placeholder="lxo_..."
                />
                <button
                  type="button"
                  className="ghost"
                  onClick={() => setShowApiKey(!showApiKey)}
                  style={{ padding: '7px 12px' }}
                >
                  {showApiKey ? 'Verbergen' : 'Anzeigen'}
                </button>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                Aus Lexoffice → Einstellungen → Öffentliche API
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="secondary"
                onClick={testLexoffice}
                disabled={lexTestState.busy || !draft.lexoffice_api_key}
              >
                {lexTestState.busy ? <span className="spinner" /> : '🔌'} Verbindung testen
              </button>
              {lexTestState.message && (
                <span style={{
                  fontSize: 13,
                  color: lexTestState.ok ? 'var(--green)' : '#f87171',
                  fontWeight: 500,
                }}>
                  {lexTestState.ok ? '✓ ' : '✕ '}{lexTestState.message}
                </span>
              )}
            </div>
          </Section>
        )}

        {/* ── Abschnitt 4: Benachrichtigungen ─────────────────────────────── */}
        <Section title="Benachrichtigungen" subtitle="Sprache und Versand-Optionen">
          <div className="field">
            <label>Sprache</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {([['de', 'Deutsch'], ['en', 'English']] as Array<[NotificationLanguage, string]>).map(([code, label]) => (
                <button
                  type="button"
                  key={code}
                  className={draft.notification_language === code ? 'primary' : 'secondary'}
                  onClick={() => patch((d) => { d.notification_language = code; })}
                  style={{ flex: 1 }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={draft.whatsapp_confirmation ?? false}
                onChange={(e) => patch((d) => { d.whatsapp_confirmation = e.target.checked; })}
                style={{ width: 'auto' }}
              />
              <span>WhatsApp-Bestätigung nach jedem Beleg</span>
            </label>
          </div>
          <div className="field">
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={draft.whatsapp_monthly_report ?? false}
                onChange={(e) => patch((d) => { d.whatsapp_monthly_report = e.target.checked; })}
                style={{ width: 'auto' }}
              />
              <span>Monatsbericht per WhatsApp</span>
            </label>
          </div>
        </Section>

        {/* Conflicts-Warnung */}
        {conflicts.length > 0 && (
          <div className="error-box" style={{ marginBottom: 0 }}>
            <strong>Konfigurations-Konflikt:</strong>
            <ul style={{ marginTop: 4, paddingLeft: 18 }}>
              {conflicts.map((c) => <li key={c.module}>{c.reason}</li>)}
            </ul>
          </div>
        )}

        {/* Footer */}
        <div style={{ marginTop: 28, paddingTop: 20, borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            type="button"
            className="primary"
            disabled={saving || !isDirty || conflicts.length > 0}
            onClick={save}
          >
            {saving ? 'Speichern…' : 'Speichern'}
          </button>
          <button
            type="button"
            className="ghost"
            disabled={saving || !isDirty}
            onClick={() => original && setDraft(original)}
          >
            Zurücksetzen
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => navigate(`/tenants/${tid}/customers/${cid}`)}
            style={{ marginLeft: 'auto' }}
          >
            Schließen
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Sub-Components ────────────────────────────────────────────────────────────

function Section({
  title, subtitle, children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700 }}>{title}</h2>
        {subtitle && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{subtitle}</div>}
      </div>
      {children}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function maskTaxId(taxId?: string): string {
  if (!taxId) return '';
  if (taxId.length <= 4) return taxId;
  return '••••••••' + taxId.slice(-3);
}
