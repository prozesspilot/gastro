import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  fetchCustomers,
  fetchProfile,
  fetchReceiptStats,
  fetchTenants,
  getActiveTenantId,
} from '../api';
import type { ReceiptStats } from '../api/receipts';
import { useReceiptEvents } from '../hooks/useReceiptEvents';
import { SkeletonKpi } from '../components/Skeleton';
import { INITIAL_TASKS } from '../data/tasks';
import type { Task, Priority } from '../data/tasks';
import type { CustomerProfile, ModuleKey } from '../types';
import { MODULE_META } from '../types';

interface Activity {
  id: number;
  strong: string;
  text: string;
  at: number;
  type: 'info' | 'success' | 'warning' | 'purple';
}

const MODULE_COLORS: Record<ModuleKey, string> = {
  m01_ingestion:      '#58a6ff',
  m02_archiving:      '#34d399',
  m03_extraction:     '#a78bfa',
  m04_categorization: '#f472b6',
  m05_lexoffice:      '#fb923c',
  m06_portal:         '#2dd4bf',
  m07_notifications:  '#fbbf24',
  m08_reporting:      '#fbbf24',
  m09_supplier_comm:  '#94a3b8',
};
const ALL_MODULES: { id: string; label: string; color: string; key: ModuleKey }[] =
  (Object.keys(MODULE_META) as ModuleKey[]).map((k) => ({
    id: MODULE_META[k].id,
    label: MODULE_META[k].label,
    color: MODULE_COLORS[k],
    key: k,
  }));

const EXTRA_TASKS: Task[] = [
  { id: 9,  text: 'M03 KI-Kategorisierung konfigurieren',          meta: 'Schwellwert + Few-Shot Beispiele in Profil',          priority: 'high',   done: false },
  { id: 10, text: 'Erstes Kundenprofil vollständig onboarden',     meta: 'Sprint_1 §6 — alle Tabs (Module, Integrationen, …)',  priority: 'high',   done: false },
  { id: 11, text: 'Lexoffice API-Key hinterlegen',                 meta: 'Tab Credentials → kind: lexoffice_api_key',            priority: 'medium', done: false },
  { id: 12, text: 'Ersten Beleg komplett durch Pipeline schicken', meta: 'M10 → M01 → M02 → M07 inkl. M03 Kategorisierung',     priority: 'medium', done: false },
];

