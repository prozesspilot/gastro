/**
 * D5 — Receipt-Repository
 *
 * Datenbankzugriff für Receipts. Alle Queries filtern nach tenant_id
 * für Mandanten-Isolation.
 *
 * Öffentliche API:
 *   createReceipt(db, tenantId, input)
 *   getReceipt(db, tenantId, id)
 *   listReceipts(db, tenantId, query)
 *   updateReceiptStatus(db, tenantId, id, status, errorMessage?)
 *   updateReceiptStorageKey(db, tenantId, id, storageKey, fileSizeBytes)
 */

import type { Pool } from 'pg';
import type {
  CreateReceiptInput,
  ListReceiptsQuery,
  ReceiptResponse,
  ReceiptRow,
} from './receipt.schema';

// ── SELECT-Fragment ───────────────────────────────────────────────────────

/**
 * Erzeugt die SELECT-Spalten für einen Receipt.
 */
function selectColumns(): string {
  return `
    id,
    tenant_id,
    customer_id,
    status,
    original_name,
    mime_type,
    storage_key,
    file_size_bytes,
    file_sha256,
    source,
    metadata,
    error_message,
    created_at,
    updated_at
  `;
}

// ── Row → Response Converter ───────────────────────────────────────────────

function rowToResponse(row: ReceiptRow): ReceiptResponse {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    customer_id: row.customer_id,
    status: row.status as ReceiptResponse['status'],
    original_name: row.original_name ?? null,
    mime_type: row.mime_type ?? null,
    storage_key: row.storage_key ?? null,
    file_size_bytes: row.file_size_bytes ?? null,
    file_sha256: row.file_sha256 ?? null,
    source: row.source as ReceiptResponse['source'],
    metadata: row.metadata ?? {},
    error_message: row.error_message ?? null,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

// ── Repository-Funktionen ─────────────────────────────────────────────────

/**
 * Fehler bei doppeltem Beleg (gleicher SHA-256 für Tenant+Customer).
 */
export class DuplicateReceiptError extends Error {
  constructor(
    public readonly existingId: string,
    public readonly fileSha256: string,
  ) {
    super(`Receipt mit sha256=${fileSha256} existiert bereits (id=${existingId}).`);
    this.name = 'DuplicateReceiptError';
  }
}

/**
 * Neuen Receipt anlegen.
 */
export async function createReceipt(
  db: Pool,
  tenantId: string,
  input: CreateReceiptInput,
): Promise<ReceiptResponse> {
  try {
    const { rows } = await db.query<ReceiptRow>(
      `
      INSERT INTO receipts (
        tenant_id,
        customer_id,
        original_name,
        mime_type,
        source,
        file_sha256
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING ${selectColumns()}
      `,
      [
        tenantId,
        input.customer_id,
        input.original_name ?? null,
        input.mime_type ?? null,
        input.source ?? 'manual',
        input.file_sha256 ?? null,
      ],
    );

    if (!rows[0]) {
      throw new Error('Failed to create receipt');
    }

    return rowToResponse(rows[0]);
  } catch (err) {
    // 23505 = unique_violation
    if (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code: string }).code === '23505' &&
      input.file_sha256
    ) {
      const { rows: existingRows } = await db.query<{ id: string }>(
        `
        SELECT id FROM receipts
        WHERE tenant_id = $1 AND customer_id = $2 AND file_sha256 = $3
        `,
        [tenantId, input.customer_id, input.file_sha256],
      );
      if (existingRows[0]) {
        throw new DuplicateReceiptError(existingRows[0].id, input.file_sha256);
      }
    }
    throw err;
  }
}

/**
 * Receipt per ID laden.
 * Gibt null zurück wenn nicht gefunden oder zu anderem Tenant gehört.
 */
export async function getReceipt(
  db: Pool,
  tenantId: string,
  id: string,
): Promise<ReceiptResponse | null> {
  const { rows } = await db.query<ReceiptRow>(
    `
    SELECT ${selectColumns()}
    FROM receipts
    WHERE id = $1 AND tenant_id = $2
    `,
    [id, tenantId],
  );

  return rows[0] ? rowToResponse(rows[0]) : null;
}

