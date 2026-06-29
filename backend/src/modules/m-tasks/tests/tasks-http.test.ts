/**
 * T081 — HTTP-Tests für das Mitarbeiter-Aufgaben-Dashboard.
 *
 * Muster wie webchat-http.test.ts: minimale Fastify-Instanz, konfigurierbarer
 * Mock-Pool (SQL-String-Matching), JWT-Cookie via signM14Token. Geprüft werden
 * Auth (401), Rollen-Gates (403 support), Mutations-Berechtigung (403 fremde
 * Aufgabe), Validierung (422), Happy-Paths. Die SQL-/Schema-Korrektheit selbst
 * deckt der echte-DB-Integrationstest ab (tests/tasks.integration.test.ts).
 */
import fastifyCookie from '@fastify/cookie';
import Fastify from 'fastify';
import type { Pool, PoolClient } from 'pg';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { signM14Token } from '../../m14-auth/m14-jwt';
import { tasksRoutes } from '../tasks.routes';

const STAFF_A = '550e8400-e29b-41d4-a716-446655440001'; // Akteur in den Tests
const STAFF_B = '550e8400-e29b-41d4-a716-446655440002'; // ein anderer Mitarbeiter
const TASK_ID = '550e8400-e29b-41d4-a716-4466554400a0';
const TENANT_ID = '550e8400-e29b-41d4-a716-446655440000';

function makeToken(
  role: 'geschaeftsfuehrer' | 'mitarbeiter' | 'support' = 'mitarbeiter',
  userId = STAFF_A,
) {
  return signM14Token({ userId, discordId: 'discord-test', role, displayName: 'Test' });
}

function makeTaskRow(overrides: Record<string, unknown> = {}) {
  return {
    id: TASK_ID,
    tenant_id: TENANT_ID,
    type: 'sonstige',
    title: 'Beleg prüfen',
    description: null,
    reference_type: null,
    reference_id: null,
    status: 'offen',
    priority: 'normal',
    assigned_to: null,
    created_by: STAFF_A,
    claimed_at: null,
    due_at: null,
    completed_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    assigned_to_name: null,
    created_by_name: 'Test',
    tenant_name: 'Pizzeria Bella',
    collaborator_count: 0,
    ...overrides,
  };
}

interface MockOpts {
  /** Roh-Aufgabe für getTaskRaw (null = 404). */
  taskRaw?: Record<string, unknown> | null;
  /** Angereicherte Aufgabe für getTaskListItem / Detail (Default: makeTaskRow). */
  taskItem?: Record<string, unknown> | null;
  /** Liste für listTasks. */
  tasks?: Record<string, unknown>[];
  /** isCollaborator-Ergebnis. */
  isCollaborator?: boolean;
  /** isActiveUser-Ergebnis. */
  isActiveUser?: boolean;
  /** UPDATE tasks RETURNING leer → 404 (Aufgabe verschwand). */
  updateMisses?: boolean;
  /** INSERT task_collaborators ON CONFLICT → leer (war schon Helfer). */
  collabConflict?: boolean;
  onQuery?: (sql: string) => void;
}

function makeMockPool(opts: MockOpts = {}) {
  const taskItem = opts.taskItem === undefined ? makeTaskRow() : opts.taskItem;

  const client = {
    query: vi.fn(async (sql: string) => {
      opts.onQuery?.(sql);
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
      if (sql.includes('INSERT INTO tasks')) return { rows: [{ id: TASK_ID }] };
      if (sql.includes('UPDATE tasks')) return { rows: opts.updateMisses ? [] : [{ id: TASK_ID }] };
      if (sql.includes('INSERT INTO task_collaborators'))
        return { rows: opts.collabConflict ? [] : [{ user_id: STAFF_B }] };
      if (sql.includes('INSERT INTO task_activity_log')) return { rows: [] };
      return { rows: [] };
    }),
    release: vi.fn(),
  } as unknown as PoolClient;

  const pool = {
    connect: vi.fn(async () => client),
    query: vi.fn(async (sql: string) => {
      opts.onQuery?.(sql);
      // Reihenfolge wichtig: spezifische Muster zuerst.
      if (sql.includes('FROM tasks t') && sql.includes('WHERE t.id ='))
        return { rows: taskItem ? [taskItem] : [] };
      if (sql.includes('FROM tasks t')) return { rows: opts.tasks ?? [] };
      if (sql.includes('FROM tasks WHERE id'))
        return { rows: opts.taskRaw === undefined ? [] : opts.taskRaw ? [opts.taskRaw] : [] };
      if (sql.includes('FROM task_collaborators') && sql.includes('SELECT 1'))
        return { rows: opts.isCollaborator ? [{ '?column?': 1 }] : [] };
      if (sql.includes('FROM task_collaborators')) return { rows: [] }; // listCollaborators
      if (sql.includes('FROM task_activity_log')) return { rows: [] };
      if (sql.includes('FROM users WHERE id') && sql.includes('SELECT 1'))
        return { rows: opts.isActiveUser === false ? [] : [{ '?column?': 1 }] };
      if (sql.includes('FROM users') && sql.includes('ORDER BY display_name'))
        return { rows: [{ id: STAFF_B, display_name: 'Kollege', role: 'mitarbeiter' }] };
      return { rows: [] };
    }),
  } as unknown as Pool;
  return pool;
}

