/**
 * T035 — Invoice-Repository
 *
 * Datenbankzugriff für Rechnungen. Alle Queries parametrisiert (§6.4).
 * Läuft über den Owner-Pool (is_rls_bypassed = true) — der Generator
 * muss cross-tenant Rechnungen erstellen und lesen.
 */

import type { Pool } from 'pg';
import type { InvoiceResponse, InvoiceRow, ListInvoicesQuery } from './invoice.schema';
import { rowToInvoiceResponse } from './invoice.schema';

// ── Hilfsfunktionen ───────────────────────────────────────────────────────────

/** Prüft ob eine Rechnung für Tenant + Periode bereits existiert (Idempotenz). */
export async function findExistingMonthlyInvoice(
  pool: Pool,
  tenantId: string,
  year: number,
  month: number,
): Promise<InvoiceResponse | null> {
  const { rows } = await pool.query<InvoiceRow>(
    `SELECT * FROM invoices
     WHERE tenant_id = $1 AND period_year = $2 AND period_month = $3
     LIMIT 1`,
    [tenantId, year, month],
  );
  return rows.length > 0 ? rowToInvoiceResponse(rows[0]) : null;
}

/** Prüft ob eine Setup-Rechnung für den Tenant bereits existiert. */
export async function findExistingSetupInvoice(
  pool: Pool,
  tenantId: string,
): Promise<InvoiceResponse | null> {
  const { rows } = await pool.query<InvoiceRow>(
    `SELECT * FROM invoices
     WHERE tenant_id = $1 AND invoice_type = 'setup'
     ORDER BY created_at DESC
     LIMIT 1`,
    [tenantId],
  );
  return rows.length > 0 ? rowToInvoiceResponse(rows[0]) : null;
}

// ── Nächste Rechnungsnummer ────────────────────────────────────────────────────

/**
 * Generiert die nächste GoBD-konforme Rechnungsnummer.
 * Format: PP-YYYY-NNNNN (lückenlos via DB-Sequenz invoices_number_seq).
 *
 * DECISION: Globale Sequenz statt Pro-Tenant, da GoBD keine Pro-Tenant-
 * Nummerierung verlangt — nur Lückenlosigkeit.
 */
export async function nextInvoiceNumber(pool: Pool, year: number): Promise<string> {
  const { rows } = await pool.query<{ nextval: string }>(
    `SELECT nextval('invoices_number_seq') AS nextval`,
  );
  const seq = parseInt(rows[0].nextval, 10);
  return `PP-${year}-${String(seq).padStart(5, '0')}`;
}

// ── Create ────────────────────────────────────────────────────────────────────

export interface CreateInvoiceInput {
  tenantId:       string;
  invoiceNumber:  string;
  invoiceType:    'setup' | 'monthly';
  periodYear?:    number | null;
  periodMonth?:   number | null;
  amountNetto:    number;   // in EUR
  ustRate:        number;   // z. B. 0.19
  ustAmount:      number;   // in EUR
  amountBrutto:   number;   // in EUR
  dueAt:          Date;
}

export async function createInvoice(
  pool: Pool,
  input: CreateInvoiceInput,
): Promise<InvoiceResponse> {
  const { rows } = await pool.query<InvoiceRow>(
    `INSERT INTO invoices (
       tenant_id, invoice_number, invoice_type,
       period_year, period_month,
       amount_netto, ust_rate, ust_amount, amount_brutto,
       due_at, status
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'gestellt')
     RETURNING *`,
    [
      input.tenantId,
      input.invoiceNumber,
      input.invoiceType,
      input.periodYear ?? null,
      input.periodMonth ?? null,
      input.amountNetto.toFixed(2),
      input.ustRate.toFixed(4),
      input.ustAmount.toFixed(2),
      input.amountBrutto.toFixed(2),
      input.dueAt,
    ],
  );
  return rowToInvoiceResponse(rows[0]);
}

// ── List ──────────────────────────────────────────────────────────────────────

