/**
 * T024 — Task-Datenmodell
 *
 * Zod-Schemas + abgeleitete TypeScript-Types fuer das Task-System.
 * Mapping: tasks-Tabelle (Migration 120_tasks.sql).
 *
 * Spec: Mitarbeiter_Webapp.md §4.1–4.3
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Konstanten (kanonische Listen, auch fuer DB-CHECK-Constraints)
// ---------------------------------------------------------------------------

export const TASK_STATUSES = [
  'offen',
  'in_bearbeitung',
  'wartet_auf_kunde',
  'pausiert',
  'erledigt',
  'verworfen',
] as const;

export const TASK_PRIORITIES = ['niedrig', 'normal', 'hoch', 'kritisch'] as const;

export const TASK_TYPES = [
  'beleg_pruefen',
  'datev_fehler',
  'onboarding',
  'reauth_lexoffice',
  'reauth_sumup',
  'upgrade_vorschlag',
  'steuerberater_mail',
  'chat_wartezeit',
  'mahnung',
  'provisions_report',
  'ci_reparieren',
  'sonstige',
] as const;

export const TASK_REFERENCE_TYPES = ['beleg', 'tenant', 'invoice', 'kasse_transaction'] as const;

export const TASK_ACTIVITY_EVENT_TYPES = [
  'created',
  'claimed',
  'unclaimed',
  'assigned',
  'status_changed',
  'commented',
  'priority_changed',
  'collaborator_added',
  'collaborator_removed',
  'completed',
  'discarded',
  'reopened',
] as const;

// ---------------------------------------------------------------------------
// DB-Row-Types (exakt wie die DB zurueckgibt — snake_case)
// ---------------------------------------------------------------------------

export interface DbTask {
  id: string;
  tenant_id: string | null;
  type: string;
  title: string;
  description: string | null;
  reference_type: string | null;
  reference_id: string | null;
  status: string;
  priority: string;
  assigned_to: string | null;
  claimed_at: Date | null;
  due_at: Date | null;
  completed_at: Date | null;
  discord_message_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface DbTaskCollaborator {
  task_id: string;
  user_id: string;
  tenant_id: string | null;
  added_by: string | null;
  added_at: Date;
}

export interface DbTaskActivityLog {
  id: number;
  task_id: string;
  tenant_id: string | null;
  actor_user_id: string | null;
  event_type: string;
  payload: Record<string, unknown>;
  occurred_at: Date;
}

// ---------------------------------------------------------------------------
// Zod-Schemas fuer API-Boundaries
// ---------------------------------------------------------------------------

export const CreateTaskSchema = z.object({
  tenant_id: z.string().uuid().nullable().optional(),
  type: z.enum(TASK_TYPES),
  title: z.string().min(1).max(200),
  description: z.string().max(10000).optional(),
  reference_type: z.enum(TASK_REFERENCE_TYPES).nullable().optional(),
  reference_id: z.string().uuid().nullable().optional(),
  priority: z.enum(TASK_PRIORITIES).default('normal'),
  assigned_to: z.string().uuid().nullable().optional(),
  due_at: z.string().datetime().nullable().optional(),
  discord_message_id: z.string().max(25).nullable().optional(),
});
export type CreateTask = z.infer<typeof CreateTaskSchema>;

export const UpdateTaskSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(10000).nullable().optional(),
  status: z.enum(TASK_STATUSES).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  assigned_to: z.string().uuid().nullable().optional(),
  due_at: z.string().datetime().nullable().optional(),
  discord_message_id: z.string().max(25).nullable().optional(),
});
export type UpdateTask = z.infer<typeof UpdateTaskSchema>;

export const ListTasksQuerySchema = z.object({
  tenant_id: z.string().uuid().optional(),
  status: z.enum(TASK_STATUSES).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  assigned_to: z.string().uuid().optional(),
  type: z.enum(TASK_TYPES).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type ListTasksQuery = z.infer<typeof ListTasksQuerySchema>;

export const TaskIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const AddCollaboratorSchema = z.object({
  user_id: z.string().uuid(),
});

export const AddActivityLogSchema = z.object({
  event_type: z.enum(TASK_ACTIVITY_EVENT_TYPES),
  payload: z.record(z.unknown()).default({}),
});