async function buildTestApp(opts: MockOpts = {}) {
  const app = Fastify({ logger: false });
  app.decorate('db', makeMockPool(opts));
  await app.register(fastifyCookie);
  await app.register(tasksRoutes, { prefix: '/api/v1/tasks' });
  await app.ready();
  return app;
}

let currentApp: Awaited<ReturnType<typeof buildTestApp>> | null = null;
beforeEach(() => vi.clearAllMocks());
afterEach(async () => {
  if (currentApp) {
    await currentApp.close();
    currentApp = null;
  }
});

// ── GET /tasks ───────────────────────────────────────────────────────────────
describe('GET /api/v1/tasks', () => {
  it('401 ohne Cookie', async () => {
    currentApp = await buildTestApp();
    const r = await currentApp.inject({ method: 'GET', url: '/api/v1/tasks' });
    expect(r.statusCode).toBe(401);
  });

  it('200 + Liste (Default-View mine)', async () => {
    currentApp = await buildTestApp({ tasks: [makeTaskRow()] });
    const r = await currentApp.inject({
      method: 'GET',
      url: '/api/v1/tasks',
      cookies: { pp_auth: makeToken('mitarbeiter') },
    });
    expect(r.statusCode).toBe(200);
    expect(JSON.parse(r.body).tasks).toHaveLength(1);
  });

  it('„mine"-View filtert IM SQL nach assigned_to/collaborator (Invariante 3)', async () => {
    const seen: string[] = [];
    currentApp = await buildTestApp({ tasks: [], onQuery: (s) => seen.push(s) });
    await currentApp.inject({
      method: 'GET',
      url: '/api/v1/tasks?view=mine',
      cookies: { pp_auth: makeToken('mitarbeiter') },
    });
    const listSql = seen.find((s) => s.includes('FROM tasks t') && !s.includes('WHERE t.id ='));
    expect(listSql).toBeDefined();
    expect(listSql).toContain('assigned_to = $1');
    expect(listSql).toContain('task_collaborators');
  });

  it('422 bei unbekanntem view', async () => {
    currentApp = await buildTestApp();
    const r = await currentApp.inject({
      method: 'GET',
      url: '/api/v1/tasks?view=quatsch',
      cookies: { pp_auth: makeToken() },
    });
    expect(r.statusCode).toBe(422);
  });

  it('support DARF lesen (200)', async () => {
    currentApp = await buildTestApp({ tasks: [] });
    const r = await currentApp.inject({
      method: 'GET',
      url: '/api/v1/tasks?view=team',
      cookies: { pp_auth: makeToken('support') },
    });
    expect(r.statusCode).toBe(200);
  });
});

