/**
 * T024 — Task-Repository (Migration 120_tasks.sql)
 *
 * CRUD-Operationen auf tasks / task_collaborators / task_activity_log.
 *
 * RLS-Muster: identisch zu kasse-transactions.repository.ts.
 *   - BEGIN → set_config('app.current_tenant', tenantId, true) → Query → COMMIT
 *   - Fuer systemweite Queries (alle Tasks = Cross-Tenant) muss der Aufrufer
 *     einen Owner-Pool (DATABASE_URL_OWNER) uebergeben — diese Datei traegt
 *     keine Entscheidung ueber Bypass, das entscheidet die Route.
 *
 * Spec: Mitarbeiter_Webapp.md §4.1–4.3
 */

import type { Pool, PoolClient } from 'pg';
import type {
  CreateTask,
  DbTask,
  DbTaskActivityLog,
  DbTaskCollaborator,
  UpdateTask,
} from './tasks.schema';

// ---------------------------------------------------------------------------
// Interner Helper: Tenant-Context fuer RLS setzen
// ---------------------------------------------------------------------------

async function setTenantContext(client: PoolClient, tenantId: string): Promise<void> {
  await client.query("SELECT set_config('app.current_tenant', $1, true)", [tenantId]);
}

// ---------------------------------------------------------------------------
// tasks CRUD
// ---------------------------------------------------------------------------

/**
 * Neue Task anlegen. Gibt die angelegte Row zurueck.
 * Schreibt KEINEN Activity-Log — das macht der Service-Layer.
 */
