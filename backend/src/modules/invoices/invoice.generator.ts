/**
 * T035 — Auto-Rechnungs-Generator
 *
 * Erzeugt monatliche Rechnungen für alle aktiven Tenants.
 * Läuft als Cron am 1. jedes Monats (Spec §6.1).
 *
 * Design-Entscheidungen:
 *   - DECISION: Keine Stripe-Integration (erst ab ~25 Tenants, §6.3).
 *   - DECISION: Keine PDF-Generierung im Pilot (pdf_path = null, Stub).
 *   - DECISION: Idempotenz via DB-UNIQUE-Index (tenant_id, period_year, period_month).
 *     Doppelter Cron-Run erzeugt keinen Fehler — bereits existierende Rechnung wird übersprungen.
 *   - DECISION: Generator läuft IMMER über Owner-Pool (bypasst RLS), da cross-tenant.
 *   - DECISION: Preise aus zentralen Konstanten in invoice.schema.ts.
 */

import type { Pool } from 'pg';
import { logger } from '../../core/logger';
import {
  PACKAGE_MONTHLY_PRICE_BRUTTO_CENT,
  PACKAGE_SETUP_FEE_BRUTTO_CENT,
  UST_RATE,
} from './invoice.schema';
import type { InvoiceResponse } from './invoice.schema';
import {
  createInvoice,
  findExistingMonthlyInvoice,
  nextInvoiceNumber,
} from './invoice.repository';

// ── Typen ─────────────────────────────────────────────────────────────────────

export interface TenantForBilling {
  id:                 string;
  package:            string;
  contract_started_at: Date | null;
  display_name:       string;
}

export interface GeneratorResult {
  tenantId:      string;
  tenantName:    string;
  invoiceId?:    string;
  invoiceNumber?: string;
  skipped:       boolean;
  skipReason?:   string;
  error?:        string;
}

// ── Betrag-Berechnung ──────────────────────────────────────────────────────────

/**
 * Berechnet Netto, USt und Brutto aus einem Brutto-Betrag (inkl. 19% USt).
 * DECISION: Wir rechnen von Brutto zurück — Preise sind UVP inkl. USt.
 * Netto = Brutto / 1.19, USt = Brutto - Netto (Cent-genaue Rundung).
 */
export function calcAmounts(bruttoCent: number): {
  amountNetto: number;
  ustAmount: number;
  amountBrutto: number;
} {
  const amountBrutto = bruttoCent / 100;
  const amountNetto = Math.round((bruttoCent / (1 + UST_RATE)) * 100) / 100 / 100;
  const ustAmount = Math.round((amountBrutto - amountNetto) * 100) / 100;
  return {
    amountNetto: Math.round(amountNetto * 100) / 100,
    ustAmount,
    amountBrutto,
  };
}

// ── Fälligkeitsdatum ───────────────────────────────────────────────────────────

/** 14 Tage Zahlungsziel (Spec §6.1). */
export function calcDueDate(from: Date): Date {
  const due = new Date(from);
  due.setDate(due.getDate() + 14);
  return due;
}

// ── Generator-Kern ─────────────────────────────────────────────────────────────

/**
 * Erzeugt eine monatliche Rechnung für einen einzelnen Tenant.
 * Idempotent: gibt bestehende Rechnung zurück wenn bereits vorhanden.
 */
export async function generateMonthlyInvoiceForTenant(
  pool: Pool,
  tenant: TenantForBilling,
  year: number,
  month: number,
): Promise<GeneratorResult> {
  const ctx = { tenantId: tenant.id, year, month, package: tenant.package };

  // Paket-Preis nachschlagen
  const bruttoCent = PACKAGE_MONTHLY_PRICE_BRUTTO_CENT[tenant.package];
  if (bruttoCent == null) {
    logger.warn(ctx, '[invoice-generator] Unbekanntes Paket — übersprungen');
    return {
      tenantId:    tenant.id,
      tenantName:  tenant.display_name,
      skipped:     true,
      skipReason:  `Unbekanntes Paket: ${tenant.package}`,
    };
  }

  // Idempotenz-Check: bereits vorhanden?
  const existing = await findExistingMonthlyInvoice(pool, tenant.id, year, month);
  if (existing) {
    return {
      tenantId:      tenant.id,
      tenantName:    tenant.display_name,
      invoiceId:     existing.id,
      invoiceNumber: existing.invoice_number,
      skipped:       true,
      skipReason:    'Rechnung bereits vorhanden',
    };
  }

  // Neue Rechnung erstellen
  const invoiceNumber = await nextInvoiceNumber(pool, year);
  const { amountNetto, ustAmount, amountBrutto } = calcAmounts(bruttoCent);
  const dueAt = calcDueDate(new Date());

  let invoice: InvoiceResponse;
  try {
    invoice = await createInvoice(pool, {
      tenantId:     tenant.id,
      invoiceNumber,
      invoiceType:  'monthly',
      periodYear:   year,
      periodMonth:  month,
      amountNetto,
      ustRate:      UST_RATE,
      ustAmount,
      amountBrutto,
      dueAt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ ...ctx, err: message }, '[invoice-generator] Fehler beim Erstellen');
    return {
      tenantId:    tenant.id,
      tenantName:  tenant.display_name,
      skipped:     false,
      error:       message,
    };
  }

  logger.info(
    { tenantId: tenant.id, invoiceNumber, amountBrutto },
    '[invoice-generator] Rechnung erstellt',
  );

  return {
    tenantId:      tenant.id,
    tenantName:    tenant.display_name,
    invoiceId:     invoice.id,
    invoiceNumber: invoice.invoice_number,
    skipped:       false,
  };
}

