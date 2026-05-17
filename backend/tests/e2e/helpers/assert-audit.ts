/**
 * E2E-Helper: assertAuditContains
 *
 * Prüft, dass die audit_log-Tabelle für eine receipt_id alle erwarteten
 * Event-Typen enthält. Wirft AssertionError bei fehlenden.
 */

import type { Pool } from 'pg';

interface AuditRow {
  action: string;
  resource: string | null;
}

export async function assertAuditContains(
  pool: Pool,
  receiptId: string,
  expectedTypes: string[],
): Promise<void> {
  const { rows } = await pool.query<AuditRow>(
    `SELECT action, resource FROM audit_log
      WHERE resource LIKE '%/receipt:' || $1
      ORDER BY created_at ASC`,
    [receiptId],
  );
  const actions = new Set(rows.map((r) => r.action));
  const missing = expectedTypes.filter((t) => !actions.has(t));
  if (missing.length > 0) {
    throw new Error(
      `audit_log fehlt: [${missing.join(', ')}] für receipt ${receiptId}. ` +
        `Vorhanden: [${Array.from(actions).join(', ')}]`,
    );
  }
}