export async function createTask(pool: Pool, data: CreateTask): Promise<DbTask> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (data.tenant_id) {
      await setTenantContext(client, data.tenant_id);
    }

    const result = await client.query<DbTask>(
      `INSERT INTO tasks (
         tenant_id, type, title, description,
         reference_type, reference_id,
         priority, assigned_to,
         due_at, discord_message_id
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        data.tenant_id ?? null,
        data.type,
        data.title,
        data.description ?? null,
        data.reference_type ?? null,
        data.reference_id ?? null,
        data.priority,
        data.assigned_to ?? null,
        data.due_at ?? null,
        data.discord_message_id ?? null,
      ],
    );

    await client.query('COMMIT');
    return result.rows[0];
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Einzelne Task per ID laden. Respektiert RLS via Tenant-Context.
 */
export async function getTask(
  pool: Pool,
  taskId: string,
  tenantId: string | null,
): Promise<DbTask | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (tenantId) {
      await setTenantContext(client, tenantId);
    }

    const result = await client.query<DbTask>('SELECT * FROM tasks WHERE id = $1', [taskId]);

    await client.query('COMMIT');
    return result.rows[0] ?? null;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Tasks listen (paginiert) im Tenant-Context.
 * COUNT in separatem Query (Pagination-Fix-Pattern aus M15).
 */
export async function listTasks(
  pool: Pool,
  opts: {
    tenantId: string | null;
    status?: string;
    priority?: string;
    assignedTo?: string;
    type?: string;
    limit: number;
    offset: number;
  },
): Promise<{ items: DbTask[]; total: number }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (opts.tenantId) {
      await setTenantContext(client, opts.tenantId);
    }

    // Parameter-Array aufbauen (nur gesetzte Filter)
    // $1 = tenant_id, $2 = status, $3 = priority, $4 = assigned_to, $5 = type
    const countResult = await client.query<{ total: string }>(
      `SELECT COUNT(*) AS total
         FROM tasks
        WHERE ($1::uuid IS NULL OR tenant_id = $1::uuid)
          AND ($2::text IS NULL OR status = $2)
          AND ($3::text IS NULL OR priority = $3)
          AND ($4::uuid IS NULL OR assigned_to = $4::uuid)
          AND ($5::text IS NULL OR type = $5)`,
      [
        opts.tenantId ?? null,
        opts.status ?? null,
        opts.priority ?? null,
        opts.assignedTo ?? null,
        opts.type ?? null,
      ],
    );
    const total = Number.parseInt(countResult.rows[0]?.total ?? '0', 10);

    const result = await client.query<DbTask>(
      `SELECT *
         FROM tasks
        WHERE ($1::uuid IS NULL OR tenant_id = $1::uuid)
          AND ($2::text IS NULL OR status = $2)
          AND ($3::text IS NULL OR priority = $3)
          AND ($4::uuid IS NULL OR assigned_to = $4::uuid)
          AND ($5::text IS NULL OR type = $5)
        ORDER BY
          CASE priority WHEN 'kritisch' THEN 0 WHEN 'hoch' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END ASC,
          due_at ASC NULLS LAST,
          created_at ASC
        LIMIT $6 OFFSET $7`,
      [
        opts.tenantId ?? null,
        opts.status ?? null,
        opts.priority ?? null,
        opts.assignedTo ?? null,
        opts.type ?? null,
        opts.limit,
        opts.offset,
      ],
    );

    await client.query('COMMIT');
    return { items: result.rows, total };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Task-Felder aktualisieren. Gibt aktualisierte Row zurueck.
 */
export async function updateTask(
  pool: Pool,
  taskId: string,
  tenantId: string | null,
  data: UpdateTask,
): Promise<DbTask | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (tenantId) {
      await setTenantContext(client, tenantId);
    }

    // Nur gesetzte Felder aktualisieren (COALESCE-Pattern)
    const result = await client.query<DbTask>(
      `UPDATE tasks
          SET title             = COALESCE($2, title),
              description       = CASE WHEN $3::boolean THEN $4 ELSE description END,
              status            = COALESCE($5, status),
              priority          = COALESCE($6, priority),
              assigned_to       = CASE WHEN $7::boolean THEN $8::uuid ELSE assigned_to END,
              due_at            = CASE WHEN $9::boolean THEN $10::timestamptz ELSE due_at END,
              discord_message_id = CASE WHEN $11::boolean THEN $12 ELSE discord_message_id END,
              completed_at      = CASE
                                    WHEN $5 = 'erledigt' AND completed_at IS NULL THEN now()
                                    WHEN $5 IS NOT NULL AND $5 != 'erledigt' THEN NULL
                                    ELSE completed_at
                                  END,
              claimed_at        = CASE
                                    WHEN $5 = 'in_bearbeitung' AND claimed_at IS NULL THEN now()
                                    ELSE claimed_at
                                  END
        WHERE id = $1
        RETURNING *`,
      [
        taskId,
        data.title ?? null,
        'description' in data,
        data.description ?? null,
        data.status ?? null,
        data.priority ?? null,
        'assigned_to' in data,
        data.assigned_to ?? null,
        'due_at' in data,
        data.due_at ?? null,
        'discord_message_id' in data,
        data.discord_message_id ?? null,
      ],
    );

    await client.query('COMMIT');
    return result.rows[0] ?? null;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// task_collaborators
// ---------------------------------------------------------------------------

/**
 * Helfer zu einer Task hinzufuegen. Idempotent (PRIMARY KEY conflict ignoriert).
 */
export async function addCollaborator(
  pool: Pool,
  taskId: string,
  userId: string,
  addedBy: string | null,
  tenantId: string | null,
): Promise<DbTaskCollaborator> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (tenantId) {
      await setTenantContext(client, tenantId);
    }

    const result = await client.query<DbTaskCollaborator>(
      `INSERT INTO task_collaborators (task_id, user_id, added_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (task_id, user_id) DO UPDATE
         SET added_by = EXCLUDED.added_by,
             added_at = now()
       RETURNING *`,
      [taskId, userId, addedBy ?? null],
    );

    await client.query('COMMIT');
    return result.rows[0];
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Helfer aus einer Task entfernen.
 */
export async function removeCollaborator(
  pool: Pool,
  taskId: string,
  userId: string,
  tenantId: string | null,
): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (tenantId) {
      await setTenantContext(client, tenantId);
    }

    const result = await client.query(
      'DELETE FROM task_collaborators WHERE task_id = $1 AND user_id = $2',
      [taskId, userId],
    );

    await client.query('COMMIT');
    return (result.rowCount ?? 0) > 0;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Alle Kollaboratoren einer Task lesen.
 */
export async function listCollaborators(
  pool: Pool,
  taskId: string,
  tenantId: string | null,
): Promise<DbTaskCollaborator[]> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (tenantId) {
      await setTenantContext(client, tenantId);
    }

    const result = await client.query<DbTaskCollaborator>(
      'SELECT * FROM task_collaborators WHERE task_id = $1 ORDER BY added_at ASC',
      [taskId],
    );

    await client.query('COMMIT');
    return result.rows;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// task_activity_log
// ---------------------------------------------------------------------------

/**
 * Aktivitaets-Eintrag anfuegen (append-only).
 */
export async function appendActivityLog(
  pool: Pool,
  taskId: string,
  tenantId: string | null,
  actorUserId: string | null,
  eventType: string,
  payload: Record<string, unknown>,
): Promise<DbTaskActivityLog> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (tenantId) {
      await setTenantContext(client, tenantId);
    }

    const result = await client.query<DbTaskActivityLog>(
      `INSERT INTO task_activity_log (task_id, actor_user_id, event_type, payload)
       VALUES ($1, $2, $3, $4::jsonb)
       RETURNING *`,
      [taskId, actorUserId ?? null, eventType, JSON.stringify(payload)],
    );

    await client.query('COMMIT');
    return result.rows[0];
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Aktivitaets-Log einer Task lesen (chronologisch aufsteigend).
 */
export async function listActivityLog(
  pool: Pool,
  taskId: string,
  tenantId: string | null,
  opts: { limit?: number; offset?: number } = {},
): Promise<{ items: DbTaskActivityLog[]; total: number }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (tenantId) {
      await setTenantContext(client, tenantId);
    }

    const limit = opts.limit ?? 100;
    const offset = opts.offset ?? 0;

    const countResult = await client.query<{ total: string }>(
      'SELECT COUNT(*) AS total FROM task_activity_log WHERE task_id = $1',
      [taskId],
    );
    const total = Number.parseInt(countResult.rows[0]?.total ?? '0', 10);

    const result = await client.query<DbTaskActivityLog>(
      `SELECT * FROM task_activity_log
        WHERE task_id = $1
        ORDER BY occurred_at ASC, id ASC
        LIMIT $2 OFFSET $3`,
      [taskId, limit, offset],
    );

    await client.query('COMMIT');
    return { items: result.rows, total };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