/**
 * Generiert monatliche Rechnungen für ALLE aktiven Tenants.
 *
 * @param pool  Owner-Pool (RLS bypassed)
 * @param year  Abrechnungsjahr
 * @param month Abrechnungsmonat (1–12)
 */
export async function generateMonthlyInvoices(
  pool: Pool,
  year: number,
  month: number,
): Promise<GeneratorResult[]> {
  logger.info({ year, month }, '[invoice-generator] Monatsabrechnung gestartet');

  // Alle aktiven Tenants laden (contract_started_at gesetzt, kein cancelled_at/deleted_at)
  const { rows } = await pool.query<TenantForBilling>(
    `SELECT id, package, contract_started_at, display_name
     FROM tenants
     WHERE deleted_at IS NULL
       AND cancelled_at IS NULL
       AND contract_started_at IS NOT NULL
       AND deletion_status = 'active'
     ORDER BY created_at`,
  );

  if (rows.length === 0) {
    logger.info('[invoice-generator] Keine aktiven Tenants — nichts zu tun');
    return [];
  }

  logger.info({ count: rows.length }, '[invoice-generator] Aktive Tenants gefunden');

  const results: GeneratorResult[] = [];
  for (const tenant of rows) {
    // Nur Tenants abrechnen die in diesem oder einem früheren Monat gestartet haben
    if (tenant.contract_started_at) {
      const startYear  = tenant.contract_started_at.getFullYear();
      const startMonth = tenant.contract_started_at.getMonth() + 1;
      if (startYear > year || (startYear === year && startMonth > month)) {
        results.push({
          tenantId:   tenant.id,
          tenantName: tenant.display_name,
          skipped:    true,
          skipReason: 'Vertrag startet nach dem Abrechnungsmonat',
        });
        continue;
      }
    }

    const result = await generateMonthlyInvoiceForTenant(pool, tenant, year, month);
    results.push(result);
  }

  const created  = results.filter((r) => !r.skipped && !r.error).length;
  const skipped  = results.filter((r) => r.skipped).length;
  const errored  = results.filter((r) => r.error != null).length;

  logger.info(
    { year, month, created, skipped, errored },
    '[invoice-generator] Monatsabrechnung abgeschlossen',
  );

  return results;
}

// ── Setup-Fee-Generator ────────────────────────────────────────────────────────

/**
 * Erzeugt eine Einmalige Setup-Fee-Rechnung für einen Tenant.
 * Wird beim Onboarding aufgerufen (nicht durch Cron).
 * DECISION: Keine Idempotenz via DB-Index für Setup-Rechnungen (können nach
 * Storno neu gestellt werden). Der Aufrufer ist verantwortlich für den Check.
 */
export async function generateSetupFeeInvoice(
  pool: Pool,
  tenant: TenantForBilling,
): Promise<GeneratorResult> {
  const bruttoCent = PACKAGE_SETUP_FEE_BRUTTO_CENT[tenant.package];
  if (bruttoCent == null) {
    return {
      tenantId:   tenant.id,
      tenantName: tenant.display_name,
      skipped:    true,
      skipReason: `Unbekanntes Paket: ${tenant.package}`,
    };
  }

  const year = new Date().getFullYear();
  const invoiceNumber = await nextInvoiceNumber(pool, year);
  const { amountNetto, ustAmount, amountBrutto } = calcAmounts(bruttoCent);
  const dueAt = calcDueDate(new Date());

  let invoice: InvoiceResponse;
  try {
    invoice = await createInvoice(pool, {
      tenantId:    tenant.id,
      invoiceNumber,
      invoiceType: 'setup',
      periodYear:  null,
      periodMonth: null,
      amountNetto,
      ustRate:     UST_RATE,
      ustAmount,
      amountBrutto,
      dueAt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(
      { tenantId: tenant.id, err: message },
      '[invoice-generator] Setup-Fee-Fehler',
    );
    return {
      tenantId:   tenant.id,
      tenantName: tenant.display_name,
      skipped:    false,
      error:      message,
    };
  }

  logger.info(
    { tenantId: tenant.id, invoiceNumber, amountBrutto },
    '[invoice-generator] Setup-Fee erstellt',
  );

  return {
    tenantId:      tenant.id,
    tenantName:    tenant.display_name,
    invoiceId:     invoice.id,
    invoiceNumber: invoice.invoice_number,
    skipped:       false,
  };
}
