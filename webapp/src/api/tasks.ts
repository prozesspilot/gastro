/**
 * T082 — API-Modul für das Mitarbeiter-Aufgaben-Dashboard.
 *
 * Nutzt die Staff-Endpoints aus T081 (m-tasks) via apiRequest (Bearer-Cookie).
 * `tasks` ist BEWUSST cross-tenant — kein x-pp-tenant-id-Scoping; der mitgesendete
 * Header wird vom Backend ignoriert. Backend-Shapes: { tasks } / { task } / { assignees }.
 */
import { apiRequest } from './_client';

export type TaskStatus = 'offen' | 'in_arbeit' | 'pausiert' | 'erledigt' | 'verworfen';
export type TaskPriority = 'niedrig' | 'normal' | 'hoch' | 'kritisch';
export type TaskView = 'mine' | 'team' | 'done';

export interface TaskListItem {
  id: string;
  tenant_id: string | null;
  type: string;
  title: string;
  description: string | null;
  reference_type: string | null;
  reference_id: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assigned_to: string | null;
  created_by: string | null;
  claimed_at: string | null;
  due_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  assigned_to_name: string | null;
  created_by_name: string | null;
  tenant_name: string | null;
  collaborator_count: number;
}

export interface TaskCollaborator {
  user_id: string;
  display_name: string;
  added_by: string | null;
  added_at: string;
}

export interface TaskActivityEntry {
  id: string;
  action: string;
  actor: string | null;
  actor_name: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
}

export interface TaskDetail extends TaskListItem {
  collaborators: TaskCollaborator[];
  activity: TaskActivityEntry[];
}

export interface AssigneeOption {
  id: string;
  display_name: string;
  role: 'geschaeftsfuehrer' | 'mitarbeiter' | 'support';
}

export interface CreateTaskInput {
  title: string;
  type?: string;
  description?: string | null;
  priority?: TaskPriority;
  assigned_to?: string | null;
  tenant_id?: string | null;
  due_at?: string | null;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string | null;
  priority?: TaskPriority;
  due_at?: string | null;
  type?: string;
  assigned_to?: string | null;
}

/** Liste gemäß View (mine|team|done), optional nach Priorität gefiltert. */
export async function listTasks(view: TaskView, priority?: TaskPriority): Promise<TaskListItem[]> {
  const params = new URLSearchParams({ view });
  if (priority) params.set('priority', priority);
  const res = await apiRequest<{ tasks: TaskListItem[] }>(`/tasks?${params.toString()}`);
  return res.tasks;
}

/** Voll-Detail inkl. Helfer + Aktivitäts-Historie. */
export async function getTask(id: string): Promise<TaskDetail> {
  const res = await apiRequest<{ task: TaskDetail }>(`/tasks/${id}`);
  return res.task;
}

/** Aktive Mitarbeiter für die „Zuweisen"-/„Helfer einladen"-Auswahl. */
export async function listAssignees(): Promise<AssigneeOption[]> {
  const res = await apiRequest<{ assignees: AssigneeOption[] }>('/tasks/assignees');
  return res.assignees;
}

/** Legt eine neue Aufgabe an. */
export async function createTask(input: CreateTaskInput): Promise<TaskListItem> {
  const res = await apiRequest<{ task: TaskListItem }>('/tasks', { method: 'POST', body: input });
  return res.task;
}

/** Ändert den Status (claim/pause/complete/discard/reopen). */
export async function changeTaskStatus(id: string, status: TaskStatus): Promise<TaskListItem> {
  const res = await apiRequest<{ task: TaskListItem }>(`/tasks/${id}/status`, {
    method: 'POST',
    body: { status },
  });
  return res.task;
}

/** Bearbeitet editierbare Felder. */
export async function updateTask(id: string, patch: UpdateTaskInput): Promise<TaskListItem> {
  const res = await apiRequest<{ task: TaskListItem }>(`/tasks/${id}`, {
    method: 'PATCH',
    body: patch,
  });
  return res.task;
}

/** Lädt einen Helfer zur Aufgabe ein. */
export async function addCollaborator(id: string, userId: string): Promise<void> {
  await apiRequest(`/tasks/${id}/collaborators`, { method: 'POST', body: { user_id: userId } });
}
