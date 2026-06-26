/**
 * T074 — Beleg-Status live in den Web-Chat des Wirts.
 *
 * Ein dünner Best-Effort-Wrapper um den SSE-Manager, der bei jedem
 * Beleg-Statuswechsel den Fortschritt an den Tenant-Kanal pusht
 * (`received → extracting → extracted → categorized → exported`).
 *
 * WICHTIG (Aufruf-Vertrag):
 *   * IMMER **nach** dem DB-Commit aufrufen — niemals innerhalb der Transaktion.
 *     Sonst würde ein Rollback ein Event pushen, das es nie gab.
 *   * NUR Status-Metadaten (`beleg_id`, `status`) — KEINE PII/Extraktionsfelder
 *     (Lieferant, Beträge, raw_text …). Der Wirt-Stream ist nicht der Ort für
 *     Buchungsdaten (CLAUDE.md §6.6).
 *   * Best-Effort: ein Emit-Fehler darf den Aufrufer (den erfolgreichen DB-Write)
 *     niemals umwerfen — daher der schluckende try/catch.
 *
 * Kanal: tenant-scoped (wie T069 `chat.message`). Der Wirt-`/:token/events`-Stream
 * hängt am selben Tenant-Kanal und empfängt `beleg.status` ohne weitere Verdrahtung.
 */

import { sseManager } from './sse.manager';

export function emitBelegStatus(tenantId: string, belegId: string, status: string): void {
  try {
    sseManager.emit(tenantId, 'beleg.status', { beleg_id: belegId, status });
  } catch {
    // Live-Update ist best-effort — niemals den Aufrufer (DB-Write) gefährden.
  }
}