// ── POST /tasks ──────────────────────────────────────────────────────────────
describe('POST /api/v1/tasks', () => {
  it('201 Happy-Path (mitarbeiter legt Aufgabe an)', async () => {
    currentApp = await buildTestApp();
    const r = await currentApp.inject({
      method: 'POST',
      url: '/api/v1/tasks',
      cookies: { pp_auth: makeToken('mitarbeiter') },
      payload: { title: 'Neue Aufgabe', priority: 'hoch' },
    });
    expect(r.statusCode).toBe(201);
    expect(JSON.parse(r.body).task.id).toBe(TASK_ID);
  });

  it('403 support darf nicht anlegen', async () => {
    currentApp = await buildTestApp();
    const r = await currentApp.inject({
      method: 'POST',
      url: '/api/v1/tasks',
      cookies: { pp_auth: makeToken('support') },
      payload: { title: 'X' },
    });
    expect(r.statusCode).toBe(403);
  });

  it('403 mitarbeiter darf NICHT einem anderen zuweisen (Management-Aktion)', async () => {
    currentApp = await buildTestApp({ isActiveUser: true });
    const r = await currentApp.inject({
      method: 'POST',
      url: '/api/v1/tasks',
      cookies: { pp_auth: makeToken('mitarbeiter', STAFF_A) },
      payload: { title: 'X', assigned_to: STAFF_B },
    });
    expect(r.statusCode).toBe(403);
  });

  it('201 gf darf einem anderen zuweisen', async () => {
    currentApp = await buildTestApp({ isActiveUser: true });
    const r = await currentApp.inject({
      method: 'POST',
      url: '/api/v1/tasks',
      cookies: { pp_auth: makeToken('geschaeftsfuehrer', STAFF_A) },
      payload: { title: 'X', assigned_to: STAFF_B },
    });
    expect(r.statusCode).toBe(201);
  });

  it('422 bei leerem Titel', async () => {
    currentApp = await buildTestApp();
    const r = await currentApp.inject({
      method: 'POST',
      url: '/api/v1/tasks',
      cookies: { pp_auth: makeToken('mitarbeiter') },
      payload: { title: '   ' },
    });
    expect(r.statusCode).toBe(422);
  });
});

// ── POST /tasks/:id/status ───────────────────────────────────────────────────
describe('POST /api/v1/tasks/:id/status', () => {
  it('200 Self-Claim: unzugewiesene Aufgabe auf in_arbeit ziehen', async () => {
    currentApp = await buildTestApp({
      taskRaw: { id: TASK_ID, assigned_to: null, created_by: STAFF_B, status: 'offen' },
    });
    const r = await currentApp.inject({
      method: 'POST',
      url: `/api/v1/tasks/${TASK_ID}/status`,
      cookies: { pp_auth: makeToken('mitarbeiter', STAFF_A) },
      payload: { status: 'in_arbeit' },
    });
    expect(r.statusCode).toBe(200);
  });

  it('403 fremde Aufgabe (B zugewiesen) darf A nicht abschließen (Invariante 7)', async () => {
    currentApp = await buildTestApp({
      taskRaw: { id: TASK_ID, assigned_to: STAFF_B, created_by: STAFF_B, status: 'in_arbeit' },
      isCollaborator: false,
    });
    const r = await currentApp.inject({
      method: 'POST',
      url: `/api/v1/tasks/${TASK_ID}/status`,
      cookies: { pp_auth: makeToken('mitarbeiter', STAFF_A) },
      payload: { status: 'erledigt' },
    });
    expect(r.statusCode).toBe(403);
  });

  it('200 gf darf fremde Aufgabe abschließen', async () => {
    currentApp = await buildTestApp({
      taskRaw: { id: TASK_ID, assigned_to: STAFF_B, created_by: STAFF_B, status: 'in_arbeit' },
    });
    const r = await currentApp.inject({
      method: 'POST',
      url: `/api/v1/tasks/${TASK_ID}/status`,
      cookies: { pp_auth: makeToken('geschaeftsfuehrer', STAFF_A) },
      payload: { status: 'erledigt' },
    });
    expect(r.statusCode).toBe(200);
  });

  it('200 Helfer darf Status ändern', async () => {
    currentApp = await buildTestApp({
      taskRaw: { id: TASK_ID, assigned_to: STAFF_B, created_by: STAFF_B, status: 'in_arbeit' },
      isCollaborator: true,
    });
    const r = await currentApp.inject({
      method: 'POST',
      url: `/api/v1/tasks/${TASK_ID}/status`,
      cookies: { pp_auth: makeToken('mitarbeiter', STAFF_A) },
      payload: { status: 'pausiert' },
    });
    expect(r.statusCode).toBe(200);
  });

  it('404 unbekannte Aufgabe', async () => {
    currentApp = await buildTestApp({ taskRaw: null });
    const r = await currentApp.inject({
      method: 'POST',
      url: `/api/v1/tasks/${TASK_ID}/status`,
      cookies: { pp_auth: makeToken('geschaeftsfuehrer') },
      payload: { status: 'erledigt' },
    });
    expect(r.statusCode).toBe(404);
  });

  it('422 ungültiger Status', async () => {
    currentApp = await buildTestApp({
      taskRaw: { id: TASK_ID, assigned_to: STAFF_A, created_by: STAFF_A, status: 'offen' },
    });
    const r = await currentApp.inject({
      method: 'POST',
      url: `/api/v1/tasks/${TASK_ID}/status`,
      cookies: { pp_auth: makeToken('mitarbeiter', STAFF_A) },
      payload: { status: 'fertig' },
    });
    expect(r.statusCode).toBe(422);
  });

  it('403 support darf keinen Status ändern', async () => {
    currentApp = await buildTestApp({
      taskRaw: { id: TASK_ID, assigned_to: null, created_by: STAFF_B, status: 'offen' },
    });
    const r = await currentApp.inject({
      method: 'POST',
      url: `/api/v1/tasks/${TASK_ID}/status`,
      cookies: { pp_auth: makeToken('support', STAFF_A) },
      payload: { status: 'in_arbeit' },
    });
    expect(r.statusCode).toBe(403);
  });

  it('403 Self-Claim auf ERLEDIGTE (unzugewiesene) Aufgabe durch Nicht-Beteiligten', async () => {
    // Quell-Status nicht aktiv → kein Self-Claim → fällt auf Mutations-Check (403).
    currentApp = await buildTestApp({
      taskRaw: { id: TASK_ID, assigned_to: null, created_by: STAFF_B, status: 'erledigt' },
      isCollaborator: false,
    });
    const r = await currentApp.inject({
      method: 'POST',
      url: `/api/v1/tasks/${TASK_ID}/status`,
      cookies: { pp_auth: makeToken('mitarbeiter', STAFF_A) },
      payload: { status: 'in_arbeit' },
    });
    expect(r.statusCode).toBe(403);
  });
});