export default function DashboardPage() {
  const [tasks, setTasks]         = useState<Task[]>(() => mergeTasks(INITIAL_TASKS, EXTRA_TASKS));
  const [newTask, setNewTask]     = useState('');
  const [tenantCount, setTenantCount] = useState<number | null>(null);
  const [stats, setStats]         = useState<ReceiptStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [activeTenantId, setActiveTid]  = useState<string | null>(null);
  const [profile, setProfile]     = useState<CustomerProfile | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);

  useEffect(() => {
    fetchTenants()
      .then((list) => setTenantCount(list.length))
      .catch(() => setTenantCount(0));
  }, []);

  async function reloadStats(id: string) {
    try {
      const data = await fetchReceiptStats(id);
      setStats(data);
    } catch {
      setStats(emptyStats());
    } finally {
      setStatsLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      let id = getActiveTenantId();
      if (!id) {
        try {
          const list = await fetchTenants();
          id = list[0]?.id ?? null;
        } catch {
          id = null;
        }
      }
      if (cancelled) return;

      if (!id) {
        setStats(emptyStats());
        setStatsLoading(false);
        setActiveTid(null);
        return;
      }
      setActiveTid(id);
      await reloadStats(id);

      // Profil des ersten Kunden laden für Modul-Status
      try {
        const customers = await fetchCustomers(id);
        if (customers.length > 0) {
          const p = await fetchProfile(customers[0].id, id);
          if (!cancelled) setProfile(p);
        }
      } catch {
        // Profile-Fetch ist optional
      }
    }

    load();
    const interval = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // SSE: Live-Updates
  useReceiptEvents(activeTenantId, (event, data) => {
    if (!activeTenantId) return;
    if (event === 'receipt:status' || event === 'receipt:created' || event === 'receipt:updated') {
      reloadStats(activeTenantId);
    }
    const activity = mapEventToActivity(event, data);
    if (activity) {
      setActivities((prev) => [activity, ...prev].slice(0, 20));
    }
  });

  // Re-render alle 60s damit "Vor X Min." aktualisiert wird
  useEffect(() => {
    const t = setInterval(() => {
      setActivities((prev) => [...prev]);
    }, 60_000);
    return () => clearInterval(t);
  }, []);

  const openTasks = tasks.filter(t => !t.done).length;
  const doneTasks = tasks.filter(t => t.done).length;

  function toggle(id: number) {
    setTasks(ts => ts.map(t => t.id === id ? { ...t, done: !t.done } : t));
  }

  function deleteTask(id: number) {
    setTasks(ts => ts.filter(t => t.id !== id));
  }

  function addTask(e: React.FormEvent) {
    e.preventDefault();
    const text = newTask.trim();
    if (!text) return;
    setTasks(ts => [
      { id: Date.now(), text, meta: 'Manuell · heute', priority: 'medium', done: false },
      ...ts,
    ]);
    setNewTask('');
  }

  const enabledModules: Set<ModuleKey> | null = profile?.enabled_modules
    ? new Set((Object.keys(profile.enabled_modules) as ModuleKey[]).filter((k) => profile.enabled_modules[k]))
    : null;
  const activeCount = enabledModules ? enabledModules.size : 4;

  return (
    <div>

      {/* ── Hero-Header ──────────────────────────────────────────────────────── */}
      <div className="page-header">
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-subtle)', marginBottom: 6 }}>
            ÜBERSICHT
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.8px' }}>
            Willkommen zurück&nbsp;
            <span className="gradient-text">Andreas</span> 👋
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 6 }}>
            {openTasks} offene Aufgaben · {doneTasks} heute erledigt · System läuft stabil
          </p>
        </div>
        <Link to="/tenants">
          <button className="primary" style={{ fontSize: 14, padding: '10px 20px' }}>
            <span>+</span> Mandant anlegen
          </button>
        </Link>
      </div>

      {/* ── KPI Kacheln ──────────────────────────────────────────────────────── */}
      <div className="kpi-grid">

        {tenantCount === null ? (
          <SkeletonKpi />
        ) : (
          <div className="kpi-card">
            <div className="kpi-card-glow" style={{ background: '#58a6ff' }} />
            <div className="kpi-icon-wrap" style={{ background: 'rgba(88,166,255,0.1)', color: '#58a6ff' }}>
              🏢
            </div>
            <div className="kpi-label">Mandanten</div>
            <div className="kpi-value gradient-text-blue">{tenantCount}</div>
            <div className="kpi-sub">aktiv im System</div>
          </div>
        )}

        <div className="kpi-card">
          <div className="kpi-card-glow" style={{ background: openTasks > 0 ? '#fb923c' : '#34d399' }} />
          <div className="kpi-icon-wrap" style={{ background: openTasks > 0 ? 'rgba(251,146,60,0.1)' : 'rgba(52,211,153,0.1)', color: openTasks > 0 ? '#fb923c' : '#34d399' }}>
            ✅
          </div>
          <div className="kpi-label">Offene Aufgaben</div>
          <div className="kpi-value" style={{ color: openTasks > 0 ? '#fb923c' : '#34d399' }}>
            {openTasks}
          </div>
          <div className="kpi-sub">{doneTasks} heute erledigt</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-card-glow" style={{ background: '#34d399' }} />
          <div className="kpi-icon-wrap" style={{ background: 'rgba(52,211,153,0.1)', color: '#34d399' }}>
            ⚡
          </div>
          <div className="kpi-label">Aktive Workflows</div>
          <div className="kpi-value" style={{ color: '#34d399' }}>5</div>
          <div className="kpi-sub">n8n · alle grün</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-card-glow" style={{ background: '#a78bfa' }} />
          <div className="kpi-icon-wrap" style={{ background: 'rgba(167,139,250,0.1)', color: '#a78bfa' }}>
            📦
          </div>
          <div className="kpi-label">Module aktiv</div>
          <div className="kpi-value" style={{ color: '#a78bfa' }}>{activeCount}</div>
          <div className="kpi-sub">von {ALL_MODULES.length} verfügbar</div>
        </div>

        {statsLoading ? (
          <SkeletonKpi />
        ) : (
          <div className="kpi-card">
            <div className="kpi-card-glow" style={{ background: '#f472b6' }} />
            <div className="kpi-icon-wrap" style={{ background: 'rgba(244,114,182,0.1)', color: '#f472b6' }}>
              📋
            </div>
            <div className="kpi-label">Belege gesamt</div>
            <div className="kpi-value" style={{ color: '#f472b6' }}>{stats?.total ?? 0}</div>
            <div className="kpi-sub">{stats?.today ?? 0} heute</div>
          </div>
        )}

        {statsLoading ? (
          <SkeletonKpi />
        ) : (
          <div className="kpi-card">
            <div className="kpi-card-glow" style={{ background: '#34d399' }} />
            <div className="kpi-icon-wrap" style={{ background: 'rgba(52,211,153,0.1)', color: '#34d399' }}>
              ✓
            </div>
            <div className="kpi-label">Verarbeitet</div>
            <div className="kpi-value" style={{ color: '#34d399' }}>
              {(stats?.by_status['completed'] ?? 0) + (stats?.by_status['exported'] ?? 0) + (stats?.by_status['done'] ?? 0)}
            </div>
            <div className="kpi-sub">
              {stats?.by_status['received'] ?? stats?.by_status['pending'] ?? 0} eingegangen · {stats?.by_status['error'] ?? 0} Fehler
            </div>
          </div>
        )}

      </div>

      {/* ── Zweispalten-Layout ───────────────────────────────────────────────── */}
      <div className="two-col">

        {/* ── Aufgaben ── */}
        <div>
          <div className="section-header">
            <span className="section-title">Aufgaben</span>
            <span className="badge pending" style={{ fontWeight: 700 }}>{openTasks} offen</span>
          </div>

          <div className="task-list">
            {tasks
              .slice()
              .sort((a, b) => {
                if (a.done !== b.done) return a.done ? 1 : -1;
                const order: Record<Priority, number> = { high: 0, medium: 1, low: 2 };
                return order[a.priority] - order[b.priority];
              })
              .map(task => (
                <div
                  key={task.id}
                  className={`task-item${task.done ? ' done' : ''}`}
                  onClick={() => toggle(task.id)}
                >
                  <div className={`task-priority ${task.priority}`} />
                  <div className={`task-checkbox${task.done ? ' checked' : ''}`}>
                    {task.done && '✓'}
                  </div>
                  <div className="task-body">
                    <div className="task-text">{task.text}</div>
                    <div className="task-meta">{task.meta}</div>
                  </div>
                  <button
                    className="icon-btn"
                    title="Löschen"
                    onClick={e => { e.stopPropagation(); deleteTask(task.id); }}
                    style={{ flexShrink: 0, opacity: 0.4, fontSize: 16, padding: '2px 6px' }}
                    onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                    onMouseLeave={e => (e.currentTarget.style.opacity = '0.4')}
                  >
                    ×
                  </button>
                </div>
              ))}

            {tasks.length === 0 && (
              <div style={{
                textAlign: 'center', padding: '32px 0',
                color: 'var(--text-subtle)', fontSize: 14,
              }}>
                ✨ Keine offenen Aufgaben — alles erledigt!
              </div>
            )}
          </div>

          <form className="add-task-row" onSubmit={addTask} style={{ marginTop: 14 }}>
            <input
              type="text"
              placeholder="Neue Aufgabe hinzufügen…"
              value={newTask}
              onChange={e => setNewTask(e.target.value)}
              style={{ flex: 1 }}
            />
            <button type="submit" className="primary" disabled={!newTask.trim()}
              style={{ whiteSpace: 'nowrap' }}>
              + Hinzufügen
            </button>
          </form>
        </div>

        {/* ── Rechte Spalte ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Aktivitäts-Feed */}
          <div>
            <div className="section-header">
              <span className="section-title">Aktivitäten</span>
              <span style={{ fontSize: 12, color: 'var(--text-subtle)' }}>
                {activities.length === 0 ? 'Warte auf Events…' : 'Live'}
              </span>
            </div>

            <div style={{
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              padding: '4px 18px',
              minHeight: 80,
            }}>
              <div className="activity-list">
                {activities.length === 0 ? (
                  <div style={{ padding: '28px 0', textAlign: 'center', color: 'var(--text-subtle)', fontSize: 13 }}>
                    Noch keine Aktivitäten — Events erscheinen hier sobald Belege durch die Pipeline laufen.
                  </div>
                ) : (
                  activities.map(a => (
                    <div key={a.id} className="activity-item">
                      <div className={`activity-dot ${a.type}`} />
                      <div>
                        <div className="activity-text">
                          <strong>{a.strong}</strong>{a.text}
                        </div>
                        <div className="activity-time">{relativeTime(a.at)}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Module Status */}
          <div>
            <div className="section-header">
              <span className="section-title">Module</span>
              {profile && (
                <span style={{ fontSize: 12, color: 'var(--text-subtle)' }}>
                  {profile.display_name}{profile.skr_type ? ` · ${profile.skr_type}` : ''}
                </span>
              )}
            </div>
            <div style={{
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              padding: 16,
            }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {ALL_MODULES.map(m => {
                  const active = enabledModules
                    ? enabledModules.has(m.key)
                    : ['M01', 'M02', 'M07'].includes(m.id);
                  return (
                    <div key={m.id} style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '10px 12px',
                      borderRadius: 10,
                      background: active ? `rgba(${hexToRgb(m.color)}, 0.06)` : 'rgba(255,255,255,0.02)',
                      border: `1px solid ${active ? `rgba(${hexToRgb(m.color)}, 0.2)` : 'var(--border)'}`,
                      transition: 'all 0.2s',
                    }}>
                      <div style={{
                        width: 8, height: 8,
                        borderRadius: '50%',
                        background: active ? m.color : 'var(--text-subtle)',
                        boxShadow: active ? `0 0 6px ${m.color}` : 'none',
                        flexShrink: 0,
                      }} />
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: active ? m.color : 'var(--text-subtle)' }}>
                          {m.id}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-subtle)' }}>{m.label}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

let activityId = 1;

function mapEventToActivity(event: string, data: unknown): Activity | null {
  if (!data || typeof data !== 'object') return null;
  const payload = data as {
    receipt?: { status?: string; extraction?: { confidence?: number; fields?: { supplier_name?: string } }; categorization?: { category_label?: string }; archive?: { target?: string }; exports?: Array<{ target?: string }>; customer_id?: string };
    customer?: { name?: string };
    period?: string;
    [k: string]: unknown;
  };

  const supplier = payload.receipt?.extraction?.fields?.supplier_name ?? 'Beleg';
  const customer = payload.customer?.name ?? 'Kunde';
  const id = activityId++;
  const at = Date.now();

  switch (event) {
    case 'pp.receipt.received':
    case 'receipt:created':
      return { id, at, type: 'info', strong: customer, text: ' hat einen Beleg gesendet' };
    case 'pp.receipt.extracted': {
      const conf = payload.receipt?.extraction?.confidence;
      const confStr = conf !== undefined ? ` (Konfidenz: ${Math.round(conf * 100)}%)` : '';
      return { id, at, type: 'info', strong: supplier, text: ` extrahiert${confStr}` };
    }
    case 'pp.receipt.categorized':
      return { id, at, type: 'success', strong: 'Beleg', text: ` als ${payload.receipt?.categorization?.category_label ?? 'Kategorie'} kategorisiert` };
    case 'pp.receipt.archived':
      return { id, at, type: 'success', strong: 'Beleg', text: ` in ${payload.receipt?.archive?.target ?? 'Archiv'} archiviert` };
    case 'pp.receipt.exported': {
      const target = payload.receipt?.exports?.[0]?.target ?? 'Export';
      return { id, at, type: 'purple', strong: 'Beleg', text: ` nach ${target} exportiert` };
    }
    case 'pp.receipt.requires_review':
      return { id, at, type: 'warning', strong: '⚠ ' + supplier, text: ' braucht manuelle Prüfung' };
    case 'pp.report.monthly_generated':
      return { id, at, type: 'purple', strong: '📊 Monatsbericht', text: ` ${payload.period ?? ''} erstellt` };
    case 'receipt:status':
    case 'receipt:updated':
      return { id, at, type: 'info', strong: 'Beleg', text: ` Status → ${payload.receipt?.status ?? 'aktualisiert'}` };
    default:
      return null;
  }
}

function relativeTime(at: number): string {
  const diff = Date.now() - at;
  if (diff < 60_000) return 'Gerade eben';
  if (diff < 3_600_000) return `Vor ${Math.floor(diff / 60_000)} Min.`;
  if (diff < 86_400_000) return `Vor ${Math.floor(diff / 3_600_000)} Std.`;
  return new Date(at).toLocaleDateString('de-DE');
}

function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r},${g},${b}`;
}

function emptyStats(): ReceiptStats {
  return {
    total: 0,
    today: 0,
    by_status: {},
    by_source: {},
  };
}

function mergeTasks(initial: Task[], extra: Task[]): Task[] {
  const seen = new Set(initial.map((t) => t.id));
  return [...initial, ...extra.filter((t) => !seen.has(t.id))];
}
