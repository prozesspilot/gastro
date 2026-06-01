/**
 * T024 — Tasks-Modul: oeffentliche Exporte
 *
 * Dieses Modul stellt das Task-Datenmodell bereit (Migration 120_tasks.sql).
 * Die API-Routes kommen in T025 (tasks.routes.ts).
 *
 * Spec: Mitarbeiter_Webapp.md §4.1–4.3
 */

// Schemas + Types
export {
  TASK_ACTIVITY_EVENT_TYPES,
  TASK_PRIORITIES,
  TASK_REFERENCE_TYPES,
  TASK_STATUSES,
  TASK_TYPES,
  AddActivityLogSchema,
  AddCollaboratorSchema,
  CreateTaskSchema,
  ListTasksQuerySchema,
  TaskIdParamSchema,
  UpdateTaskSchema,
} from './tasks.schema';

export type {
  CreateTask,
  DbTask,
  DbTaskActivityLog,
  DbTaskCollaborator,
  ListTasksQuery,
  UpdateTask,
} from './tasks.schema';

// Repository
export {
  addCollaborator,
  appendActivityLog,
  createTask,
  getTask,
  listActivityLog,
  listCollaborators,
  listTasks,
  removeCollaborator,
  updateTask,
} from './tasks.repository';