/**
 * Receipts auflisten mit optionalen Filtern.
 * Gibt sortierte Liste mit count zurück.
 */
export async function listReceipts(
  db: Pool,
  tenantId: string,
  query: ListReceiptsQuery,
): Promise<{ data: ReceiptResponse[]; total: number }> {
  // WHERE-Bedingungen zusammenbauen
  const conditions: string[] = ['tenant_id = $1'];
  const params: unknown[] = [tenantId];
  let paramIndex = 2;

  if (query.customer_id) {
    conditions.push(`customer_id = $${paramIndex}`);
    params.push(query.customer_id);
    paramIndex++;
  }

  if (query.status) {
    conditions.push(`status = $${paramIndex}`);
    params.push(query.status);
    paramIndex++;
  }

  let searchParamIndex: number | null = null;
  if (query.search) {
    searchParamIndex = paramIndex;
    conditions.push(`search_vector @@ plainto_tsquery('german', $${paramIndex})`);
    params.push(query.search);
    paramIndex++;
  }

  const where = `WHERE ${conditions.join(' AND ')}`;

  // Gesamtzahl
  const countResult = await db.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM receipts ${where}`,
    params,
  );
  const total = Number.parseInt(countResult.rows[0]?.count ?? '0', 10);

  const orderBy =
    searchParamIndex !== null
      ? `ORDER BY ts_rank(search_vector, plainto_tsquery('german', $${searchParamIndex})) DESC, created_at DESC`
      : 'ORDER BY created_at DESC';

  // Daten mit Pagination
  const dataParams = [...params];
  const limit = query.limit;
  const offset = query.offset;
  dataParams.push(limit, offset);

  const { rows } = await db.query<ReceiptRow>(
    `
    SELECT ${selectColumns()}
    FROM receipts
    ${where}
    ${orderBy}
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `,
    dataParams,
  );

  return {
    data: rows.map(rowToResponse),
    total,
  };
}

/**
 * Status eines Receipts aktualisieren.
 * Gibt den aktualisierten Receipt zurück, null wenn nicht gefunden.
 */
export async function updateReceiptStatus(
  db: Pool,
  tenantId: string,
  id: string,
  status: string,
  errorMessage?: string | null,
): Promise<ReceiptResponse | null> {
  const errorMsg = errorMessage ?? null;

  const { rows } = await db.query<ReceiptRow>(
    `
    UPDATE receipts
    SET status = $3, error_message = $4, updated_at = now()
    WHERE id = $1 AND tenant_id = $2
    RETURNING ${selectColumns()}
    `,
    [id, tenantId, status, errorMsg],
  );

  return rows[0] ? rowToResponse(rows[0]) : null;
}

/**
 * Storage-Informationen eines Receipts aktualisieren.
 * Wird aufgerufen nach erfolgreichem Upload zu MinIO/S3.
 */
export async function updateReceiptStorageKey(
  db: Pool,
  tenantId: string,
  id: string,
  storageKey: string,
  fileSizeBytes: number,
): Promise<ReceiptResponse | null> {
  const { rows } = await db.query<ReceiptRow>(
    `
    UPDATE receipts
    SET storage_key = $3, file_size_bytes = $4, updated_at = now()
    WHERE id = $1 AND tenant_id = $2
    RETURNING ${selectColumns()}
    `,
    [id, tenantId, storageKey, fileSizeBytes],
  );

  return rows[0] ? rowToResponse(rows[0]) : null;
}

// ── Statistik ──────────────────────────────────────────────────────────────

export interface ReceiptStats {
  total: number;
  by_status: {
    pending: number;
    processing: number;
    done: number;
    error: number;
  };
  by_source: {
    manual: number;
    whatsapp: number;
    email: number;
  };
  today_count: number;
  this_week_count: number;
}

interface StatsRow {
  total: string;
  status_pending: string;
  status_processing: string;
  status_done: string;
  status_error: string;
  source_manual: string;
  source_whatsapp: string;
  source_email: string;
  today_count: string;
  week_count: string;
}

export async function getReceiptStats(db: Pool, tenantId: string): Promise<ReceiptStats> {
  const { rows } = await db.query<StatsRow>(
    `
    SELECT
      COUNT(*)                                               AS total,
      COUNT(*) FILTER (WHERE status = 'pending')             AS status_pending,
      COUNT(*) FILTER (WHERE status = 'processing')          AS status_processing,
      COUNT(*) FILTER (WHERE status = 'done')                AS status_done,
      COUNT(*) FILTER (WHERE status = 'error')               AS status_error,
      COUNT(*) FILTER (WHERE source = 'manual')              AS source_manual,
      COUNT(*) FILTER (WHERE source = 'whatsapp')            AS source_whatsapp,
      COUNT(*) FILTER (WHERE source = 'email')               AS source_email,
      COUNT(*) FILTER (WHERE created_at >= date_trunc('day', now())) AS today_count,
      COUNT(*) FILTER (WHERE created_at >= date_trunc('week', now())) AS week_count
    FROM receipts
    WHERE tenant_id = $1
    `,
    [tenantId],
  );

  const r = rows[0] ?? ({} as StatsRow);
  const toNum = (v: string | undefined) => Number.parseInt(v ?? '0', 10);

  return {
    total: toNum(r.total),
    by_status: {
      pending: toNum(r.status_pending),
      processing: toNum(r.status_processing),
      done: toNum(r.status_done),
      error: toNum(r.status_error),
    },
    by_source: {
      manual: toNum(r.source_manual),
      whatsapp: toNum(r.source_whatsapp),
      email: toNum(r.source_email),
    },
    today_count: toNum(r.today_count),
    this_week_count: toNum(r.week_count),
  };
}

// ── Bulk-Operationen ──────────────────────────────────────────────────────

/**
 * Status für mehrere Receipts gleichzeitig aktualisieren — transaktional.
 * Gibt die aktualisierten Receipts zurück.
 */
export async function bulkUpdateStatus(
  db: Pool,
  tenantId: string,
  ids: string[],
  status: string,
): Promise<ReceiptResponse[]> {
  if (ids.length === 0) return [];
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query<ReceiptRow>(
      `
      UPDATE receipts
      SET status = $2, updated_at = now()
      WHERE tenant_id = $1 AND id = ANY($3::uuid[])
      RETURNING ${selectColumns()}
      `,
      [tenantId, status, ids],
    );
    await client.query('COMMIT');
    return rows.map(rowToResponse);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ── Export für CSV ────────────────────────────────────────────────────────

export interface ReceiptExportRow {
  id: string;
  status: string;
  original_name: string | null;
  source: string;
  category: string | null;
  amount: number | null;
  currency: string | null;
  date: string | null;
  created_at: string;
}

export async function listReceiptsForExport(
  db: Pool,
  tenantId: string,
): Promise<ReceiptExportRow[]> {
  const { rows } = await db.query<ReceiptRow>(
    `
    SELECT ${selectColumns()}
    FROM receipts
    WHERE tenant_id = $1
    ORDER BY created_at DESC
    `,
    [tenantId],
  );

  return rows.map((row) => {
    const cat = (row.metadata ?? {}) as { categorization?: Record<string, unknown> };
    const c = cat.categorization;
    return {
      id: row.id,
      status: row.status,
      original_name: row.original_name,
      source: row.source,
      category: typeof c?.category === 'string' ? c.category : null,
      amount: typeof c?.amount === 'number' ? c.amount : null,
      currency: typeof c?.currency === 'string' ? c.currency : null,
      date: typeof c?.date === 'string' ? c.date : null,
      created_at: row.created_at.toISOString(),
    };
  });
}

// ── Export für Type-Check ──────────────────────────────────────────────────

export type { ReceiptResponse };
