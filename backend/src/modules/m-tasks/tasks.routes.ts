/**
 * T081 — Mitarbeiter-Aufgaben-Dashboard: Routen.
 *
 * EIN Staff-Plugin unter /api/v1/tasks. Auth: NUR m14StaffAuthHook (JWT-Cookie) —
 * BEWUSST OHNE m14TenantContextHook: `tasks` ist eine cross-tenant Staff-Tabelle
 * (kein x-pp-tenant-id-Scoping). Der Zugriffsschutz liegt komplett in den Handlern
 * (Rollen-Gate + Mutations-Berechtigung). NIE über withTenant() abfragen.
 *
 * Registrierung in app.ts:
 *   await app.register(tasksRoutes, { prefix: '/api/v1/tasks' });
 */
import type { FastifyInstance } from 'fastify';
import { m14StaffAuthHook } from '../../core/auth/m14-staff-auth';
import { addCollaboratorHandler } from './handlers/add-collaborator.handler';
import { changeStatusHandler } from './handlers/change-status.handler';
import { createTaskHandler } from './handlers/create-task.handler';
import { getTaskHandler } from './handlers/get-task.handler';
import { listAssigneesHandler } from './handlers/list-assignees.handler';
import { listTasksHandler } from './handlers/list-tasks.handler';
import { updateTaskHandler } from './handlers/update-task.handler';

// Explizites Per-Route-Rate-Limiting (zusätzlich zum globalen 100/min aus app.ts).
// Greift nur mit @fastify/rate-limit (Prod; im Test ignoriert). Verhindert zugleich
// den CodeQL-Missing-Rate-Limiting-Alert (Memory codeql-missing-rate-limiting).
const RL = { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } };

export async function tasksRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', m14StaffAuthHook);

  // Statische Routen VOR der parametrischen /:id (Fastify priorisiert ohnehin
  // statisch, aber explizit gehalten für Lesbarkeit).
  app.get('/', RL, listTasksHandler);
  app.get('/assignees', RL, listAssigneesHandler);
  app.post('/', RL, createTaskHandler);

  app.get<{ Params: { id: string } }>('/:id', RL, getTaskHandler);
  app.patch<{ Params: { id: string } }>('/:id', RL, updateTaskHandler);
  app.post<{ Params: { id: string } }>('/:id/status', RL, changeStatusHandler);
  app.post<{ Params: { id: string } }>('/:id/collaborators', RL, addCollaboratorHandler);
}
