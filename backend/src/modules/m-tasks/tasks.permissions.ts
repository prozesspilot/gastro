/**
 * T081 — Berechtigungs-Logik für Aufgaben-Mutationen.
 *
 * `tasks` hat KEINE Tenant-RLS (cross-tenant Staff-Tabelle) — die App ist die
 * EINZIGE Zugriffsgrenze. Diese Datei zentralisiert die Mutations-Regeln, damit
 * jeder Schreib-Handler dieselbe Prüfung nutzt (Review-Invariante: „Mitarbeiter A
 * kann Aufgabe von B nicht ohne Berechtigung mutieren").
 *
 * Rollen-Modell (analog T062 / AuthContext der Webapp):
 *  - geschaeftsfuehrer: darf alles (Management).
 *  - mitarbeiter:       darf eigene/zugewiesene/Helfer-Aufgaben mutieren.
 *  - support:           READ-ONLY auf Aufgaben (sein Job ist der Support-Chat) → kein Schreibzugriff.
 */

import type { M14Staff } from '../../core/auth/m14-staff-auth';
import type { DbTask } from './tasks.types';

/** support darf grundsätzlich nicht schreiben; nur gf + mitarbeiter. */
export function canWriteTasks(staff: M14Staff): boolean {
  return staff.role === 'geschaeftsfuehrer' || staff.role === 'mitarbeiter';
}

/** Nur Geschäftsführung legt Aufgaben für andere an / darf frei zuweisen. */
export function canManageTasks(staff: M14Staff): boolean {
  return staff.role === 'geschaeftsfuehrer';
}

export interface MutateContext {
  /** Ist der Akteur Helfer (task_collaborators) der Aufgabe? */
  isCollaborator: boolean;
}

/**
 * Darf `staff` die gegebene Aufgabe mutieren (Status ändern, bearbeiten,
 * Helfer einladen)? Geschäftsführung immer; sonst nur als Ersteller,
 * Zugewiesener oder Helfer. support nie (read-only).
 */
export function canMutateTask(staff: M14Staff, task: DbTask, ctx: MutateContext): boolean {
  if (!canWriteTasks(staff)) return false;
  if (staff.role === 'geschaeftsfuehrer') return true;
  return (
    task.assigned_to === staff.userId || task.created_by === staff.userId || ctx.isCollaborator
  );
}
