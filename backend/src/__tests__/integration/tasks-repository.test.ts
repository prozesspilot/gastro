/**
 * T081 — Integrationstest des m-tasks-Repositorys gegen ECHTES Postgres.
 *
 * Beweist die SQL-Korrektheit, die der Mock-HTTP-Test (tasks-http.test.ts) NICHT
 * abdeckt: die `CASE`-Prioritäts-/Status-Sortierung, die mine/team/done-Filter
 * (cross-tenant, OHNE RLS), die Claim-/Complete-Zeitstempel und die
 * Helfer-Sichtbarkeit. `tasks` hat KEINE RLS → wir arbeiten direkt über den Pool.
 *
 * Lauf-Strategie wie die übrigen Integration-Tests: gegen DATABASE_URL (in CI
 * gesetzt + migriert, REQUIRE_DB). Lokal ohne DB sauber übersprungen.
 */
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  addCollaborator,
  changeStatus,
  createTask,
  getTaskDetail,
  listTasks,
} from '../../modules/m-tasks/services/tasks.repository';

const DB_URL =
  process.env.DATABASE_URL ??
  process.env.TEST_DATABASE_URL ??
  'postgresql://pp:pp@localhost:5432/prozesspilot_test';
const REQUIRE_DB = process.env.CI === 'true' || process.env.CI === '1';

const USER_A = '0a510510-0081-4081-8081-0000000000a1';
const USER_B = '0b510510-0081-4081-8081-0000000000b2';
const TENANT = '0c510510-0081-4081-8081-0000000000c3';
const USER_IDS = [USER_A, USER_B];

let pool: pg.Pool;
let dbAvailable = false;
const seededTaskIds: string[] = [];

/** Behält nur die in DIESEM Test angelegten Aufgaben (DB kann fremde enthalten). */
function onlyMine<T extends { id: string }>(rows: T[]): T[] {
  return rows.filter((r) => seededTaskIds.includes(r.id));
}

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: DB_URL });
  try {
    await pool.query('SELECT 1');
    dbAvailable = true;
  } catch (err) {
    await pool.end().catch(() => {});
    if (REQUIRE_DB) {
      throw new Error(
        `[T081] DB unter DATABASE_URL nicht erreichbar — in CI Pflicht. ${String(err)}`,
      );
    }
    return;
  }

  // Sauberer Ausgangszustand + Seed (als pp/Superuser — tasks hat ohnehin keine RLS).
  await pool
    .query('DELETE FROM tasks WHERE created_by = ANY($1::uuid[])', [USER_IDS])
    .catch(() => {});
  await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [USER_IDS]);
  await pool.query('DELETE FROM tenants WHERE id = $1', [TENANT]);

  await pool.query('INSERT INTO tenants (id, slug, display_name) VALUES ($1, $2, $3)', [
    TENANT,
    't081-tasks',
    'T081 Pizzeria',
  ]);
  await pool.query(
    `INSERT INTO users (id, display_name, role) VALUES
       ($1, 'Mitarbeiter A', 'mitarbeiter'),
       ($2, 'Mitarbeiter B', 'mitarbeiter')`,
    [USER_A, USER_B],
  );
});

afterAll(async () => {
  if (dbAvailable) {
    // Reihenfolge egal — tasks-FKs sind ON DELETE SET NULL/CASCADE.
    await pool
      .query(
        'DELETE FROM tasks WHERE created_by = ANY($1::uuid[]) OR assigned_to = ANY($1::uuid[])',
        [USER_IDS],
      )
      .catch(() => {});
    await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [USER_IDS]).catch(() => {});
    await pool.query('DELETE FROM tenants WHERE id = $1', [TENANT]).catch(() => {});
  }
  await pool?.end().catch(() => {});
});

async function seedTask(input: {
  title: string;
  priority: 'niedrig' | 'normal' | 'hoch' | 'kritisch';
  assignedTo: string | null;
  createdBy?: string;
  tenantId?: string | null;
}): Promise<string> {
  const task = await createTask(pool, {
    tenantId: input.tenantId ?? TENANT,
    type: 'sonstige',
    title: input.title,
    description: null,
    priority: input.priority,
    assignedTo: input.assignedTo,
    dueAt: null,
    referenceType: null,
    referenceId: null,
    createdBy: input.createdBy ?? USER_A,
  });
  seededTaskIds.push(task.id);
  return task.id;
}

