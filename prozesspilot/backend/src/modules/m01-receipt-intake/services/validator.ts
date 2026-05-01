/**
 * M01 — Plausibilitäts-Validator (M01 §10)
 *
 * 6 Checks:
 *   - totals_match              |total_gross - (total_net + Σ tax_lines.amount)| ≤ 0.02
 *   - tax_lines_consistent      Für jede Zeile: |amount - (base × rate)| ≤ 0.02
 *   - supplier_known            supplier_name ODER supplier_vat_id gesetzt
 *   - document_date_plausible   Datum ∈ [heute - 5J, heute + 1T]
 *   - duplicate                 (customer_id, supplier_vat_id, document_number) bereits vorhanden
 *   - currency_supported        currency ∈ profile.routing.supported_currencies (Default: ['EUR'])
 *
 * Bei is_valid===false ⇒ status='requires_review' im Handler.
 */

import type { Pool } from 'pg';
import type { ExtractedFields } from './field-extractor';

export type ValidationCheck =
  | 'totals_match'
  | 'tax_lines_consistent'
  | 'supplier_known'
  | 'document_date_plausible'
  | 'duplicate'
  | 'currency_supported';

export interface ValidationIssue {
  code:    string;
  field?:  string;
  message: string;
}

export interface ValidationResult {
  is_valid: boolean;
  issues:   ValidationIssue[];
  checks:   Record<ValidationCheck, boolean>;
}

interface ValidatorProfileSlice {
  routing?: {
    supported_currencies?: string[];
    default_currency?:     string;
  };
}

interface ValidatorContext {
  customerId: string;
  receiptId:  string;       // damit das Receipt sich nicht selbst als Duplikat sieht
  profile:    ValidatorProfileSlice;
}

const TOLERANCE = 0.02;

export async function validate(
  db: Pool,
  fields: ExtractedFields,
  ctx:    ValidatorContext,
): Promise<ValidationResult> {
  const issues: ValidationIssue[] = [];
  const checks: Record<ValidationCheck, boolean> = {
    totals_match:           true,
    tax_lines_consistent:   true,
    supplier_known:         true,
    document_date_plausible:true,
    duplicate:              false,
    currency_supported:     true,
  };

  // ── totals_match ─────────────────────────────────────────────────────────
  if (
    fields.total_gross !== undefined &&
    fields.total_net   !== undefined &&
    Array.isArray(fields.tax_lines)
  ) {
    const taxSum = fields.tax_lines.reduce((s, t) => s + (t.amount ?? 0), 0);
    const diff = Math.abs(fields.total_gross - (fields.total_net + taxSum));
    if (diff > TOLERANCE) {
      checks.totals_match = false;
      issues.push({
        code:    'TOTALS_MISMATCH',
        field:   'total_gross',
        message: `Brutto ${fields.total_gross} ≠ Netto ${fields.total_net} + Steuer ${round2(taxSum)} (Δ ${round2(diff)})`,
      });
    }
  }

  // ── tax_lines_consistent ──────────────────────────────────────────────────
  if (Array.isArray(fields.tax_lines)) {
    for (const [i, t] of fields.tax_lines.entries()) {
      const expected = (t.base ?? 0) * (t.rate ?? 0);
      if (Math.abs((t.amount ?? 0) - expected) > TOLERANCE) {
        checks.tax_lines_consistent = false;
        issues.push({
          code:    'TAX_LINE_INCONSISTENT',
          field:   `tax_lines[${i}]`,
          message: `Zeile ${i}: amount ${t.amount} ≠ base ${t.base} × rate ${t.rate} (=${round2(expected)})`,
        });
      }
    }
  }

  // ── supplier_known ────────────────────────────────────────────────────────
  if (!fields.supplier_name && !fields.supplier_vat_id) {
    checks.supplier_known = false;
    issues.push({
      code:    'SUPPLIER_UNKNOWN',
      field:   'supplier_name',
      message: 'Weder supplier_name noch supplier_vat_id gesetzt.',
    });
  }

  // ── document_date_plausible ──────────────────────────────────────────────
  if (fields.document_date) {
    const date = new Date(fields.document_date + 'T00:00:00Z');
    if (Number.isNaN(date.getTime())) {
      checks.document_date_plausible = false;
      issues.push({
        code:    'DOCUMENT_DATE_INVALID',
        field:   'document_date',
        message: `Ungültiges Datum: ${fields.document_date}`,
      });
    } else {
      const now = Date.now();
      const minMs = now - 5 * 365 * 24 * 60 * 60 * 1000;
      const maxMs = now + 1 * 24 * 60 * 60 * 1000;
      if (date.getTime() < minMs || date.getTime() > maxMs) {
        checks.document_date_plausible = false;
        issues.push({
          code:    'DOCUMENT_DATE_OUT_OF_RANGE',
          field:   'document_date',
          message: `Datum ${fields.document_date} außerhalb [heute-5J, heute+1T].`,
        });
      }
    }
  }

  // ── duplicate ─────────────────────────────────────────────────────────────
  if (fields.supplier_vat_id && fields.document_number) {
    const { rows } = await db.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count
         FROM receipts
        WHERE customer_id = $1
          AND payload->'extraction'->'fields'->>'supplier_vat_id' = $2
          AND payload->'extraction'->'fields'->>'document_number' = $3
          AND receipt_id <> $4`,
      [ctx.customerId, fields.supplier_vat_id, fields.document_number, ctx.receiptId],
    );
    const count = parseInt(rows[0]?.count ?? '0', 10);
    if (count > 0) {
      checks.duplicate = true;
      issues.push({
        code:    'DUPLICATE_RECEIPT',
        field:   'document_number',
        message: `Es existiert bereits ein Beleg ${fields.supplier_vat_id} / ${fields.document_number}.`,
      });
    }
  }

  // ── currency_supported ────────────────────────────────────────────────────
  const supported = ctx.profile.routing?.supported_currencies ?? ['EUR'];
  if (fields.currency && !supported.includes(fields.currency)) {
    checks.currency_supported = false;
    issues.push({
      code:    'CURRENCY_NOT_SUPPORTED',
      field:   'currency',
      message: `Währung ${fields.currency} nicht in supported_currencies (${supported.join(', ')}).`,
    });
  }

  const is_valid =
    checks.totals_match &&
    checks.tax_lines_consistent &&
    checks.supplier_known &&
    checks.document_date_plausible &&
    !checks.duplicate &&
    checks.currency_supported;

  return { is_valid, issues, checks };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
