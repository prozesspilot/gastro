/**
 * T024 — Unit-Tests fuer tasks.repository
 *
 * Testet: BEGIN/COMMIT-Reihenfolge, parametrisiertes SQL, RLS-Context-Setzung,
 * ROLLBACK bei Fehlern, Paginierungs-Pattern (separater COUNT).
 *
 * Moeck-Strategie: identisch zu kasse-transactions.repository.test.ts —
 * Pool-Mock mit programmiertem Query-Handler, keine echte DB noetig.
 */

import type { Pool, PoolClient } from 'pg';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addCollaborator,
  appendActivityLog,
  createTask,
  getTask,
  listActivityLog,
  listCollaborators,
  listTasks,
  removeCollaborator,
  updateTask,
} from '../tasks.repository';

const TENANT_ID = '550e8400-e29b-41d4-a716-446655440001';
const TASK_ID = '550e8400-e29b-41d4-a716-446655440002';
const USER_ID = '550e8400-e29b-41d4-a716-446655440003';

type QueryFn = (
  sql: string,
  params?: unknown[],
) => { rows: unknown[]; rowCount?: number } | Promise<{ rows: unknown[]; rowCount?: number }>;

function makePool(queryFn: QueryFn): { pool: Pool; client: PoolClient } {
  const client = {
    query: vi.fn(async (sql: string, params?: unknown[]) => queryFn(sql, params)),
    release: vi.fn(),
  } as unknown as PoolClient;
  const pool = { connect: vi.fn(async () => client) } as unknown as Pool;
  return { pool, client };
}

const FAKE_TASK = {
  id: TASK_ID,
  tenant_id: TENANT_ID,
  type: 'beleg_pruefen',
  title: 'Test-Task',
  description: null,
  reference_type: null,
  reference_id: null,
  status: 'offen',
  priority: 'normal',
  assigned_to: null,
  claimed_at: null,
  due_at: null,
  completed_at: null,
  discord_message_id: null,
  created_at: new Date(),
  updated_at: new Date(),
};

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.clearAllMocks());

// ---------------------------------------------------------------------------
// createTask
// ---------------------------------------------------------------------------