// ── PATCH /tasks/:id ─────────────────────────────────────────────────────────
describe('PATCH /api/v1/tasks/:id', () => {
  it('200 Ersteller darf bearbeiten', async () => {
    currentApp = await buildTestApp({
      taskRaw: { id: TASK_ID, assigned_to: null, created_by: STAFF_A, status: 'offen' },
    });
    const r = await currentApp.inject({
      method: 'PATCH',
      url: `/api/v1/tasks/${TASK_ID}`,
      cookies: { pp_auth: makeToken('mitarbeiter', STAFF_A) },
      payload: { title: 'Korrigierter Titel', priority: 'kritisch' },
    });
    expect(r.statusCode).toBe(200);
  });

  it('403 Nicht-Beteiligter darf nicht bearbeiten', async () => {
    currentApp = await buildTestApp({
      taskRaw: { id: TASK_ID, assigned_to: STAFF_B, created_by: STAFF_B, status: 'offen' },
      isCollaborator: false,
    });
    const r = await currentApp.inject({
      method: 'PATCH',
      url: `/api/v1/tasks/${TASK_ID}`,
      cookies: { pp_auth: makeToken('mitarbeiter', STAFF_A) },
      payload: { title: 'Hijack' },
    });
    expect(r.statusCode).toBe(403);
  });

  it('403 Reassign-Hijack: Helfer A darf B-zugewiesene Aufgabe NICHT an sich reißen', async () => {
    // A ist Helfer (darf mutieren), versucht aber assigned_to=self auf eine bereits
    // an B zugewiesene Aufgabe — das ist Umzuweisung (Management-Aktion) → 403.
    currentApp = await buildTestApp({
      taskRaw: { id: TASK_ID, assigned_to: STAFF_B, created_by: STAFF_B, status: 'in_arbeit' },
      isCollaborator: true,
      isActiveUser: true,
    });
    const r = await currentApp.inject({
      method: 'PATCH',
      url: `/api/v1/tasks/${TASK_ID}`,
      cookies: { pp_auth: makeToken('mitarbeiter', STAFF_A) },
      payload: { assigned_to: STAFF_A },
    });
    expect(r.statusCode).toBe(403);
  });

  it('403 PATCH bietet keinen Self-Claim-Pfad (canMutateTask greift vor dem Reassign-Gate)', async () => {
    currentApp = await buildTestApp({
      taskRaw: { id: TASK_ID, assigned_to: null, created_by: STAFF_B, status: 'offen' },
      isCollaborator: false,
      isActiveUser: true,
    });
    const r = await currentApp.inject({
      method: 'PATCH',
      url: `/api/v1/tasks/${TASK_ID}`,
      cookies: { pp_auth: makeToken('mitarbeiter', STAFF_A) },
      payload: { assigned_to: STAFF_A },
    });
    // A ist nicht zugewiesen/Helfer/Ersteller → canMutateTask schlägt fehl → 403.
    // (Self-Claim einer unzugewiesenen Aufgabe läuft über POST /status, nicht PATCH.)
    expect(r.statusCode).toBe(403);
  });

  it('403 support darf nicht patchen', async () => {
    currentApp = await buildTestApp({
      taskRaw: { id: TASK_ID, assigned_to: STAFF_A, created_by: STAFF_A, status: 'offen' },
    });
    const r = await currentApp.inject({
      method: 'PATCH',
      url: `/api/v1/tasks/${TASK_ID}`,
      cookies: { pp_auth: makeToken('support', STAFF_A) },
      payload: { title: 'X' },
    });
    expect(r.statusCode).toBe(403);
  });
});

