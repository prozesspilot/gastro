/**
 * D8 — Document-Repository
 *
 * Datenbankzugriff für document_inbox. Alle Queries laufen über withTenant().
 *
 * Öffentliche API:
 *   createDocument(pool, tenantId, input)
 *   findDocumentById(pool, tenantId, id)
 *   listDocuments(pool, tenantId, query)
 *   updateDocumentStatus(pool, tenantId, id, status, errorMessage?)
 */

import type { Pool } from 'pg';
import { withTenant } from '../../core/db/tenant';
import { buildPaginationMeta, type PaginationMeta } from '../../core/schemas/common';

// ── Typen ─────────────────────────────────────────────────────────────────────

export interface CreateDocumentInput {
  customer_id?:   string | null;
  storage_key:    string;
  original_name:  string;
  content_type:   string;
  size_bytes:     number;
}

export type DocumentStatus = 'pending' | 'processing' | 'done' | 'error';

export interface DocumentResponse {
  id:            string;
  tenant_id:     string;
  customer_id:   string | null;
  storage_key:   string;
  original_name: string;
  content_type:  string;
  size_bytes:    number;
  status:        DocumentStatus;
  error_message: string | null;
  routing_tag:   string | null;
  received_at:   string;
  processed_at:  string | null;
  created_at:    string;
  updated_at:    string;
}

export interface ListDocumentsQuery {
  page:     number;
  limit:    number;
  status?:  DocumentStatus;
}

// ── Hilfsfunktion: Row → Response ─────────────────────────────────────────────

function rowToResponse(row: Record<string, unknown>): DocumentResponse {
  return {
    id:            row.id as string,
    tenant_id:     row.tenant_id as string,
    customer_id:   (row.customer_id as string | null) ?? null,
    storage_key:   row.storage_key as string,
    original_name: row.original_name as string,
    content_type:  row.content_type as string,
    size_bytes:    Number(row.size_bytes),
    status:        row.status as DocumentStatus,
    error_message: (row.error_message as string | null) ?? null,
    routing_tag:   (row.routing_tag as string | null) ?? null,
    received_at:   (row.received_at as Date).toISOString(),
    processed_at:  row.processed_at ? (row.processed_at as Date).toISOString() : null,
    created_at:    (row.created_at as Date).toISOString(),
    updated_at:    (row.updated_at as Date).toISOString(),
  };
}

// ── Repository-Funktionen ─────────────────────────────────────────────────────

/** Neues Dokument in document_inbox anlegen. */
export async function createDocument(
  pool: Pool,
  tenantId: string,
  input: CreateDocumentInput,
): Promise<DocumentResponse> {
  return withTenant(pool, tenantId, async (client) => {
    const { rows } = await client.query<Record<string, unknown>>(
      `
      INSERT INTO document_inbox
        (tenant_id, customer_id, storage_key, original_name, content_type, size_bytes)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
      `,
      [
        tenantId,
        input.customer_id ?? null,
        input.storage_key,
        input.original_name,
        input.content_type,
        input.size_bytes,
      ],
    );
    return rowToResponse(rows[0]);
  });
}

/** Einzelnes Dokument per ID laden. */
export async function findDocumentById(
  pool: Pool,
  tenantId: string,
  id: string,
): Promise<DocumentResponse | null> {
  return withTenant(pool, tenantId, async (client) => {
    const { rows } = await client.query<Record<string, unknown>>(
      `SELECT * FROM document_inbox WHERE id = $1`,
      [id],
    );
    return rows[0] ? rowToResponse(rows[0]) : null;
  });
}

/** Paginierte Dokumentenliste mit optionalem Status-Filter. */
export async function listDocuments(
  pool: Pool,
  tenantId: string,
  query: ListDocumentsQuery,
): Promise<{ data: DocumentResponse[]; pagination: PaginationMeta }> {
  const offset = (query.page - 1) * query.limit;

  return withTenant(pool, tenantId, async (client) => {
    const conditions: string[] = [];
    const conditionParams: unknown[] = [];

    if (query.status) {
      conditionParams.push(query.status);
      conditions.push(`status = $${conditionParams.length}`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await client.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM document_inbox ${where}`,
      conditionParams,
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const dataParams = [...conditionParams, query.limit, offset];
    const limitIdx  = dataParams.length - 1;
    const offsetIdx = dataParams.length;

    const shiftedWhere = where; // keine key-Verschiebung nötig (kein Crypto)

    const { rows } = await client.query<Record<string, unknown>>(
      `
      SELECT * FROM document_inbox
      ${shiftedWhere}
      ORDER BY received_at DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}
      `,
      dataParams,
    );

    return {
      data:       rows.map(rowToResponse),
      pagination: buildPaginationMeta(query.page, query.limit, total),
    };
  });
}

/** Verarbeitungsstatus eines Dokuments aktualisieren. */
export async function updateDocumentStatus(
  pool: Pool,
  tenantId: string,
  id: string,
  status: DocumentStatus,
  errorMessage?: string | null,
): Promise<DocumentResponse | null> {
  return withTenant(pool, tenantId, async (client) => {
    const sets: string[]   = ['status = $2', 'updated_at = now()'];
    const params: unknown[] = [id, status];

    if (status === 'done' || status === 'error') {
      sets.push('processed_at = now()');
    }
    if (errorMessage !== undefined) {
      params.push(errorMessage);
      sets.push(`error_message = $${params.length}`);
    }

    const { rows } = await client.query<Record<string, unknown>>(
      `UPDATE document_inbox SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
      params,
    );
    return rows[0] ? rowToResponse(rows[0]) : null;
  });
}
