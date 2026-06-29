/**
 * T081 — Mitarbeiter-Aufgaben-Dashboard: Repository (direkte pg-Queries).
 *
 * WICHTIG (Invarianten aus dem T080-Review, ohne RLS ist die App die einzige Grenze):
 *  - `tasks` NIE innerhalb eines withTenant()-Blocks abfragen — das setzt nur
 *    `app.current_tenant` ohne Policy-Wirkung (trügerisches Pseudo-Scoping). Wir
 *    arbeiten daher direkt über den Pool, ohne Tenant-Context.
 *  - Sichtbarkeits-Filter („Meine") wird IM SQL erzwungen, nie erst im Frontend.
 *  - Alle Queries parametrisiert (kein String-Concat).
 *  - `priority` per CASE sortieren (kritisch→hoch→normal→niedrig), nie naiv
 *    `ORDER BY priority` (sortiert alphabetisch falsch).
 *  - Schreibaktionen schreiben transaktional einen task_activity_log-Eintrag mit.
 */

import type { Pool, PoolClient } from 'pg';
import type {
  AssigneeOption,
  DbTask,
  TaskActivityEntry,
  TaskCollaborator,
  TaskDetail,
  TaskListItem,
  TaskStatus,
  TaskView,
} from '../tasks.types';

// ── SQL-Bausteine ────────────────────────────────────────────────────────────

/**
 * Semantische Status-Sortierung (in Arbeit zuerst, dann offen/pausiert) und
 * Prioritäts-Sortierung (kritisch zuerst). Bewusst KEIN `ORDER BY priority`:
 * das sortierte alphabetisch falsch (hoch < kritisch < niedrig < normal).
 */
const ORDER_CLAUSE = `
  ORDER BY
    CASE t.status WHEN 'in_arbeit' THEN 0 WHEN 'offen' THEN 1 WHEN 'pausiert' THEN 2 ELSE 3 END,
    CASE t.priority WHEN 'kritisch' THEN 0 WHEN 'hoch' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
    t.due_at ASC NULLS LAST,
    t.created_at ASC
`;

/** SELECT-Liste mit aufgelösten Namen + Helfer-Anzahl (Listen-/Detail-Form). */
const TASK_SELECT = `
  SELECT
    t.id, t.tenant_id, t.type, t.title, t.description,
    t.reference_type, t.reference_id, t.status, t.priority,
    t.assigned_to, t.created_by,
    t.claimed_at, t.due_at, t.completed_at, t.created_at, t.updated_at,
    ua.display_name AS assigned_to_name,
    uc.display_name AS created_by_name,
    tn.display_name AS tenant_name,
    COALESCE(cc.cnt, 0)::int AS collaborator_count
  FROM tasks t
  LEFT JOIN users   ua ON ua.id = t.assigned_to
  LEFT JOIN users   uc ON uc.id = t.created_by
  LEFT JOIN tenants tn ON tn.id = t.tenant_id
  LEFT JOIN (
    SELECT task_id, COUNT(*) AS cnt FROM task_collaborators GROUP BY task_id
  ) cc ON cc.task_id = t.id
`;

// ── Lesen ────────────────────────────────────────────────────────────────────

export interface ListTasksInput {
  /** Welche Liste: 'mine' (meine offenen) | 'team' (alle offenen) | 'done' (erledigt). */
  view: TaskView;
  /** Aktuell eingeloggter Mitarbeiter (für 'mine'-Filter + Helfer-Sicht). */
  userId: string;
  /** Optionaler Prioritäts-Filter. */
  priority?: string;
}

/**
 * Listet Aufgaben gemäß View. Der „Meine"-Filter ist IM SQL erzwungen:
 *  - mine: zugewiesen an mich ODER ich bin Helfer; nur aktive Stati.
 *  - team: alle aktiven Aufgaben (das Team-Tab zeigt bewusst fremde Aufgaben —
 *    Staff-Daten sind cross-tenant, siehe Migrations-Begründung).
 *  - done: alle abgeschlossenen Aufgaben (erledigt/verworfen).
 */
export async function listTasks(pool: Pool, input: ListTasksInput): Promise<TaskListItem[]> {
  const params: unknown[] = [];
  let where: string;

  if (input.view === 'mine') {
    params.push(input.userId);
    where = `WHERE t.status IN ('offen','in_arbeit','pausiert')
             AND (t.assigned_to = $1
                  OR EXISTS (SELECT 1 FROM task_collaborators c
                             WHERE c.task_id = t.id AND c.user_id = $1))`;
  } else if (input.view === 'done') {
    where = `WHERE t.status IN ('erledigt','verworfen')`;
  } else {
    // team
    where = `WHERE t.status IN ('offen','in_arbeit','pausiert')`;
  }

  if (input.priority) {
    params.push(input.priority);
    where += ` AND t.priority = $${params.length}`;
  }

  const result = await pool.query(`${TASK_SELECT} ${where} ${ORDER_CLAUSE}`, params);
  return result.rows as TaskListItem[];
}