// ── POST /tasks/:id/collaborators ────────────────────────────────────────────
describe('POST /api/v1/tasks/:id/collaborators', () => {
  it('201 Zugewiesener lädt Helfer ein', async () => {
    currentApp = await buildTestApp({
      taskRaw: { id: TASK_ID, assigned_to: STAFF_A, created_by: STAFF_B, status: 'in_arbeit' },
      isActiveUser: true,
    });
    const r = await currentApp.inject({
      method: 'POST',
      url: `/api/v1/tasks/${TASK_ID}/collaborators`,
      cookies: { pp_auth: makeToken('mitarbeiter', STAFF_A) },
      payload: { user_id: STAFF_B },
    });
    expect(r.statusCode).toBe(201);
    expect(JSON.parse(r.body).already_member).toBe(false);
  });

  it('403 support darf keine Helfer einladen', async () => {
    currentApp = await buildTestApp({
      taskRaw: { id: TASK_ID, assigned_to: STAFF_A, created_by: STAFF_A, status: 'in_arbeit' },
    });
    const r = await currentApp.inject({
      method: 'POST',
      url: `/api/v1/tasks/${TASK_ID}/collaborators`,
      cookies: { pp_auth: makeToken('support', STAFF_A) },
      payload: { user_id: STAFF_B },
    });
    expect(r.statusCode).toBe(403);
  });

  it('200 already_member bei doppeltem Einladen (idempotent)', async () => {
    currentApp = await buildTestApp({
      taskRaw: { id: TASK_ID, assigned_to: STAFF_A, created_by: STAFF_B, status: 'in_arbeit' },
      isActiveUser: true,
      collabConflict: true,
    });
    const r = await currentApp.inject({
      method: 'POST',
      url: `/api/v1/tasks/${TASK_ID}/collaborators`,
      cookies: { pp_auth: makeToken('mitarbeiter', STAFF_A) },
      payload: { user_id: STAFF_B },
    });
    expect(r.statusCode).toBe(200);
    expect(JSON.parse(r.body).already_member).toBe(true);
  });
});

// ── GET /tasks/:id + /assignees ──────────────────────────────────────────────
describe('GET /api/v1/tasks/:id & /assignees', () => {
  it('200 Detail inkl. collaborators + activity', async () => {
    currentApp = await buildTestApp({ taskItem: makeTaskRow() });
    const r = await currentApp.inject({
      method: 'GET',
      url: `/api/v1/tasks/${TASK_ID}`,
      cookies: { pp_auth: makeToken() },
    });
    expect(r.statusCode).toBe(200);
    const body = JSON.parse(r.body);
    expect(body.task.collaborators).toEqual([]);
    expect(body.task.activity).toEqual([]);
  });

  it('404 unbekannte Aufgabe', async () => {
    currentApp = await buildTestApp({ taskItem: null });
    const r = await currentApp.inject({
      method: 'GET',
      url: `/api/v1/tasks/${TASK_ID}`,
      cookies: { pp_auth: makeToken() },
    });
    expect(r.statusCode).toBe(404);
  });

  it('200 assignees-Liste', async () => {
    currentApp = await buildTestApp();
    const r = await currentApp.inject({
      method: 'GET',
      url: '/api/v1/tasks/assignees',
      cookies: { pp_auth: makeToken() },
    });
    expect(r.statusCode).toBe(200);
    expect(JSON.parse(r.body).assignees).toHaveLength(1);
  });
});
