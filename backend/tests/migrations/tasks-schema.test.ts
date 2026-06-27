/**
 * Schema-Test für T080 — Mitarbeiter-Aufgaben-Dashboard-Datenmodell (Migration 127).
 *
 * Verifiziert nach frischem `npm run migrate`:
 *   - tasks / task_collaborators / task_activity_log existieren
 *   - tasks ist BEWUSST OHNE RLS (interne, cross-tenant Staff-Tabelle) — schützt
 *     die in 127_tasks.sql begründete Architektur-Entscheidung gegen Regression
 *   - gastro_app (NOBYPASSRLS) kann ohne Tenant-Kontext zugreifen (No-RLS funktional)
 *   - tenant_id ist nullable (globale/interne Aufgaben), Defaults greifen
 *   - status/priority CHECK-Constraints lehnen ungültige Werte ab
 *   - NOT NULL (title) + Default-NULL (claimed_at/completed_at/due_at)
 *   - der set_updated_at()-Trigger feuert bei UPDATE
 *   - FK-Verhalten: ON DELETE CASCADE (activity_log, collaborators) +
 *     ON DELETE SET NULL (assigned_to), PK-Uniqueness (collaborators)
 *   - die fünf spezifizierten Indizes inkl. partieller WHERE-Klausel
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

  it('task_activity_log hängt per FK an tasks (ON DELETE CASCADE)', async () => {
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

  it('task_collaborators: ON DELETE CASCADE beim Task-Löschen + PK verhindert Duplikate', async () => {
    const client = await pool.connect();
    try {
      // PK-Uniqueness: doppeltes (task_id, user_id) muss scheitern.
      await client.query('BEGIN');
      const task = await client.query<{ id: string }>(
        `INSERT INTO tasks (type, title) VALUES ('x', 'y') RETURNING id`,
      );
      const user = await client.query<{ id: string }>(
        `INSERT INTO users (display_name, role) VALUES ('Collab Test', 'mitarbeiter') RETURNING id`,
      );
      const taskId = task.rows[0].id;
      const userId = user.rows[0].id;
      await client.query('INSERT INTO task_collaborators (task_id, user_id) VALUES ($1, $2)', [
        taskId,
        userId,
      ]);
      await expect(
        client.query('INSERT INTO task_collaborators (task_id, user_id) VALUES ($1, $2)', [
          taskId,
          userId,
        ]),
      ).rejects.toThrow(/duplicate key|task_collaborators_pkey/i);
      await client.query('ROLLBACK');

      // CASCADE: Task löschen entfernt die Collaborator-Zeile.
      await client.query('BEGIN');
      const task2 = await client.query<{ id: string }>(
        `INSERT INTO tasks (type, title) VALUES ('x', 'y') RETURNING id`,
      );
      const user2 = await client.query<{ id: string }>(
        `INSERT INTO users (display_name, role) VALUES ('Collab Test 2', 'mitarbeiter') RETURNING id`,
      );
      const t2 = task2.rows[0].id;
      await client.query('INSERT INTO task_collaborators (task_id, user_id) VALUES ($1, $2)', [
        t2,
        user2.rows[0].id,
      ]);
      await client.query('DELETE FROM tasks WHERE id = $1', [t2]);
      const { rows } = await client.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM task_collaborators WHERE task_id = $1',
        [t2],
      );
      expect(rows[0].count).toBe('0');
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });

  it('ON DELETE SET NULL: User-Löschung setzt assigned_to=NULL, Task bleibt erhalten', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const user = await client.query<{ id: string }>(
        `INSERT INTO users (display_name, role) VALUES ('Assignee Test', 'mitarbeiter') RETURNING id`,
      );
      const task = await client.query<{ id: string }>(
        'INSERT INTO tasks (type, title, assigned_to) VALUES ($1, $2, $3) RETURNING id',
        ['beleg_pruefen', 'Mit Assignee', user.rows[0].id],
      );
      const taskId = task.rows[0].id;
      await client.query('DELETE FROM users WHERE id = $1', [user.rows[0].id]);
      const { rows } = await client.query<{ assigned_to: string | null }>(
        'SELECT assigned_to FROM tasks WHERE id = $1',
        [taskId],
      );
      expect(rows).toHaveLength(1); // Task existiert weiter
      expect(rows[0].assigned_to).toBeNull(); // FK auf NULL gesetzt
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });

  it('gastro_app (NOBYPASSRLS) kann ohne gesetzten Tenant-Kontext auf tasks zugreifen', async () => {
    // Funktionaler Beweis des Architektur-Kerns: ohne RLS-Policy ist tasks für
    // gastro_app voll les-/schreibbar OHNE app.current_tenant — anders als belege,
    // wo RLS ohne Tenant-Kontext 0 Rows liefert. Rolle + GRANTs idempotent
    // herstellen (Muster wie schema.test.ts).
    const setup = await pool.connect();
    try {
      await setup.query(`DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='gastro_app') THEN
            CREATE ROLE gastro_app WITH LOGIN PASSWORD 'app_pw' NOSUPERUSER NOBYPASSRLS;
          END IF;
        END $$;`);
      await setup.query('GRANT USAGE ON SCHEMA public TO gastro_app');
      await setup.query(
        'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO gastro_app',
      );
      await setup.query('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO gastro_app');
    } finally {
      setup.release();
    }
    const appUrl = (TEST_DB_URL as string).replace(/\/\/[^:]+:[^@]+@/, '//gastro_app:app_pw@');
    const appPool = new Pool({ connectionString: appUrl });
    try {
      const appClient = await appPool.connect();
      try {
        await appClient.query('BEGIN');
        const ins = await appClient.query<{ id: string }>(
          `INSERT INTO tasks (type, title) VALUES ('manuelle_aufgabe', 'gastro_app insert') RETURNING id`,
        );
        expect(ins.rows[0].id).toBeTruthy();
        const sel = await appClient.query<{ count: string }>(
          'SELECT count(*)::text AS count FROM tasks WHERE id = $1',
          [ins.rows[0].id],
        );
        expect(sel.rows[0].count).toBe('1');
        await appClient.query('ROLLBACK');
      } finally {
        appClient.release();
      }
    } finally {
      await appPool.end();
    }
  });

  it('legt die spezifizierten Indizes an (inkl. partieller WHERE-Klausel)', async () => {
    const { rows } = await pool.query<{ indexname: string; indexdef: string }>(
      `SELECT indexname, indexdef FROM pg_indexes
       WHERE schemaname = 'public'
         AND tablename IN ('tasks','task_collaborators','task_activity_log')`,
    );
    const names = rows.map((r) => r.indexname);
    for (const idx of [
      'idx_tasks_assigned_open',
      'idx_tasks_status_priority',
      'idx_tasks_tenant',
      'idx_task_collaborators_user',
      'idx_task_activity_log_task',
    ]) {
      expect(names).toContain(idx);
    }
    // Partieller Index trägt die WHERE-Klausel — ein Tippfehler dort = stiller Index-Verlust.
    const partial = rows.find((r) => r.indexname === 'idx_tasks_assigned_open');
    expect(partial?.indexdef.toLowerCase()).toContain('where');
    expect(partial?.indexdef).toContain('erledigt');
    expect(partial?.indexdef).toContain('verworfen');
  });

  it('erzwingt NOT NULL auf title; claimed_at/completed_at/due_at sind per Default NULL', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await expect(
        client.query(`INSERT INTO tasks (type) VALUES ('manuelle_aufgabe')`),
      ).rejects.toThrow(/not-null|null value|title/i);
      await client.query('ROLLBACK');

      await client.query('BEGIN');
      const { rows } = await client.query<{
        claimed_at: string | null;
        completed_at: string | null;
        due_at: string | null;
      }>(
        `INSERT INTO tasks (type, title) VALUES ('x', 'y')
         RETURNING claimed_at, completed_at, due_at`,
      );
      expect(rows[0].claimed_at).toBeNull();
      expect(rows[0].completed_at).toBeNull();
      expect(rows[0].due_at).toBeNull();
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });
});