/** Holt eine Aufgabe (Listen-Form, mit Namen) — null wenn nicht vorhanden. */
export async function getTaskListItem(pool: Pool, id: string): Promise<TaskListItem | null> {
  const result = await pool.query(`${TASK_SELECT} WHERE t.id = $1`, [id]);
  return (result.rows[0] as TaskListItem | undefined) ?? null;
}

/**
 * Holt die rohe Aufgabe für Permission-Checks (assigned_to / created_by / status).
 * null wenn nicht vorhanden.
 */
export async function getTaskRaw(pool: Pool, id: string): Promise<DbTask | null> {
  const result = await pool.query(
    `SELECT id, tenant_id, type, title, description, reference_type, reference_id,
            status, priority, assigned_to, created_by,
            claimed_at, due_at, completed_at, created_at, updated_at
     FROM tasks WHERE id = $1`,
    [id],
  );
  return (result.rows[0] as DbTask | undefined) ?? null;
}

/** Helfer einer Aufgabe (mit aufgelösten Namen). */
export async function listCollaborators(pool: Pool, taskId: string): Promise<TaskCollaborator[]> {
  const result = await pool.query(
    `SELECT c.user_id, u.display_name, c.added_by, c.added_at
     FROM task_collaborators c
     JOIN users u ON u.id = c.user_id
     WHERE c.task_id = $1
     ORDER BY c.added_at ASC`,
    [taskId],
  );
  return result.rows as TaskCollaborator[];
}

/** Prüft, ob ein User Helfer einer Aufgabe ist (für Mutations-Berechtigung). */
export async function isCollaborator(pool: Pool, taskId: string, userId: string): Promise<boolean> {
  const result = await pool.query(
    'SELECT 1 FROM task_collaborators WHERE task_id = $1 AND user_id = $2',
    [taskId, userId],
  );
  return result.rows.length > 0;
}

/** Aktivitäts-Historie einer Aufgabe (neueste zuerst). */
export async function listActivity(pool: Pool, taskId: string): Promise<TaskActivityEntry[]> {
  const result = await pool.query(
    `SELECT a.id, a.action, a.actor, u.display_name AS actor_name, a.payload, a.created_at
     FROM task_activity_log a
     LEFT JOIN users u ON u.id = a.actor
     WHERE a.task_id = $1
     ORDER BY a.created_at DESC`,
    [taskId],
  );
  return result.rows as TaskActivityEntry[];
}

/** Voll-Detail (Aufgabe + Helfer + Historie). null wenn Aufgabe fehlt. */
export async function getTaskDetail(pool: Pool, id: string): Promise<TaskDetail | null> {
  const task = await getTaskListItem(pool, id);
  if (!task) return null;
  const [collaborators, activity] = await Promise.all([
    listCollaborators(pool, id),
    listActivity(pool, id),
  ]);
  return { ...task, collaborators, activity };
}

/** Aktive Mitarbeiter für die „Zuweisen"-Auswahl. */
export async function listAssignees(pool: Pool): Promise<AssigneeOption[]> {
  const result = await pool.query(
    `SELECT id, display_name, role
     FROM users
     WHERE active = true
     ORDER BY display_name ASC`,
  );
  return result.rows as AssigneeOption[];
}

// ── Schreiben ────────────────────────────────────────────────────────────────

/** Schreibt einen Aktivitäts-Eintrag (innerhalb einer bestehenden Transaktion). */
async function insertActivity(
  client: PoolClient,
  taskId: string,
  actor: string | null,
  action: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await client.query(
    `INSERT INTO task_activity_log (task_id, actor, action, payload)
     VALUES ($1, $2, $3, $4::jsonb)`,
    [taskId, actor, action, JSON.stringify(payload)],
  );
}

export interface CreateTaskInput {
  tenantId: string | null;
  type: string;
  title: string;
  description: string | null;
  priority: string;
  assignedTo: string | null;
  dueAt: string | null;
  referenceType: string | null;
  referenceId: string | null;
  createdBy: string;
}

/** Legt eine Aufgabe an + schreibt den 'created'-Aktivitätseintrag (transaktional). */
export async function createTask(pool: Pool, input: CreateTaskInput): Promise<TaskListItem> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const inserted = await client.query(
      `INSERT INTO tasks
         (tenant_id, type, title, description, priority, assigned_to, due_at,
          reference_type, reference_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz, $8, $9, $10)
       RETURNING id`,
      [
        input.tenantId,
        input.type,
        input.title,
        input.description,
        input.priority,
        input.assignedTo,
        input.dueAt,
        input.referenceType,
        input.referenceId,
        input.createdBy,
      ],
    );
    const id = inserted.rows[0].id as string;
    await insertActivity(client, id, input.createdBy, 'created', {
      title: input.title,
      assigned_to: input.assignedTo,
      priority: input.priority,
    });
    await client.query('COMMIT');
    const created = await getTaskListItem(pool, id);
    // created kann nicht null sein (gerade eingefügt) — Fallback nur für den Typ.
    if (!created) throw new Error('Task nach Insert nicht auffindbar');
    return created;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export interface ChangeStatusInput {
  taskId: string;
  newStatus: TaskStatus;
  actorId: string;
  /** true → Self-Claim: assigned_to wird (falls leer) auf den Akteur gesetzt. */
  claim: boolean;
}