describe('T081 — tasks-Repository gegen echtes Postgres', () => {
  it('createTask schreibt Aufgabe + Aktivitäts-Eintrag (transaktional) und löst Namen auf', async () => {
    if (!dbAvailable) return;
    const id = await seedTask({ title: 'Detail-Task', priority: 'normal', assignedTo: USER_A });
    const detail = await getTaskDetail(pool, id);
    expect(detail).not.toBeNull();
    expect(detail?.title).toBe('Detail-Task');
    expect(detail?.assigned_to_name).toBe('Mitarbeiter A');
    expect(detail?.created_by_name).toBe('Mitarbeiter A');
    expect(detail?.tenant_name).toBe('T081 Pizzeria');
    // 'created'-Aktivität wurde mitgeschrieben.
    expect(detail?.activity.some((a) => a.action === 'created')).toBe(true);
  });

  it('listTasks(mine) sortiert nach Priorität via CASE (kritisch→hoch→normal→niedrig), NICHT alphabetisch', async () => {
    if (!dbAvailable) return;
    await seedTask({ title: 'P-niedrig', priority: 'niedrig', assignedTo: USER_A });
    await seedTask({ title: 'P-kritisch', priority: 'kritisch', assignedTo: USER_A });
    await seedTask({ title: 'P-hoch', priority: 'hoch', assignedTo: USER_A });
    // (P-normal kommt aus dem ersten Test = 'Detail-Task')

    const rows = onlyMine(await listTasks(pool, { view: 'mine', userId: USER_A }));
    const prioOrder = rows.map((r) => r.priority);
    // Erwartung: alle 'kritisch' vor 'hoch' vor 'normal' vor 'niedrig'.
    const rank = { kritisch: 0, hoch: 1, normal: 2, niedrig: 3 } as const;
    const ranks = prioOrder.map((p) => rank[p]);
    const sorted = [...ranks].sort((a, b) => a - b);
    expect(ranks).toEqual(sorted);
    // Alphabetisch wäre hoch < kritisch — das DARF NICHT passieren:
    expect(prioOrder.indexOf('kritisch')).toBeLessThan(prioOrder.indexOf('hoch'));
  });

  it('mine vs. team: fremde (B-)Aufgabe fehlt in der mine-Sicht von A, erscheint aber im Team', async () => {
    if (!dbAvailable) return;
    const bTaskId = await seedTask({
      title: 'B-Aufgabe',
      priority: 'normal',
      assignedTo: USER_B,
      createdBy: USER_B,
    });
    const mine = onlyMine(await listTasks(pool, { view: 'mine', userId: USER_A }));
    const team = onlyMine(await listTasks(pool, { view: 'team', userId: USER_A }));
    expect(mine.map((r) => r.id)).not.toContain(bTaskId);
    expect(team.map((r) => r.id)).toContain(bTaskId);
  });

  it('Helfer-Sichtbarkeit: A sieht eine B-Aufgabe in „mine", sobald A Helfer ist', async () => {
    if (!dbAvailable) return;
    const bTaskId = await seedTask({
      title: 'B-Aufgabe-mit-Helfer',
      priority: 'hoch',
      assignedTo: USER_B,
      createdBy: USER_B,
    });
    // Vorher nicht sichtbar …
    let mine = onlyMine(await listTasks(pool, { view: 'mine', userId: USER_A }));
    expect(mine.map((r) => r.id)).not.toContain(bTaskId);
    // … nach Helfer-Einladung sichtbar.
    await addCollaborator(pool, { taskId: bTaskId, userId: USER_A, addedBy: USER_B });
    mine = onlyMine(await listTasks(pool, { view: 'mine', userId: USER_A }));
    expect(mine.map((r) => r.id)).toContain(bTaskId);
  });

  it('changeStatus: Self-Claim setzt assigned_to + claimed_at; Complete setzt completed_at und wandert nach „done"', async () => {
    if (!dbAvailable) return;
    const id = await seedTask({ title: 'Claim-Task', priority: 'normal', assignedTo: null });

    // Self-Claim durch A.
    const claimed = await changeStatus(pool, {
      taskId: id,
      newStatus: 'in_arbeit',
      actorId: USER_A,
      claim: true,
    });
    expect(claimed?.status).toBe('in_arbeit');
    expect(claimed?.assigned_to).toBe(USER_A);
    expect(claimed?.claimed_at).not.toBeNull();

    // Abschluss.
    const done = await changeStatus(pool, {
      taskId: id,
      newStatus: 'erledigt',
      actorId: USER_A,
      claim: false,
    });
    expect(done?.status).toBe('erledigt');
    expect(done?.completed_at).not.toBeNull();

    // Taucht in „done" auf, NICHT mehr in „mine" (aktive Stati).
    const doneList = onlyMine(await listTasks(pool, { view: 'done', userId: USER_A }));
    const mineList = onlyMine(await listTasks(pool, { view: 'mine', userId: USER_A }));
    expect(doneList.map((r) => r.id)).toContain(id);
    expect(mineList.map((r) => r.id)).not.toContain(id);
  });

  it('tenant_id ON DELETE SET NULL: gelöschter Mandant entwertet die Aufgabe nicht', async () => {
    if (!dbAvailable) return;
    // Eigener Wegwerf-Tenant, damit der Haupt-Seed-Tenant erhalten bleibt.
    const throwaway = '0c510510-0081-4081-8081-0000000000ff';
    await pool.query('INSERT INTO tenants (id, slug, display_name) VALUES ($1, $2, $3)', [
      throwaway,
      't081-throwaway',
      'Wegwerf',
    ]);
    const id = await seedTask({
      title: 'Tenant-SET-NULL',
      priority: 'normal',
      assignedTo: USER_A,
      tenantId: throwaway,
    });
    await pool.query('DELETE FROM tenants WHERE id = $1', [throwaway]);
    const detail = await getTaskDetail(pool, id);
    expect(detail).not.toBeNull();
    expect(detail?.tenant_id).toBeNull();
  });
});
