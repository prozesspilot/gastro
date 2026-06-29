/**
 * T082 — Mitarbeiter-Aufgaben-Dashboard (admin.prozesspilot.net/tasks).
 *
 * Zeigt die einem Mitarbeiter zugewiesenen Aufgaben (Tabs: Meine / Team / Erledigt)
 * über die T081-Endpoints (m-tasks). BEWUSST cross-tenant — kein NoTenantHint-Guard
 * (anders als die Belege-/Chat-Seiten): das Dashboard zeigt Aufgaben über alle
 * Mandanten hinweg. Schreibaktionen (Anlegen/Status) sind serverseitig rollen-gegatet
 * (support = read-only); die UI spiegelt das nur.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  type AssigneeOption,
  type TaskListItem,
  type TaskPriority,
  type TaskStatus,
  type TaskView,
  changeTaskStatus,
  createTask,
  listAssignees,
  listTasks,
} from '../api/tasks';
import { useAuth } from '../auth/AuthContext';
import EmptyState from '../components/EmptyState';
import { useToast } from '../components/ToastProvider';

const TABS: { view: TaskView; label: string }[] = [
  { view: 'mine', label: 'Meine Aufgaben' },
  { view: 'team', label: 'Team' },
  { view: 'done', label: 'Erledigt' },
];

const STATUS_LABEL: Record<TaskStatus, string> = {
  offen: 'Offen',
  in_arbeit: 'In Arbeit',
  pausiert: 'Pausiert',
  erledigt: 'Erledigt',
  verworfen: 'Verworfen',
};

const PRIORITY_LABEL: Record<TaskPriority, string> = {
  kritisch: 'Kritisch',
  hoch: 'Hoch',
  normal: 'Normal',
  niedrig: 'Niedrig',
};

const PRIORITY_COLOR: Record<TaskPriority, string> = {
  kritisch: '#DC2626',
  hoch: '#EA7B0C',
  normal: 'var(--text-muted)',
  niedrig: 'var(--text-subtle)',
};

function fmtDue(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

type State =
  | { status: 'loading' }
  | { status: 'ready'; tasks: TaskListItem[] }
  | { status: 'error'; message: string };

export default function TasksPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const canWrite = user?.role !== 'support';

  const [view, setView] = useState<TaskView>('mine');
  const [state, setState] = useState<State>({ status: 'loading' });
  const [showCreate, setShowCreate] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(
    async (v: TaskView) => {
      setState({ status: 'loading' });
      try {
        const tasks = await listTasks(v);
        setState({ status: 'ready', tasks });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unbekannter Fehler';
        setState({ status: 'error', message });
      }
    },
    [],
  );

  useEffect(() => {
    void load(view);
  }, [view, load]);

  async function onChangeStatus(task: TaskListItem, status: TaskStatus): Promise<void> {
    setBusyId(task.id);
    try {
      await changeTaskStatus(task.id, status);
      toast('success', `Aufgabe „${task.title}" → ${STATUS_LABEL[status]}`);
      await load(view);
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Statusänderung fehlgeschlagen');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div
        className="page-header"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
      >
        <h1 className="page-title">Aufgaben</h1>
        {canWrite && (
          <button
            type="button"
            className="primary"
            onClick={() => setShowCreate(true)}
            style={{ fontSize: 14, padding: '8px 18px' }}
          >
            + Neue Aufgabe
          </button>
        )}
      </div>

      {/* Tabs */}
      <div
        role="tablist"
        aria-label="Aufgaben-Filter"
        style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 16 }}
      >
        {TABS.map((tab) => {
          const active = tab.view === view;
          return (
            <button
              key={tab.view}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setView(tab.view)}
              style={{
                background: 'none',
                border: 'none',
                borderBottom: active ? '2px solid var(--color-brand)' : '2px solid transparent',
                color: active ? 'var(--text)' : 'var(--text-muted)',
                fontWeight: active ? 700 : 500,
                fontSize: 14,
                padding: '8px 14px',
                cursor: 'pointer',
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {state.status === 'loading' && <p style={{ color: 'var(--text-muted)' }}>Lädt…</p>}

      {state.status === 'error' && (
        <p style={{ color: 'var(--danger, #c0392b)' }}>
          Aufgaben konnten nicht geladen werden: {state.message}{' '}
          <button type="button" className="ghost" onClick={() => void load(view)}>
            Erneut versuchen
          </button>
        </p>
      )}

      {state.status === 'ready' &&
        (state.tasks.length === 0 ? (
          <EmptyState
            icon="✓"
            title={view === 'done' ? 'Noch nichts erledigt' : 'Keine Aufgaben'}
            description={
              view === 'mine'
                ? 'Dir sind aktuell keine offenen Aufgaben zugewiesen.'
                : view === 'team'
                  ? 'Aktuell gibt es keine offenen Team-Aufgaben.'
                  : 'Abgeschlossene Aufgaben erscheinen hier.'
            }
          />
        ) : (
          <TasksTable
            tasks={state.tasks}
            busyId={busyId}
            canWrite={canWrite}
            onChangeStatus={onChangeStatus}
          />
        ))}

      {showCreate && (
        <CreateTaskModal
          isGf={user?.role === 'geschaeftsfuehrer'}
          selfUserId={user?.id ?? null}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            toast('success', 'Aufgabe angelegt.');
            void load(view);
          }}
          onError={(m) => toast('error', m)}
        />
      )}
    </div>
  );
}

// ── Tabelle ──────────────────────────────────────────────────────────────────

function TasksTable({
  tasks,
  busyId,
  canWrite,
  onChangeStatus,
}: {
  tasks: TaskListItem[];
  busyId: string | null;
  canWrite: boolean;
  onChangeStatus: (task: TaskListItem, status: TaskStatus) => void;
}) {
  return (
    <div
      className="card"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius, 8px)',
        overflow: 'hidden',
      }}
    >
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
            {['Prio', 'Status', 'Titel', 'Mandant', 'Zugewiesen', 'Fällig', ''].map((h) => (
              <th
                key={h}
                style={{
                  padding: '10px 14px',
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--text-muted)',
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tasks.map((t) => (
            <tr key={t.id} style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '12px 14px' }}>
                <span style={{ color: PRIORITY_COLOR[t.priority], fontWeight: 600, fontSize: 13 }}>
                  {PRIORITY_LABEL[t.priority]}
                </span>
              </td>
              <td style={{ padding: '12px 14px' }}>
                <span className="badge">{STATUS_LABEL[t.status]}</span>
              </td>
              <td style={{ padding: '12px 14px', fontWeight: 600 }}>
                {t.title}
                {t.collaborator_count > 0 && (
                  <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: 12 }}>
                    {' '}
                    · 👥 {t.collaborator_count}
                  </span>
                )}
              </td>
              <td style={{ padding: '12px 14px', color: 'var(--text-muted)', fontSize: 13 }}>
                {t.tenant_name ?? '—'}
              </td>
              <td style={{ padding: '12px 14px', color: 'var(--text-muted)', fontSize: 13 }}>
                {t.assigned_to_name ?? '— nicht zugewiesen —'}
              </td>
              <td style={{ padding: '12px 14px', color: 'var(--text-muted)', fontSize: 13 }}>
                {fmtDue(t.due_at)}
              </td>
              <td style={{ padding: '12px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                {canWrite && (
                  <TaskActions task={t} busy={busyId === t.id} onChangeStatus={onChangeStatus} />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TaskActions({
  task,
  busy,
  onChangeStatus,
}: {
  task: TaskListItem;
  busy: boolean;
  onChangeStatus: (task: TaskListItem, status: TaskStatus) => void;
}) {
  const btn = (label: string, status: TaskStatus, primary = false) => (
    <button
      type="button"
      className={primary ? 'primary' : 'ghost'}
      disabled={busy}
      onClick={() => onChangeStatus(task, status)}
      style={{ fontSize: 12, padding: '5px 10px', marginLeft: 6 }}
    >
      {label}
    </button>
  );

  switch (task.status) {
    case 'offen':
      return <>{btn('Übernehmen', 'in_arbeit', true)}</>;
    case 'in_arbeit':
      return (
        <>
          {btn('Pausieren', 'pausiert')}
          {btn('Erledigt', 'erledigt', true)}
        </>
      );
    case 'pausiert':
      return (
        <>
          {btn('Fortsetzen', 'in_arbeit')}
          {btn('Erledigt', 'erledigt', true)}
        </>
      );
    default:
      // erledigt / verworfen
      return <>{btn('Wieder öffnen', 'offen')}</>;
  }
}

// ── Anlegen-Modal ─────────────────────────────────────────────────────────────

function CreateTaskModal({
  isGf,
  selfUserId,
  onClose,
  onCreated,
  onError,
}: {
  isGf: boolean;
  selfUserId: string | null;
  onClose: () => void;
  onCreated: () => void;
  onError: (message: string) => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('normal');
  const [dueAt, setDueAt] = useState('');
  const [assignTo, setAssignTo] = useState<string>(''); // '' = niemand
  const [assignSelf, setAssignSelf] = useState(false);
  const [assignees, setAssignees] = useState<AssigneeOption[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // GF darf frei zuweisen → Mitarbeiter-Liste laden.
  useEffect(() => {
    if (!isGf) return;
    listAssignees()
      .then(setAssignees)
      .catch(() => {
        /* Dropdown ist optional — ohne Liste bleibt es „niemand" */
      });
  }, [isGf]);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    try {
      await createTask({
        title: title.trim(),
        description: description.trim() || null,
        priority,
        due_at: dueAt ? new Date(dueAt).toISOString() : null,
        // GF: aus Dropdown; sonst optional Selbst-Zuweisung (eigene User-ID, vom
        // Backend für Nicht-GF erlaubt, da == staff.userId).
        assigned_to: isGf ? assignTo || null : assignSelf ? selfUserId : null,
      });
      onCreated();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Anlegen fehlgeschlagen');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Neue Aufgabe"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.35)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
        padding: 16,
      }}
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius, 8px)',
          padding: 24,
          width: '100%',
          maxWidth: 480,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        <h2 style={{ margin: 0, fontSize: 18 }}>Neue Aufgabe</h2>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
          Titel *
          {/* biome-ignore lint/a11y/noAutofocus: Modal-Erstfeld, Fokus erwünscht */}
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            required
            autoFocus
            style={{ padding: '8px 10px' }}
          />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
          Beschreibung
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={5000}
            rows={3}
            style={{ padding: '8px 10px', resize: 'vertical' }}
          />
        </label>

        <div style={{ display: 'flex', gap: 12 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, flex: 1 }}>
            Priorität
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as TaskPriority)}
              style={{ padding: '8px 10px' }}
            >
              <option value="niedrig">Niedrig</option>
              <option value="normal">Normal</option>
              <option value="hoch">Hoch</option>
              <option value="kritisch">Kritisch</option>
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, flex: 1 }}>
            Fällig bis
            <input
              type="date"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              style={{ padding: '8px 10px' }}
            />
          </label>
        </div>

        {isGf ? (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
            Zuweisen an
            <select
              value={assignTo}
              onChange={(e) => setAssignTo(e.target.value)}
              style={{ padding: '8px 10px' }}
            >
              <option value="">— niemand —</option>
              {assignees.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.display_name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <input
              type="checkbox"
              checked={assignSelf}
              onChange={(e) => setAssignSelf(e.target.checked)}
            />
            Mir selbst zuweisen
          </label>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
          <button type="button" className="ghost" onClick={onClose} disabled={submitting}>
            Abbrechen
          </button>
          <button type="submit" className="primary" disabled={submitting || !title.trim()}>
            {submitting ? 'Speichert…' : 'Anlegen'}
          </button>
        </div>
      </form>
    </div>
  );
}
