/**
 * Business-Audit-Log Helper (B1)
 *
 * Schreibt in die `audit_log`-Tabelle (Migration 060_audit_log.sql).
 *
 * WICHTIG — Abgrenzung:
 *   auth_audit_log  →  Auth-Events (Login, Logout, TOTP, Discord-OAuth)
 *   audit_log       →  Business-Events (Belege, Tenants, Exporte, DSGVO)
 *
 * GoBD-Konformität: Der Eintrag MUSS in derselben Transaktion wie der
 * zugehörige Daten-Insert geschrieben werden. Übergib deshalb immer einen
 * PoolClient mit aktiver Transaktion (nach BEGIN, mit gesetztem tenant_id-GUC).
 *
 * Schema (060_audit_log.sql):
 *   id              BIGSERIAL PK
 *   tenant_id       UUID NOT NULL
 *   entity_type     VARCHAR(40) NOT NULL
 *   entity_id       TEXT
 *   event_type      VARCHAR(60) NOT NULL       -- z. B. 'beleg.uploaded'
 *   actor           JSONB NOT NULL             -- {type, id}
 *   payload_before  JSONB
 *   payload_after   JSONB
 *   metadata        JSONB NOT NULL DEFAULT {}
 *   occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now()
 *
 * Naming-Convention für event_type: '<entity>.<verb_past>' mit Punkt-Namespace
 *   ✅ 'beleg.uploaded'
 *   ✅ 'beleg.status_changed'
 *   ❌ 'beleg_uploaded'  (Unterstriche — falsch)
 */

import type { PoolClient } from 'pg';

// ── Types ──────────────────────────────────────────────────────────────────

export interface AuditActor {
  type: 'staff' | 'system' | 'customer';
  id: string | null;
}

export interface AuditLogInput {
  tenantId: string;
  entityType: 'beleg' | 'tenant' | 'pos_credentials' | 'export' | 'dsgvo_request' | (string & {});
  entityId: string | null;
  /** Punkt-Namespace: 'beleg.uploaded', 'beleg.status_changed', 'tenant.cancelled' */
  eventType: string;
  actor: AuditActor;
  payloadBefore?: Record<string, unknown> | null;
  payloadAfter?: Record<string, unknown> | null;
  /** Freie Metadaten: Trace-ID, n8n-Execution-ID, etc. */
  metadata?: Record<string, unknown>;
}

// ── Helper ─────────────────────────────────────────────────────────────────

/**
 * Schreibt einen Business-Audit-Log-Eintrag in die `audit_log`-Tabelle.
 *
 * MUSS in derselben Transaktion wie der Daten-Insert aufgerufen werden
 * (Atomicity-Garantie für GoBD). RLS-Policy erwartet den Tenant-Context
 * (GUC `app.current_tenant`, via setTenantContext/withTenant) bereits gesetzt.
 *
 * @param client  PoolClient mit aktiver Transaktion + gesetztem Tenant-Context
 * @param input   Audit-Log-Daten
 */
export async function logAuditEvent(client: PoolClient, input: AuditLogInput): Promise<void> {
  await client.query(
    `INSERT INTO audit_log
       (tenant_id, entity_type, entity_id, event_type, actor, payload_before, payload_after, metadata)
     VALUES
       ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb)`,
    [
      input.tenantId,
      input.entityType,
      input.entityId,
      input.eventType,
      JSON.stringify(input.actor),
      input.payloadBefore != null ? JSON.stringify(input.payloadBefore) : null,
      input.payloadAfter != null ? JSON.stringify(input.payloadAfter) : null,
      JSON.stringify(input.metadata ?? {}),
    ],
  );
}