export async function listInvoices(
  pool: Pool,
  query: ListInvoicesQuery,
): Promise<{ data: InvoiceResponse[]; total: number }> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (query.tenant_id) {
    params.push(query.tenant_id);
    conditions.push(`tenant_id = $${params.length}`);
  }
  if (query.status) {
    params.push(query.status);
    conditions.push(`status = $${params.length}`);
  }
  if (query.type) {
    params.push(query.type);
    conditions.push(`invoice_type = $${params.length}`);
  }
  if (query.year) {
    params.push(query.year);
    conditions.push(`period_year = $${params.length}`);
  }
  if (query.month) {
    params.push(query.month);
    conditions.push(`period_month = $${params.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countParams = [...params];
  const { rows: countRows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM invoices ${where}`,
    countParams,
  );
  const total = parseInt(countRows[0].count, 10);

  params.push(query.limit);
  params.push(query.offset);

  const { rows } = await pool.query<InvoiceRow>(
    `SELECT * FROM invoices ${where}
     ORDER BY created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  return { data: rows.map(rowToInvoiceResponse), total };
}

// ── Get by ID ─────────────────────────────────────────────────────────────────

export async function findInvoiceById(
  pool: Pool,
  id: string,
): Promise<InvoiceResponse | null> {
  const { rows } = await pool.query<InvoiceRow>(
    `SELECT * FROM invoices WHERE id = $1 LIMIT 1`,
    [id],
  );
  return rows.length > 0 ? rowToInvoiceResponse(rows[0]) : null;
}

// ── Mark as paid ──────────────────────────────────────────────────────────────

export async function markInvoicePaid(
  pool: Pool,
  id: string,
  paidAmount?: number,
  paidAt?: Date,
): Promise<InvoiceResponse | null> {
  const resolvedPaidAt = paidAt ?? new Date();
  const { rows } = await pool.query<InvoiceRow>(
    `UPDATE invoices
     SET status = 'bezahlt',
         paid_at = $2,
         paid_amount = COALESCE($3, amount_brutto),
         updated_at = now()
     WHERE id = $1 AND status != 'storniert'
     RETURNING *`,
    [id, resolvedPaidAt, paidAmount != null ? paidAmount.toFixed(2) : null],
  );
  return rows.length > 0 ? rowToInvoiceResponse(rows[0]) : null;
}

// ── Cancel (Storno) ───────────────────────────────────────────────────────────

export async function cancelInvoice(
  pool: Pool,
  id: string,
): Promise<InvoiceResponse | null> {
  const { rows } = await pool.query<InvoiceRow>(
    `UPDATE invoices
     SET status = 'storniert', updated_at = now()
     WHERE id = $1 AND status NOT IN ('bezahlt', 'storniert')
     RETURNING *`,
    [id],
  );
  return rows.length > 0 ? rowToInvoiceResponse(rows[0]) : null;
}

// ── Overdue invoices (für Mahn-Cron) ─────────────────────────────────────────

/**
 * Alle überfälligen Rechnungen die noch nicht bezahlt oder storniert sind.
 * Gibt nur die nötigsten Felder zurück (für Mahn-Cron).
 */
export async function findOverdueInvoices(
  pool: Pool,
  asOfDate: Date,
): Promise<InvoiceResponse[]> {
  const { rows } = await pool.query<InvoiceRow>(
    `SELECT * FROM invoices
     WHERE status IN ('gestellt', 'gemahnt_1', 'gemahnt_2')
       AND due_at < $1
     ORDER BY due_at ASC`,
    [asOfDate],
  );
  return rows.map(rowToInvoiceResponse);
}

// ── Update status (für Mahn-Cron) ────────────────────────────────────────────

export async function updateInvoiceStatus(
  pool: Pool,
  id: string,
  status: 'gemahnt_1' | 'gemahnt_2' | 'inkasso',
  reminderSentAt?: Date,
): Promise<void> {
  await pool.query(
    `UPDATE invoices
     SET status = $2,
         reminder_sent_at = COALESCE($3, reminder_sent_at),
         updated_at = now()
     WHERE id = $1`,
    [id, status, reminderSentAt ?? null],
  );
}
