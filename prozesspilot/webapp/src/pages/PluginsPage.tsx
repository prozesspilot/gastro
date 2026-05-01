/**
 * Plugin-System Verwaltungsseite
 * Listet alle registrierten Plugins auf und erlaubt das Hinzufuegen, Bearbeiten und Loeschen.
 */

import { useEffect, useState } from 'react';
import {
  listPlugins,
  registerPlugin,
  updatePlugin,
  deletePlugin,
  getPluginExecutions,
  type Plugin,
  type PluginExecution,
  type RegisterPluginInput,
} from '../api/plugins';
import EmptyState from '../components/EmptyState';

const AVAILABLE_EVENTS = [
  'after_categorization',
  'after_export',
  'after_archive',
  'before_extraction',
  'after_extraction',
  'before_categorization',
  'before_archive',
  'after_export.lexoffice',
  'after_export.sevdesk',
  'after_export.datev',
  'on_requires_review',
  'after_report.monthly',
  'on_export_failed',
];

export default function PluginsPage() {
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [selectedPlugin, setSelectedPlugin] = useState<Plugin | null>(null);
  const [executions, setExecutions] = useState<PluginExecution[]>([]);
  const [executionsLoading, setExecutionsLoading] = useState(false);
  const [actionMsg, setActionMsg] = useState<{ ok?: string; err?: string } | null>(null);

  const [form, setForm] = useState<RegisterPluginInput>({
    name: '',
    description: '',
    webhook_url: '',
    webhook_secret: '',
    hook_events: [],
  });
  const [formBusy, setFormBusy] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const list = await listPlugins();
      setPlugins(Array.isArray(list) ? list : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fehler beim Laden');
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setFormBusy(true);
    setActionMsg(null);
    try {
      await registerPlugin(form);
      setActionMsg({ ok: `Plugin "${form.name}" erfolgreich registriert.` });
      setShowForm(false);
      setForm({ name: '', description: '', webhook_url: '', webhook_secret: '', hook_events: [] });
      await load();
    } catch (e) {
      setActionMsg({ err: e instanceof Error ? e.message : 'Registrierung fehlgeschlagen' });
    } finally {
      setFormBusy(false);
    }
  }

  async function handleToggle(plugin: Plugin) {
    try {
      await updatePlugin(plugin.plugin_id, { enabled: !plugin.enabled });
      await load();
    } catch (e) {
      setActionMsg({ err: e instanceof Error ? e.message : 'Aktualisierung fehlgeschlagen' });
    }
  }

  async function handleDelete(plugin: Plugin) {
    if (!window.confirm(`Plugin "${plugin.name}" wirklich loeschen?`)) return;
    try {
      await deletePlugin(plugin.plugin_id);
      setActionMsg({ ok: `Plugin "${plugin.name}" geloescht.` });
      if (selectedPlugin?.plugin_id === plugin.plugin_id) {
        setSelectedPlugin(null);
        setExecutions([]);
      }
      await load();
    } catch (e) {
      setActionMsg({ err: e instanceof Error ? e.message : 'Loeschung fehlgeschlagen' });
    }
  }

  async function handleSelectPlugin(plugin: Plugin) {
    if (selectedPlugin?.plugin_id === plugin.plugin_id) {
      setSelectedPlugin(null);
      setExecutions([]);
      return;
    }
    setSelectedPlugin(plugin);
    setExecutionsLoading(true);
    try {
      const { executions: execs } = await getPluginExecutions(plugin.plugin_id);
      setExecutions(execs);
    } catch {
      setExecutions([]);
    } finally {
      setExecutionsLoading(false);
    }
  }

  function toggleEvent(event: string) {
    setForm((f) => ({
      ...f,
      hook_events: f.hook_events.includes(event)
        ? f.hook_events.filter((e) => e !== event)
        : [...f.hook_events, event],
    }));
  }

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-subtle)', marginBottom: 6 }}>
            ERWEITERBARKEIT
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.8px' }}>
            <span className="gradient-text">Plugins</span>
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 6 }}>
            Externe Module per HTTP-Webhook registrieren und verwalten
          </p>
        </div>
        <button className="primary" onClick={() => setShowForm(!showForm)}>
          + Plugin hinzufuegen
        </button>
      </div>

      {actionMsg?.ok && (
        <div className="success-box" style={{ marginBottom: 16 }}>{actionMsg.ok}</div>
      )}
      {actionMsg?.err && (
        <div className="error-box" style={{ marginBottom: 16 }}>{actionMsg.err}</div>
      )}

      {/* Registrierungsformular */}
      {showForm && (
        <div className="card" style={{ padding: 24, marginBottom: 20 }}>
          <div className="section-header">
            <span className="section-title">Neues Plugin registrieren</span>
            <button className="ghost" onClick={() => setShowForm(false)}>Abbrechen</button>
          </div>
          <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>
                Name *
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Mein Plugin"
                required
                style={{ width: '100%' }}
              />
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>
                Beschreibung
              </label>
              <input
                type="text"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Optionale Beschreibung"
                style={{ width: '100%' }}
              />
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>
                Webhook-URL * (muss https:// sein oder localhost)
              </label>
              <input
                type="url"
                value={form.webhook_url}
                onChange={(e) => setForm((f) => ({ ...f, webhook_url: e.target.value }))}
                placeholder="https://mein-plugin.example.com/webhook"
                required
                style={{ width: '100%' }}
              />
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>
                Webhook-Secret * (mind. 16 Zeichen)
              </label>
              <input
                type="password"
                value={form.webhook_secret}
                onChange={(e) => setForm((f) => ({ ...f, webhook_secret: e.target.value }))}
                placeholder="Mindestens 16 Zeichen"
                required
                minLength={16}
                style={{ width: '100%' }}
              />
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 10 }}>
                Hook-Events * (mindestens eins auswaehlen)
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {AVAILABLE_EVENTS.map((event) => (
                  <label
                    key={event}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      cursor: 'pointer',
                      fontSize: 12,
                      padding: '4px 10px',
                      borderRadius: 6,
                      background: form.hook_events.includes(event)
                        ? 'rgba(99,102,241,0.15)'
                        : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${form.hook_events.includes(event) ? 'rgba(99,102,241,0.5)' : 'var(--border)'}`,
                      transition: 'all 0.15s',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={form.hook_events.includes(event)}
                      onChange={() => toggleEvent(event)}
                      style={{ margin: 0 }}
                    />
                    {event}
                  </label>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <button
                type="submit"
                className="primary"
                disabled={formBusy || form.hook_events.length === 0}
              >
                {formBusy && <span className="spinner" />}
                Plugin registrieren
              </button>
              <button type="button" className="secondary" onClick={() => setShowForm(false)}>
                Abbrechen
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Plugin-Liste */}
      <div className="card" style={{ padding: 24, marginBottom: 20 }}>
        <div className="section-header">
          <span className="section-title">Installierte Plugins</span>
          <button className="ghost" onClick={load}>Aktualisieren</button>
        </div>

        {loading ? (
          <div className="loading-center"><span className="spinner" /> Wird geladen...</div>
        ) : error ? (
          <div className="error-box">{error}</div>
        ) : plugins.length === 0 ? (
          <EmptyState
            icon="🔌"
            title="Noch keine Plugins registriert"
            description='Klicke "Plugin hinzufuegen" um ein externes Modul per HTTP-Webhook zu registrieren.'
            action={{ label: '+ Plugin hinzufuegen', onClick: () => setShowForm(true) }}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {plugins.map((plugin) => (
              <div key={plugin.plugin_id} style={{
                border: `1px solid ${selectedPlugin?.plugin_id === plugin.plugin_id ? 'rgba(99,102,241,0.4)' : 'var(--border)'}`,
                borderRadius: 'var(--radius)',
                overflow: 'hidden',
              }}>
                {/* Plugin-Karte */}
                <div style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 16,
                  padding: 16,
                  background: selectedPlugin?.plugin_id === plugin.plugin_id
                    ? 'rgba(99,102,241,0.05)'
                    : 'rgba(255,255,255,0.01)',
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                      <span style={{ fontSize: 15, fontWeight: 700 }}>{plugin.name}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-subtle)' }}>v{plugin.version}</span>
                      <span style={{
                        fontSize: 11,
                        padding: '2px 8px',
                        borderRadius: 4,
                        background: plugin.enabled ? 'rgba(52,211,153,0.15)' : 'rgba(248,113,113,0.12)',
                        color: plugin.enabled ? '#34d399' : '#f87171',
                      }}>
                        {plugin.enabled ? 'Aktiv' : 'Deaktiviert'}
                      </span>
                    </div>
                    {plugin.description && (
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
                        {plugin.description}
                      </div>
                    )}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                      {plugin.hook_events.map((evt) => (
                        <span key={evt} className="module-chip" style={{ fontSize: 10, padding: '1px 6px' }}>
                          {evt}
                        </span>
                      ))}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-subtle)', fontFamily: 'monospace' }}>
                      {plugin.webhook_url}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button
                      className="secondary"
                      style={{ fontSize: 12, padding: '5px 10px' }}
                      onClick={() => handleSelectPlugin(plugin)}
                    >
                      {selectedPlugin?.plugin_id === plugin.plugin_id ? 'Verbergen' : 'Historie'}
                    </button>
                    <button
                      className="secondary"
                      style={{ fontSize: 12, padding: '5px 10px' }}
                      onClick={() => handleToggle(plugin)}
                    >
                      {plugin.enabled ? 'Deaktivieren' : 'Aktivieren'}
                    </button>
                    <button
                      className="danger"
                      style={{ fontSize: 12, padding: '5px 10px' }}
                      onClick={() => handleDelete(plugin)}
                    >
                      Loeschen
                    </button>
                  </div>
                </div>

                {/* Ausfuehrungshistorie */}
                {selectedPlugin?.plugin_id === plugin.plugin_id && (
                  <div style={{
                    borderTop: '1px solid var(--border)',
                    padding: 16,
                    background: 'rgba(0,0,0,0.15)',
                  }}>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
                      Ausfuehrungshistorie
                    </div>
                    {executionsLoading ? (
                      <div className="loading-center"><span className="spinner" /></div>
                    ) : executions.length === 0 ? (
                      <div style={{ fontSize: 12, color: 'var(--text-subtle)', textAlign: 'center', padding: '10px 0' }}>
                        Noch keine Ausfuehrungen.
                      </div>
                    ) : (
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                          <thead>
                            <tr style={{ color: 'var(--text-subtle)', textAlign: 'left' }}>
                              <th style={{ padding: '4px 8px', fontWeight: 600 }}>Datum</th>
                              <th style={{ padding: '4px 8px', fontWeight: 600 }}>Event</th>
                              <th style={{ padding: '4px 8px', fontWeight: 600 }}>Status</th>
                              <th style={{ padding: '4px 8px', fontWeight: 600 }}>HTTP</th>
                              <th style={{ padding: '4px 8px', fontWeight: 600 }}>Dauer</th>
                            </tr>
                          </thead>
                          <tbody>
                            {executions.map((exec) => (
                              <tr key={exec.execution_id} style={{ borderTop: '1px solid var(--border)' }}>
                                <td style={{ padding: '6px 8px', color: 'var(--text-muted)' }}>
                                  {new Date(exec.executed_at).toLocaleString('de-DE')}
                                </td>
                                <td style={{ padding: '6px 8px', fontFamily: 'monospace' }}>
                                  {exec.hook_event}
                                </td>
                                <td style={{ padding: '6px 8px' }}>
                                  <span style={{
                                    fontSize: 11,
                                    padding: '2px 7px',
                                    borderRadius: 4,
                                    background: exec.success ? 'rgba(52,211,153,0.15)' : 'rgba(248,113,113,0.12)',
                                    color: exec.success ? '#34d399' : '#f87171',
                                  }}>
                                    {exec.success ? 'OK' : 'Fehler'}
                                  </span>
                                </td>
                                <td style={{ padding: '6px 8px', color: 'var(--text-muted)' }}>
                                  {exec.response_status ?? '-'}
                                </td>
                                <td style={{ padding: '6px 8px', color: 'var(--text-muted)' }}>
                                  {exec.duration_ms}ms
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Info-Box */}
      <div className="card" style={{ padding: 24 }}>
        <div className="section-header">
          <span className="section-title">Plugin-Integration</span>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 12 }}>
          Plugins werden per HTTP POST an ihre Webhook-URL benachrichtigt wenn ein Hook-Event eintritt.
          Jeder Request enthält eine HMAC-SHA256-Signatur im Header <code>X-ProzessPilot-Signature</code>.
        </p>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          <strong>Payload-Format:</strong>
        </p>
        <pre style={{
          background: 'rgba(0,0,0,0.3)',
          padding: 14,
          borderRadius: 8,
          fontSize: 12,
          overflow: 'auto',
          color: 'var(--text)',
        }}>
{`{
  "event": "after_categorization",
  "data": { /* Receipt-Objekt */ },
  "timestamp": "2026-05-01T10:00:00.000Z"
}`}
        </pre>
      </div>
    </div>
  );
}