/**
 * Ändert den Status einer Aufgabe + schreibt 'status_changed'. Setzt abhängige
 * Zeitstempel: claimed_at beim ersten Übergang nach 'in_arbeit', completed_at
 * beim Abschluss (erledigt/verworfen), und löscht completed_at bei Wiedereröffnung.
 * Gibt die aktualisierte Aufgabe zurück (null falls zwischenzeitlich verschwunden).
 */
export async function changeStatus(
  pool: Pool,
  input: ChangeStatusInput,
): Promise<TaskListItem | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const done = input.newStatus === 'erledigt' || input.newStatus === 'verworfen';
    const updated = await client.query(
      `UPDATE tasks
       SET status = $2,
           assigned_to = CASE WHEN $3::boolean AND assigned_to IS NULL THEN $4::uuid ELSE assigned_to END,
           claimed_at = CASE WHEN $2 = 'in_arbeit' AND claimed_at IS NULL THEN now() ELSE claimed_at END,
           completed_at = CASE WHEN $5::boolean THEN now() ELSE NULL END
       WHERE id = $1
       RETURNING id`,
      [input.taskId, input.newStatus, input.claim, input.actorId, done],
    );
    if (updated.rows.length === 0) {
      await client.query('ROLLBACK');
      return null;
    }
    await insertActivity(client, input.taskId, input.actorId, 'status_changed', {
      to: input.newStatus,
    });
    await client.query('COMMIT');
    return getTaskListItem(pool, input.taskId);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export interface UpdateTaskFields {
  title?: string;
  description?: string | null;
  priority?: string;
  dueAt?: string | null;
  type?: string;
  assignedTo?: string | null;
}

/**
 * Aktualisiert editierbare Felder (nur die übergebenen) + schreibt 'updated'.
 * Gibt die aktualisierte Aufgabe zurück (null falls verschwunden).
 */
export async function updateTask(
  pool: Pool,
  taskId: string,
  actorId: string,
  fields: UpdateTaskFields,
): Promise<TaskListItem | null> {
  const sets: string[] = [];
  const params: unknown[] = [taskId];

  const push = (col: string, value: unknown, cast = ''): void => {
    params.push(value);
    sets.push(`${col} = $${params.length}${cast}`);
  };

  if (fields.title !== undefined) push('title', fields.title);
  if (fields.description !== undefined) push('description', fields.description);
  if (fields.priority !== undefined) push('priority', fields.priority);
  if (fields.dueAt !== undefined) push('due_at', fields.dueAt, '::timestamptz');
  if (fields.type !== undefined) push('type', fields.type);
  if (fields.assignedTo !== undefined) push('assigned_to', fields.assignedTo, '::uuid');

  if (sets.length === 0) {
    // Nichts zu ändern → aktuelle Aufgabe zurückgeben.
    return getTaskListItem(pool, taskId);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const updated = await client.query(
      `UPDATE tasks SET ${sets.join(', ')} WHERE id = $1 RETURNING id`,
      params,
    );
    if (updated.rows.length === 0) {
      await client.query('ROLLBACK');
      return null;
    }
    await insertActivity(client, taskId, actorId, 'updated', {
      fields: Object.keys(fields),
    });
    await client.query('COMMIT');
    return getTaskListItem(pool, taskId);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export interface AddCollaboratorInput {
  taskId: string;
  userId: string;
  addedBy: string;
}

/**
 * Fügt einen Helfer hinzu (idempotent via ON CONFLICT) + schreibt
 * 'collaborator_added'. Gibt false zurück, wenn der User bereits Helfer war
 * (kein doppelter Log-Eintrag).
 */
export async function addCollaborator(pool: Pool, input: AddCollaboratorInput): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const inserted = await client.query(
      `INSERT INTO task_collaborators (task_id, user_id, added_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (task_id, user_id) DO NOTHING
       RETURNING user_id`,
      [input.taskId, input.userId, input.addedBy],
    );
    if (inserted.rows.length === 0) {
      await client.query('ROLLBACK');
      return false;
    }
    await insertActivity(client, input.taskId, input.addedBy, 'collaborator_added', {
      user_id: input.userId,
    });
    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Prüft, ob ein User existiert + aktiv ist (für assignTo / collaborator-Validierung). */
export async function isActiveUser(pool: Pool, userId: string): Promise<boolean> {
  const result = await pool.query('SELECT 1 FROM users WHERE id = $1 AND active = true', [userId]);
  return result.rows.length > 0;
}
