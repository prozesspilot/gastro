/**
 * M01 — Beleg Repository
 *
 * DB-Layer für die `belege`-Tabelle (Migration 030_belege.sql).
 *
 * RLS-Hinweis:
 *   Die belege-Tabelle hat FORCE ROW LEVEL SECURITY. Die Policy prüft
 *   `is_rls_bypassed() OR tenant_id = current_tenant_id()`.
 *   Vor jeder Query wird `set_config('app.tenant_id', tenantId, true)` gesetzt,
 *   damit current_tenant_id() den richtigen Wert zurückgibt.
 *   Der Parameter `true` (dritter Arg) bedeutet: lokal für die Transaktion.
 *
 * DECISION: Wir verwenden eine einzelne Connection aus dem Pool (nicht pool.query),
 *   um set_config + die eigentliche Query atomar in derselben Connection auszuführen.
 *   pool.query() könnte eine andere Connection aus dem Pool nehmen.
 */

import type { Pool } from 'pg';

// ── Types ──────────────────────────────────────────────────────────────────

export type BelegStatus =
  | 'received'
  | 'extracting'
  | 'extracted'
  | 'categorizing'
  | 'categorized'
  | 'archiving'
  | 'archived'
  | 'exporting'
  | 'exported'
  | 'completed'
  | 'requires_review'
  | 'error';

export type SourceChannel = 'whatsapp' | 'email' | 'web_chat' | 'manual_upload' | 'api' | 'sumup';

export interface DbBeleg {
  id: string;
  tenant_id: string;
  status: BelegStatus;
  source_channel: SourceChannel;
  source_external_id: string | null;
  received_at: Date;
  file_object_key: string;
  file_mime_type: string;
  file_size_bytes: number;
  file_sha256: string;
  payload: Record<string, unknown>;
  supplier_name: string | null;
  document_date: Date | null;
  total_gross: number | null;
  currency: string;
  category: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface InsertBelegInput {
  tenantId: string;
  sourceChannel: 'manual_upload';
  fileObjectKey: string;
  fileMimeType: string;
  fileSizeBytes: number;
  fileSha256: string;
  uploadedByUserId: string;
  originalFilename: string;
}

export interface ListBelegeOptions {
  limit: number;
  offset: number;
  status?: BelegStatus;
}

// ── Repository-Funktionen ──────────────────────────────────────────────────

/**
 * Setzt den Tenant-Context für RLS auf der gegebenen Connection.
 * Muss vor jeder Query auf belege aufgerufen werden.
 */
async function setTenantContext(
  client: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  tenantId: string,
): Promise<void> {
  await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
}

/**
 * Legt einen neuen Beleg an.
 *
 * Idempotenz: Bei Conflict auf (tenant_id, file_sha256) wird die existierende
 * Row zurückgegeben + isDuplicate=true gesetzt.
 *
 * DECISION: ON CONFLICT DO NOTHING + nachfolgendes SELECT statt DO UPDATE,
 * damit die originale Row erhalten bleibt und kein Update-Seiteneffekt entsteht.
 */
export async function insertBeleg(
  pool: Pool,
  input: InsertBelegInput,
): Promise<{ beleg: DbBeleg; isDuplicate: boolean }> {
  const client = await pool.connect();
  try {
    // RLS-Context setzen
    await setTenantContext(client, input.tenantId);

    const payload = {
      audit: {
        uploaded_by_user_id: input.uploadedByUserId,
      },
      meta: {
        original_filename: input.originalFilename,
      },
    };

    const insertResult = await client.query<DbBeleg>(
      `INSERT INTO belege (
         tenant_id, source_channel, file_object_key, file_mime_type,
         file_size_bytes, file_sha256, payload
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
       ON CONFLICT (tenant_id, file_sha256) DO NOTHING
       RETURNING *`,
      [
        input.tenantId,
        input.sourceChannel,
        input.fileObjectKey,
        input.fileMimeType,
        input.fileSizeBytes,
        input.fileSha256,
        JSON.stringify(payload),
      ],
    );

    if (insertResult.rows.length > 0) {
      return { beleg: insertResult.rows[0], isDuplicate: false };
    }

    // Conflict-Fall: existierende Row holen
    const existingResult = await client.query<DbBeleg>(
      'SELECT * FROM belege WHERE tenant_id = $1 AND file_sha256 = $2',
      [input.tenantId, input.fileSha256],
    );

    if (existingResult.rows.length === 0) {
      // Sollte nicht passieren — aber defensiv absichern
      throw new Error(
        `Beleg nicht gefunden nach ON CONFLICT: tenant=${input.tenantId}, sha256=${input.fileSha256}`,
      );
    }

    return { beleg: existingResult.rows[0], isDuplicate: true };
  } finally {
    client.release();
  }
}

/**
 * Listet Belege paginiert, filterbar nach Status.
 * Sortierung: received_at DESC.
 */
export async function listBelege(
  pool: Pool,
  tenantId: string,
  opts: ListBelegeOptions,
): Promise<{ belege: DbBeleg[]; total: number }> {
  const client = await pool.connect();
  try {
    await setTenantContext(client, tenantId);

    const params: unknown[] = [tenantId, opts.limit, opts.offset];
    let statusFilter = '';
    if (opts.status) {
      params.push(opts.status);
      statusFilter = `AND status = $${params.length}`;
    }

    const listResult = await client.query<DbBeleg>(
      `SELECT * FROM belege
       WHERE tenant_id = $1 ${statusFilter}
       ORDER BY received_at DESC
       LIMIT $2 OFFSET $3`,
      params,
    );

    // Für total: separater COUNT mit gleichen Filterparametern
    const countParams: unknown[] = [tenantId];
    let countStatusFilter = '';
    if (opts.status) {
      countParams.push(opts.status);
      countStatusFilter = `AND status = $${countParams.length}`;
    }

    const countResult = await client.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM belege WHERE tenant_id = $1 ${countStatusFilter}`,
      countParams,
    );

    const total = Number.parseInt(countResult.rows[0]?.count ?? '0', 10);

    return { belege: listResult.rows, total };
  } finally {
    client.release();
  }
}

/**
 * Holt einen einzelnen Beleg per ID + tenant_id.
 * Gibt null zurück wenn nicht vorhanden oder anderer Tenant (Tenant-Isolation).
 */
export async function getBelegById(
  pool: Pool,
  tenantId: string,
  id: string,
): Promise<DbBeleg | null> {
  const client = await pool.connect();
  try {
    await setTenantContext(client, tenantId);

    const result = await client.query<DbBeleg>(
      'SELECT * FROM belege WHERE id = $1 AND tenant_id = $2',
      [id, tenantId],
    );

    return result.rows[0] ?? null;
  } finally {
    client.release();
  }
}
