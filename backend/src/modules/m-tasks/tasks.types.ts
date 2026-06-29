/**
 * T081 — Mitarbeiter-Aufgaben-Dashboard: Typen.
 *
 * Datenmodell aus Migration 127 (tasks / task_collaborators / task_activity_log).
 * KEINE Tenant-RLS — `tasks` ist eine cross-tenant Staff-Tabelle (Begründung im
 * Migrations-Kopf + T080-Spec). Der Zugriffsschutz liegt komplett in der App-Schicht:
 * authentifizierte Staff-Session (JWT pp_auth), Rollen-Gate auf Schreibaktionen,
 * Sichtbarkeits-/Mutations-Checks im SQL bzw. Handler.
 */

/** Status-FSM (CHECK in Migration 127). */
export type TaskStatus = 'offen' | 'in_arbeit' | 'pausiert' | 'erledigt' | 'verworfen';

/** Prioritätsstufen (CHECK in Migration 127). */
export type TaskPriority = 'niedrig' | 'normal' | 'hoch' | 'kritisch';

/** Stati, die im Dashboard als „aktiv/offen" gelten (nicht abgeschlossen). */
export const ACTIVE_STATUSES: readonly TaskStatus[] = ['offen', 'in_arbeit', 'pausiert'];

/** Stati, die als „erledigt/abgeschlossen" gelten (Erledigt-Tab). */
export const DONE_STATUSES: readonly TaskStatus[] = ['erledigt', 'verworfen'];

/** Eine Zeile der `tasks`-Tabelle (Roh-DB-Form, snake_case wie DB/JSON-Konvention). */
export interface DbTask {
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
}

/**
 * Eine Aufgabe angereichert mit Join-Daten für die Listen-/Detail-Ansicht:
 * aufgelöste Namen (statt nackter UUIDs) + Helfer-Anzahl.
 */
export interface TaskListItem extends DbTask {
  assigned_to_name: string | null;
  created_by_name: string | null;
  tenant_name: string | null;
  collaborator_count: number;
}

/** Ein eingeladener Helfer (task_collaborators + aufgelöster Name). */
export interface TaskCollaborator {
  user_id: string;
  display_name: string;
  added_by: string | null;
  added_at: string;
}

/** Ein Eintrag der Aktivitäts-Historie (task_activity_log + aufgelöster Akteur-Name). */
export interface TaskActivityEntry {
  id: string;
  action: string;
  actor: string | null;
  actor_name: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
}

/** Voll-Detail einer Aufgabe inkl. Helfer + Historie (für die Detail-Ansicht). */
export interface TaskDetail extends TaskListItem {
  collaborators: TaskCollaborator[];
  activity: TaskActivityEntry[];
}

/** Ein Mitarbeiter für die „Zuweisen"-Auswahl (Dropdown im Frontend). */
export interface AssigneeOption {
  id: string;
  display_name: string;
  role: 'geschaeftsfuehrer' | 'mitarbeiter' | 'support';
}

/** Welche Liste das Dashboard anzeigt. */
export type TaskView = 'mine' | 'team' | 'done';
