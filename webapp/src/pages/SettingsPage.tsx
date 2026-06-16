import { useEffect, useState } from 'react';
import { fetchHealth, fetchReady } from '../api';

/**
 * A3-Reboot (T059): schlanke Einstellungen — System-Verbindungs-Checks + Info.
 * Alte Seed-/Test-/Reset-/CSV-/DSGVO-Werkzeuge der Kunden-Welt wurden entfernt.
 */
type ConnectionState = 'idle' | 'checking' | 'ok' | 'fail';

interface ConnectionRow {
  id: 'backend' | 'postgres' | 'redis';
  label: string;
  url: string;
  state: ConnectionState;
  detail: string;
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export default function SettingsPage() {
  const [conns, setConns] = useState<ConnectionRow[]>([
    { id: 'backend', label: 'Backend API', url: '/api/v1', state: 'idle', detail: '' },
    { id: 'postgres', label: 'PostgreSQL', url: 'via /ready', state: 'idle', detail: '' },
    { id: 'redis', label: 'Redis Streams', url: 'via /ready', state: 'idle', detail: '' },
  ]);

  useEffect(() => {
    checkAllConnections();
  }, []);

  function updateConn(id: ConnectionRow['id'], state: ConnectionState, detail: string) {
    setConns((prev) => prev.map((c) => (c.id === id ? { ...c, state, detail } : c)));
  }

  async function checkConnection(id: ConnectionRow['id']) {
    updateConn(id, 'checking', '');
    try {
      if (id === 'backend') {
        const h = await fetchHealth();
        updateConn(
          'backend',
          h.ok ? 'ok' : 'fail',
          `Status: ${h.ok ? 'ok' : 'degraded'}${h.uptime ? ` · ${Math.round(h.uptime)}s uptime` : ''}`,
        );
      } else {
        const ready = await fetchReady();
        if (id === 'postgres') {
          const connected = ready.db?.connected ?? false;
          updateConn('postgres', connected ? 'ok' : 'fail', connected ? 'Verbunden' : 'Nicht erreichbar');
        } else {
          const connected = ready.redis?.connected ?? false;
          updateConn('redis', connected ? 'ok' : 'fail', connected ? 'Verbunden' : 'Nicht erreichbar');
        }
      }
    } catch (e) {
      updateConn(id, 'fail', e instanceof Error ? e.message : 'Fehler');
    }
  }

  async function checkAllConnections() {
    await Promise.all(conns.map((c) => checkConnection(c.id)));
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800 }}>Einstellungen</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 6 }}>System-Verbindungen</p>
        </div>
      </div>

      <div className="card" style={{ padding: 24, marginBottom: 20 }}>
        <div className="section-header">
          <span className="section-title">Verbindungen</span>
          <button type="button" className="ghost" onClick={checkAllConnections}>
            ↻ Alle prüfen
          </button>
        </div>

        {conns.map((c) => (
          <div key={c.id} className="conn-row">
            <span
              className={`conn-dot ${c.state === 'ok' ? 'green' : c.state === 'fail' ? 'red' : 'gray'}`}
              aria-hidden="true"
            />
            <div className="conn-info">
              <div className="conn-name">{c.label}</div>
              <div className="conn-status">
                <code style={{ background: 'transparent', padding: 0, color: 'var(--text-subtle)' }}>
                  {c.url}
                </code>
                {c.detail && <span style={{ marginLeft: 8 }}>· {c.detail}</span>}
              </div>
            </div>
            <button
              type="button"
              className="secondary"
              onClick={() => checkConnection(c.id)}
              disabled={c.state === 'checking'}
              style={{ flexShrink: 0 }}
            >
              {c.state === 'checking' ? 'Prüfe…' : 'Verbindung testen'}
            </button>
          </div>
        ))}
      </div>

      <div className="card" style={{ padding: 24 }}>
        <div className="section-header">
          <span className="section-title">Über ProzessPilot</span>
          <span style={{ fontSize: 12, color: 'var(--text-subtle)' }}>v0.1.0 · dev</span>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.7 }}>
          Interne Mitarbeiter-Webapp für die Belegverarbeitung (OCR → Kategorisierung → Lexware-Export).
        </p>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 13, marginTop: 12 }}>
          <a href={`${API_URL}/api/v1/health`} target="_blank" rel="noopener noreferrer">
            🩺 Health-Check
          </a>
          <a href={`${API_URL}/docs`} target="_blank" rel="noopener noreferrer">
            📚 API-Dokumentation
          </a>
        </div>
      </div>
    </div>
  );
}
