/**
 * D5 — Customer-Repository
 *
 * Datenbankzugriff für Kunden. Alle Queries laufen über withTenant(),
 * damit RLS-Policies greifen. PII-Felder werden via pgcrypto ver-/entschlüsselt.
 *
 * Öffentliche API:
 *   createCustomer(tenantId, input)
 *   findCustomerById(tenantId, id)
 *   listCustomers(tenantId, query)
 *   updateCustomer(tenantId, id, input)
 *   softDeleteCustomer(tenantId, id)
 */

import type { Pool } from 'pg';
import { decryptExpr, decryptNullableExpr, encryptExpr, getCryptoKey } from '../../core/db/crypto';
import { withTenant } from '../../core/db/tenant';
import type { PaginationMeta } from '../../core/schemas/common';
import { buildPaginationMeta } from '../../core/schemas/common';
import type {
  CreateCustomerInput,
  CustomerResponse,
  ListCustomersQuery,
  UpdateCustomerInput,
} from '../../core/schemas/customer';

// ── SELECT-Fragment mit Entschlüsselung ───────────────────────────────────

/**
 * Erzeugt die SELECT-Spalten mit pgp_sym_decrypt.
 * $1 ist immer der Schlüssel — muss als erster Parameter übergeben werden.
 */
function selectColumns(): string {
  return `
    id,
    tenant_id,
    ${decryptExpr('name_enc')}        AS name,
    ${decryptNullableExpr('email_enc')}      AS email,
    ${decryptNullableExpr('tax_number_enc')} AS tax_number,
    external_id,
    active,
    created_at,
    updated_at
  `;
}

// ── Hilfsfunktion: DB-Row → CustomerResponse ──────────────────────────────

function rowToResponse(row: Record<string, unknown>): CustomerResponse {
  return {
    id: row.id as string,
    tenant_id: row.tenant_id as string,
    name: row.name as string,
    email: (row.email as string | null) ?? null,
    tax_number: (row.tax_number as string | null) ?? null,
    external_id: (row.external_id as string | null) ?? null,
    active: row.active as boolean,
    created_at: (row.created_at as Date).toISOString(),
    updated_at: (row.updated_at as Date).toISOString(),
  };
}

// ── Repository-Funktionen ─────────────────────────────────────────────────

/** Neuen Kunden anlegen. Gibt den vollständigen Datensatz zurück. */
export async function createCustomer(
  pool: Pool,
  tenantId: string,
  input: CreateCustomerInput,
): Promise<CustomerResponse> {
  const key = getCryptoKey();

  return withTenant(pool, tenantId, async (client) => {
    const { rows } = await client.query<Record<string, unknown>>(
      `
      INSERT INTO customers (tenant_id, name_enc, email_enc, tax_number_enc, external_id)
      VALUES (
        $2,
        ${encryptExpr(3)},
        ${input.email ? encryptExpr(4) : 'NULL'},
        ${input.tax_number ? encryptExpr(input.email ? 5 : 4) : 'NULL'},
        ${buildExternalIdParam(input)}
      )
      RETURNING
        id, tenant_id,
        ${decryptExpr('name_enc')}               AS name,
        ${decryptNullableExpr('email_enc')}      AS email,
        ${decryptNullableExpr('tax_number_enc')} AS tax_number,
        external_id, active, created_at, updated_at
      `,
      buildInsertParams(key, tenantId, input),
    );
    return rowToResponse(rows[0]);
  });
}

/** Hilfsfunktion: Parameterliste für INSERT */
function buildInsertParams(key: string, tenantId: string, input: CreateCustomerInput): unknown[] {
  // $1=key, $2=tenantId, $3=name
  const params: unknown[] = [key, tenantId, input.name];
  if (input.email) params.push(input.email);
  if (input.tax_number) params.push(input.tax_number);
  if (input.external_id) params.push(input.external_id);
  return params;
}

/** Hilfsfunktion: external_id-Parameter-Referenz oder NULL */
function buildExternalIdParam(input: CreateCustomerInput): string {
  if (!input.external_id) return 'NULL';
  // Parameter-Index: 3 (name) + optionale email + optionale tax_number + 1
  let idx = 3;
  if (input.email) idx++;
  if (input.tax_number) idx++;
  return `$${idx + 1}`;
}

/** Einzelnen Kunden per ID laden. Gibt null zurück wenn nicht gefunden. */
export async function findCustomerById(
  pool: Pool,
  tenantId: string,
  id: string,
): Promise<CustomerResponse | null> {
  const key = getCryptoKey();

  return withTenant(pool, tenantId, async (client) => {
    const { rows } = await client.query<Record<string, unknown>>(
      `SELECT ${selectColumns()} FROM customers WHERE id = $2 AND active = true`,
      [key, id],
    );
    return rows[0] ? rowToResponse(rows[0]) : null;
  });
}