describe('createTask', () => {
  it('fuehrt BEGIN → set_config → INSERT → COMMIT in dieser Reihenfolge aus', async () => {
    const sqlCalls: string[] = [];
    const { pool } = makePool((sql) => {
      sqlCalls.push(sql);
      if (sql.includes('INSERT INTO tasks')) return { rows: [FAKE_TASK] };
      return { rows: [] };
    });

    await createTask(pool, {
      tenant_id: TENANT_ID,
      type: 'beleg_pruefen',
      title: 'Test-Task',
      priority: 'normal',
    });

    const beginIdx = sqlCalls.findIndex((s) => s === 'BEGIN');
    const configIdx = sqlCalls.findIndex((s) => s.includes('set_config'));
    const insertIdx = sqlCalls.findIndex((s) => s.includes('INSERT INTO tasks'));
    const commitIdx = sqlCalls.findIndex((s) => s === 'COMMIT');

    expect(beginIdx).toBeGreaterThanOrEqual(0);
    expect(configIdx).toBeGreaterThan(beginIdx);
    expect(insertIdx).toBeGreaterThan(configIdx);
    expect(commitIdx).toBeGreaterThan(insertIdx);
  });

  it('setzt tenant_id korrekt in set_config', async () => {
    const configParams: unknown[][] = [];
    const { pool } = makePool((sql, params) => {
      if (sql.includes('set_config')) configParams.push(params ?? []);
      if (sql.includes('INSERT INTO tasks')) return { rows: [FAKE_TASK] };
      return { rows: [] };
    });

    await createTask(pool, {
      tenant_id: TENANT_ID,
      type: 'beleg_pruefen',
      title: 'X',
      priority: 'normal',
    });

    expect(configParams.length).toBeGreaterThan(0);
    expect(configParams[0]).toContain(TENANT_ID);
  });

  it('ROLLBACK bei INSERT-Fehler', async () => {
    const sqlCalls: string[] = [];
    const { pool } = makePool((sql) => {
      sqlCalls.push(sql);
      if (sql.includes('INSERT INTO tasks')) throw new Error('constraint violation');
      return { rows: [] };
    });

    await expect(
      createTask(pool, {
        tenant_id: TENANT_ID,
        type: 'beleg_pruefen',
        title: 'X',
        priority: 'normal',
      }),
    ).rejects.toThrow('constraint violation');

    expect(sqlCalls).toContain('ROLLBACK');
    expect(sqlCalls).not.toContain('COMMIT');
  });

  it('kein set_config wenn tenant_id null', async () => {
    const sqlCalls: string[] = [];
    const { pool } = makePool((sql) => {
      sqlCalls.push(sql);
      if (sql.includes('INSERT INTO tasks')) return { rows: [{ ...FAKE_TASK, tenant_id: null }] };
      return { rows: [] };
    });

    await createTask(pool, {
      type: 'provisions_report',
      title: 'Globale Task',
      priority: 'normal',
    });

    const hasSetConfig = sqlCalls.some((s) => s.includes('set_config'));
    expect(hasSetConfig).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// listTasks
// ---------------------------------------------------------------------------

describe('listTasks', () => {
  it('COUNT-Query ist separat vom SELECT (Paginierungs-Pattern)', async () => {
    const sqls: string[] = [];
    const { pool } = makePool((sql) => {
      sqls.push(sql);
      if (sql.includes('COUNT(*) AS total')) return { rows: [{ total: '7' }] };
      if (sql.includes('FROM tasks')) return { rows: [FAKE_TASK] };
      return { rows: [] };
    });

    const result = await listTasks(pool, {
      tenantId: TENANT_ID,
      limit: 10,
      offset: 0,
    });

    expect(result.total).toBe(7);
    expect(result.items).toHaveLength(1);

    const countQuery = sqls.find((s) => s.includes('COUNT(*) AS total'));
    const selectQuery = sqls.find((s) => s.includes('ORDER BY') && s.includes('FROM tasks'));
    expect(countQuery).toBeDefined();
    expect(selectQuery).toBeDefined();
    // Kein COUNT im SELECT-Query (kein Window-COUNT)
    expect(selectQuery).not.toContain('COUNT(*) OVER');
  });

  it('total bleibt korrekt bei leerer Ergebnis-Seite (Regression)', async () => {
    const { pool } = makePool((sql) => {
      if (sql.includes('COUNT(*) AS total')) return { rows: [{ total: '42' }] };
      if (sql.includes('FROM tasks')) return { rows: [] }; // leere Seite
      return { rows: [] };
    });

    const result = await listTasks(pool, { tenantId: TENANT_ID, limit: 10, offset: 100 });
    expect(result.total).toBe(42);
    expect(result.items).toEqual([]);
  });

  it('ROLLBACK bei DB-Fehler', async () => {
    const sqlCalls: string[] = [];
    const { pool } = makePool((sql) => {
      sqlCalls.push(sql);
      if (sql.includes('COUNT(*) AS total')) throw new Error('db error');
      return { rows: [] };
    });

    await expect(listTasks(pool, { tenantId: TENANT_ID, limit: 10, offset: 0 })).rejects.toThrow(
      'db error',
    );

    expect(sqlCalls).toContain('ROLLBACK');
  });
});

// ---------------------------------------------------------------------------
// getTask
// ---------------------------------------------------------------------------

describe('getTask', () => {
  it('gibt null zurueck wenn Task nicht gefunden', async () => {
    const { pool } = makePool((sql) => {
      if (sql.includes('SELECT * FROM tasks')) return { rows: [] };
      return { rows: [] };
    });

    const result = await getTask(pool, TASK_ID, TENANT_ID);
    expect(result).toBeNull();
  });

  it('gibt Task zurueck wenn gefunden', async () => {
    const { pool } = makePool((sql) => {
      if (sql.includes('SELECT * FROM tasks')) return { rows: [FAKE_TASK] };
      return { rows: [] };
    });

    const result = await getTask(pool, TASK_ID, TENANT_ID);
    expect(result).not.toBeNull();
    expect(result?.id).toBe(TASK_ID);
  });
});

// ---------------------------------------------------------------------------
// updateTask
// ---------------------------------------------------------------------------

describe('updateTask', () => {
  it('gibt null zurueck wenn Task nicht existiert', async () => {
    const { pool } = makePool((sql) => {
      if (sql.includes('UPDATE tasks')) return { rows: [] };
      return { rows: [] };
    });

    const result = await updateTask(pool, TASK_ID, TENANT_ID, { status: 'erledigt' });
    expect(result).toBeNull();
  });

  it('setzt completed_at automatisch bei status=erledigt', async () => {
    let capturedSql = '';
    const { pool } = makePool((sql) => {
      if (sql.includes('UPDATE tasks')) {
        capturedSql = sql;
        return { rows: [{ ...FAKE_TASK, status: 'erledigt', completed_at: new Date() }] };
      }
      return { rows: [] };
    });

    await updateTask(pool, TASK_ID, TENANT_ID, { status: 'erledigt' });
    expect(capturedSql).toContain('completed_at');
    expect(capturedSql).toContain('erledigt');
  });
});

// ---------------------------------------------------------------------------
// addCollaborator / removeCollaborator / listCollaborators
// ---------------------------------------------------------------------------

describe('addCollaborator', () => {
  it('ON CONFLICT ... DO UPDATE fuer Idempotenz', async () => {
    let capturedSql = '';
    const { pool } = makePool((sql) => {
      if (sql.includes('INSERT INTO task_collaborators')) {
        capturedSql = sql;
        return {
          rows: [
            {
              task_id: TASK_ID,
              user_id: USER_ID,
              tenant_id: TENANT_ID,
              added_by: null,
              added_at: new Date(),
            },
          ],
        };
      }
      return { rows: [] };
    });

    await addCollaborator(pool, TASK_ID, USER_ID, null, TENANT_ID);
    expect(capturedSql).toContain('ON CONFLICT');
    expect(capturedSql).toContain('DO UPDATE');
  });
});

describe('removeCollaborator', () => {
  it('gibt true zurueck wenn eine Row geloescht wurde', async () => {
    const { pool } = makePool((sql) => {
      if (sql.includes('DELETE FROM task_collaborators')) return { rows: [], rowCount: 1 };
      return { rows: [] };
    });

    const result = await removeCollaborator(pool, TASK_ID, USER_ID, TENANT_ID);
    expect(result).toBe(true);
  });

  it('gibt false zurueck wenn keine Row geloescht wurde', async () => {
    const { pool } = makePool((sql) => {
      if (sql.includes('DELETE FROM task_collaborators')) return { rows: [], rowCount: 0 };
      return { rows: [] };
    });

    const result = await removeCollaborator(pool, TASK_ID, USER_ID, TENANT_ID);
    expect(result).toBe(false);
  });
});

describe('listCollaborators', () => {
  it('leeres Array wenn keine Kollaboratoren', async () => {
    const { pool } = makePool(() => ({ rows: [] }));
    const result = await listCollaborators(pool, TASK_ID, TENANT_ID);
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// appendActivityLog / listActivityLog
// ---------------------------------------------------------------------------

describe('appendActivityLog', () => {
  it('INSERT mit JSON.stringify(payload)', async () => {
    let capturedParams: unknown[] = [];
    const { pool } = makePool((sql, params) => {
      if (sql.includes('INSERT INTO task_activity_log')) {
        capturedParams = params ?? [];
        return {
          rows: [
            {
              id: 1,
              task_id: TASK_ID,
              tenant_id: TENANT_ID,
              actor_user_id: USER_ID,
              event_type: 'created',
              payload: { foo: 'bar' },
              occurred_at: new Date(),
            },
          ],
        };
      }
      return { rows: [] };
    });

    await appendActivityLog(pool, TASK_ID, TENANT_ID, USER_ID, 'created', { foo: 'bar' });

    // 4. Parameter ist das JSON-String der Payload
    const payloadParam = capturedParams[3] as string;
    expect(typeof payloadParam).toBe('string');
    expect(JSON.parse(payloadParam)).toEqual({ foo: 'bar' });
  });
});

describe('listActivityLog', () => {
  it('separater COUNT + paginiertes SELECT', async () => {
    const sqls: string[] = [];
    const { pool } = makePool((sql) => {
      sqls.push(sql);
      if (sql.includes('COUNT(*) AS total')) return { rows: [{ total: '3' }] };
      if (sql.includes('FROM task_activity_log')) {
        return {
          rows: [
            {
              id: 1,
              task_id: TASK_ID,
              event_type: 'created',
              payload: {},
              occurred_at: new Date(),
            },
          ],
        };
      }
      return { rows: [] };
    });

    const result = await listActivityLog(pool, TASK_ID, TENANT_ID, { limit: 10, offset: 0 });
    expect(result.total).toBe(3);
    expect(result.items).toHaveLength(1);

    expect(sqls.some((s) => s.includes('COUNT(*) AS total'))).toBe(true);
    expect(sqls.some((s) => s.includes('ORDER BY occurred_at ASC'))).toBe(true);
  });
});
