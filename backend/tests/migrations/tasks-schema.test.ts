/**
 * Schema-Test für T080 — Mitarbeiter-Aufgaben-Dashboard-Datenmodell (Migration 127).
 *
 * Verifiziert nach frischem `npm run migrate`:
 *   - tasks / task_collaborators / task_activity_log existieren
 *   - tasks ist BEWUSST OHNE RLS (interne, cross-tenant Staff-Tabelle) — schützt
 *     die in 127_tasks.sql begründete Architektur-Entscheidung gegen Regression
 *   - tenant_id ist nullable (globale/interne Aufgaben), Defaults greifen
 *   - status/priority CHECK-Constraints lehnen ungültige Werte ab
 *   - der set_updated_at()-Trigger feuert bei UPDATE
 *
 * Erfordert eine erreichbare Postgres-DB (TEST_DATABASE_URL). Ohne DB wird der
 * Block ehrlich übersprungen (CI fährt ihn), Muster wie schema.test.ts.
 */

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const TEST_DB_URL = process.env.TEST_DATABASE_URL;
const hasDb = !!TEST_DB_URL;

describe.skipIf(!hasDb)('T080 tasks schema', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DB_URL });
  });

  afterAll(async () => {
    await pool.end();
  });

  it('legt tasks, task_collaborators und task_activity_log an', async () => {
    const { rows } = await pool.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
    );
    const names = rows.map((r) => r.table_name);
    expect(names).toContain('tasks');
    expect(names).toContain('task_collaborators');
    expect(names).toContain('task_activity_log');
  });

  it('tasks ist bewusst OHNE RLS (interne cross-tenant Staff-Tabelle)', async () => {
    // Architektur-Entscheidung T080: keine Tenant-RLS, da ein Mitarbeiter
    // "alle meine Aufgaben über alle Mandanten" sieht. Dieser Test verhindert,
    // dass jemand später versehentlich RLS aktiviert und das Dashboard bricht.
    const { rows } = await pool.query<{ relrowsecurity: boolean }>(
      `SELECT relrowsecurity FROM pg_class
       WHERE relkind = 'r'
         AND relname = 'tasks'
         AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')`,
    );
    expect(rows[0]?.relrowsecurity).toBe(false);
  });

  it('tenant_id ist nullable, Defaults für status/priority greifen', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query<{
        tenant_id: string | null;
        status: string;
        priority: string;
      }>(
        `INSERT INTO tasks (type, title)
         VALUES ('manuelle_aufgabe', 'Test ohne Mandant')
         RETURNING tenant_id, status, priority`,
      );
      expect(rows[0].tenant_id).toBeNull();
      expect(rows[0].status).toBe('offen');
      expect(rows[0].priority).toBe('normal');
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });

  it('lehnt ungültigen status ab (CHECK-Constraint)', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await expect(
        client.query(`INSERT INTO tasks (type, title, status) VALUES ('x', 'y', 'hacked')`),
      ).rejects.toThrow(/check constraint|tasks_status_check/i);
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });

  it('lehnt ungültige priority ab (CHECK-Constraint)', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await expect(
        client.query(`INSERT INTO tasks (type, title, priority) VALUES ('x', 'y', 'ultra')`),
      ).rejects.toThrow(/check constraint|tasks_priority_check/i);
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });

  it('set_updated_at()-Trigger überschreibt updated_at bei UPDATE', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // updated_at bewusst alt setzen — der Trigger muss es bei UPDATE auf now() ziehen.
      const ins = await client.query<{ id: string }>(
        `INSERT INTO tasks (type, title, updated_at)
         VALUES ('x', 'y', '2000-01-01T00:00:00Z')
         RETURNING id`,
      );
      const { rows } = await client.query<{ updated_at: string }>(
        `UPDATE tasks SET title = 'z' WHERE id = $1 RETURNING updated_at`,
        [ins.rows[0].id],
      );
      expect(new Date(rows[0].updated_at).getUTCFullYear()).toBeGreaterThan(2000);
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });

  it('task_activity_log + task_collaborators hängen per FK an tasks (CASCADE)', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const task = await client.query<{ id: string }>(
        `INSERT INTO tasks (type, title) VALUES ('x', 'y') RETURNING id`,
      );
      const taskId = task.rows[0].id;
      await client.query(
        `INSERT INTO task_activity_log (task_id, action, payload)
         VALUES ($1, 'created', '{"by":"test"}'::jsonb)`,
        [taskId],
      );
      // Löschen der Task entfernt den Activity-Log-Eintrag (ON DELETE CASCADE).
      await client.query('DELETE FROM tasks WHERE id = $1', [taskId]);
      const { rows } = await client.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM task_activity_log WHERE task_id = $1',
        [taskId],
      );
      expect(rows[0].count).toBe('0');
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });
});