/** Paginierte Kundenliste mit optionalen Filtern. */
export async function listCustomers(
  pool: Pool,
  tenantId: string,
  query: ListCustomersQuery,
): Promise<{ data: CustomerResponse[]; pagination: PaginationMeta }> {
  const key = getCryptoKey();
  const offset = (query.page - 1) * query.limit;

  // Zulässige Spalten für ORDER BY (SQL-Injection-Schutz)
  const sortColumn: Record<string, string> = {
    created_at: 'created_at',
    updated_at: 'updated_at',
    external_id: 'external_id',
  };
  const orderCol = sortColumn[query.sort_by] ?? 'created_at';
  const orderDir = query.sort_order === 'asc' ? 'ASC' : 'DESC';

  return withTenant(pool, tenantId, async (client) => {
    // WHERE-Klauseln dynamisch zusammenbauen.
    // conditionParams: nur Filter-Werte, kein key ($1 wäre dort ungenutzt).
    // Für die Count-Query sind die Bedingungen $1, $2 …
    // Für die Daten-Query belegt key $1, Bedingungen starten bei $2.
    const conditions: string[] = [];
    const conditionParams: unknown[] = [];

    if (query.active !== undefined) {
      conditionParams.push(query.active);
      conditions.push(`active = $${conditionParams.length}`);
    }
    if (query.external_id) {
      conditionParams.push(query.external_id);
      conditions.push(`external_id = $${conditionParams.length}`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Gesamtanzahl — kein key erforderlich
    const countResult = await client.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM customers ${where}`,
      conditionParams,
    );
    const total = Number.parseInt(countResult.rows[0].count, 10);

    // Daten-Query: key=$1, Bedingungen mit um 1 verschobenen Indizes
    const dataParams: unknown[] = [key];
    const shiftedConditions = conditions.map((cond, i) => {
      dataParams.push(conditionParams[i]);
      return cond.replace(/\$(\d+)/, (_, n) => `$${Number.parseInt(n, 10) + 1}`);
    });
    const dataWhere =
      shiftedConditions.length > 0 ? `WHERE ${shiftedConditions.join(' AND ')}` : '';

    dataParams.push(query.limit, offset);
    const limitIdx = dataParams.length - 1;
    const offsetIdx = dataParams.length;

    const { rows } = await client.query<Record<string, unknown>>(
      `
      SELECT ${selectColumns()}
      FROM customers
      ${dataWhere}
      ORDER BY ${orderCol} ${orderDir}
      LIMIT $${limitIdx} OFFSET $${offsetIdx}
      `,
      dataParams,
    );

    return {
      data: rows.map(rowToResponse),
      pagination: buildPaginationMeta(query.page, query.limit, total),
    };
  });
}

/** Kunden-Felder aktualisieren (Partial Update). */
export async function updateCustomer(
  pool: Pool,
  tenantId: string,
  id: string,
  input: UpdateCustomerInput,
): Promise<CustomerResponse | null> {
  const key = getCryptoKey();

  return withTenant(pool, tenantId, async (client) => {
    // SET-Ausdrücke dynamisch zusammenbauen
    const sets: string[] = ['updated_at = now()'];
    const params: unknown[] = [key, id]; // $1=key, $2=id

    if (input.name !== undefined) {
      params.push(input.name);
      sets.push(`name_enc = ${encryptExpr(params.length)}`);
    }
    if (input.email !== undefined) {
      if (input.email === null || input.email === '') {
        sets.push('email_enc = NULL');
      } else {
        params.push(input.email);
        sets.push(`email_enc = ${encryptExpr(params.length)}`);
      }
    }
    if (input.tax_number !== undefined) {
      if (input.tax_number === null || input.tax_number === '') {
        sets.push('tax_number_enc = NULL');
      } else {
        params.push(input.tax_number);
        sets.push(`tax_number_enc = ${encryptExpr(params.length)}`);
      }
    }
    if (input.external_id !== undefined) {
      params.push(input.external_id ?? null);
      sets.push(`external_id = $${params.length}`);
    }
    if (input.active !== undefined) {
      params.push(input.active);
      sets.push(`active = $${params.length}`);
    }

    const { rows } = await client.query<Record<string, unknown>>(
      `
      UPDATE customers
      SET ${sets.join(', ')}
      WHERE id = $2
      RETURNING
        id, tenant_id,
        ${decryptExpr('name_enc')}               AS name,
        ${decryptNullableExpr('email_enc')}      AS email,
        ${decryptNullableExpr('tax_number_enc')} AS tax_number,
        external_id, active, created_at, updated_at
      `,
      params,
    );

    return rows[0] ? rowToResponse(rows[0]) : null;
  });
}

/** Soft-Delete: setzt active = false. */
export async function softDeleteCustomer(
  pool: Pool,
  tenantId: string,
  id: string,
): Promise<boolean> {
  return withTenant(pool, tenantId, async (client) => {
    const { rowCount } = await client.query(
      'UPDATE customers SET active = false, updated_at = now() WHERE id = $1 AND active = true',
      [id],
    );
    return (rowCount ?? 0) > 0;
  });
}
