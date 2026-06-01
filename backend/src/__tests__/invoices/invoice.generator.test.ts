/**
 * T035 — Unit-Tests für invoice.generator
 *
 * Prüft: Betrag-Berechnung, Idempotenz, Paket-Preise, Fälligkeitsdatum.
 * DB wird gemockt — kein echter DB-Zugriff nötig.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { Pool } from 'pg';

// Mocks MÜSSEN vor dem Import des zu testenden Moduls stehen (Vitest-Hoisting)
vi.mock('../../modules/invoices/invoice.repository', () => ({
  findExistingMonthlyInvoice: vi.fn(),
  nextInvoiceNumber: vi.fn(async () => 'PP-2026-00001'),
  createInvoice: vi.fn(),
}));

import {
  calcAmounts,
  calcDueDate,
  generateMonthlyInvoiceForTenant,
  generateSetupFeeInvoice,
} from '../../modules/invoices/invoice.generator';
import {
  PACKAGE_MONTHLY_PRICE_BRUTTO_CENT,
  PACKAGE_SETUP_FEE_BRUTTO_CENT,
  UST_RATE,
} from '../../modules/invoices/invoice.schema';
import * as repo from '../../modules/invoices/invoice.repository';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makePool(): Pool {
  // Minimal-Mock — Generator nutzt Pool nur via Repository-Funktionen (alle gemockt)
  return { query: vi.fn() } as unknown as Pool;
}

function makeInvoiceRow(overrides: Partial<{
  id: string;
  invoice_number: string;
  period_year: number;
  period_month: number;
}> = {}) {
  return {
    id:               overrides.id ?? 'invoice-uuid-1',
    tenant_id:        'tenant-uuid-1',
    invoice_number:   overrides.invoice_number ?? 'PP-2026-00001',
    invoice_type:     'monthly',
    period_year:      overrides.period_year ?? 2026,
    period_month:     overrides.period_month ?? 6,
    amount_netto:     '66.39',
    ust_rate:         '0.1900',
    ust_amount:       '12.61',
    amount_brutto:    '79.00',
    pdf_path:         null,
    status:           'gestellt',
    paid_at:          null,
    paid_amount:      null,
    reminder_sent_at: null,
    due_at:           new Date('2026-06-15'),
    created_at:       new Date('2026-06-01'),
    updated_at:       new Date('2026-06-01'),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('calcAmounts', () => {
  it('berechnet Netto/USt/Brutto korrekt für Standard-Paket (79 €)', () => {
    const bruttoCent = PACKAGE_MONTHLY_PRICE_BRUTTO_CENT.standard; // 7900
    const { amountNetto, ustAmount, amountBrutto } = calcAmounts(bruttoCent);

    expect(amountBrutto).toBe(79.00);
    // Netto = 79 / 1.19 ≈ 66.39
    expect(amountNetto).toBeCloseTo(66.39, 2);
    // USt = 79 - netto ≈ 12.61
    expect(ustAmount).toBeCloseTo(12.61, 2);
    // Netto + USt = Brutto
    expect(amountNetto + ustAmount).toBeCloseTo(amountBrutto, 2);
  });

  it('berechnet korrekt für Solo-Paket (39 €)', () => {
    const { amountBrutto, amountNetto, ustAmount } = calcAmounts(PACKAGE_MONTHLY_PRICE_BRUTTO_CENT.solo);
    expect(amountBrutto).toBe(39.00);
    expect(amountNetto).toBeCloseTo(32.77, 2);
    expect(ustAmount).toBeCloseTo(6.23, 2);
  });

  it('berechnet korrekt für Filiale-Paket (299 €)', () => {
    const { amountBrutto, amountNetto, ustAmount } = calcAmounts(PACKAGE_MONTHLY_PRICE_BRUTTO_CENT.filiale);
    expect(amountBrutto).toBe(299.00);
    // netto + ust ≈ brutto
    expect(amountNetto + ustAmount).toBeCloseTo(amountBrutto, 2);
  });

  it('USt-Rate entspricht Konstante', () => {
    const bruttoCent = 10000; // 100 €
    const { amountNetto, ustAmount } = calcAmounts(bruttoCent);
    const impliedRate = ustAmount / amountNetto;
    expect(impliedRate).toBeCloseTo(UST_RATE, 2);
  });
});

describe('calcDueDate', () => {
  it('addiert 14 Tage', () => {
    const from = new Date('2026-06-01T00:00:00Z');
    const due  = calcDueDate(from);
    expect(due.getDate() - from.getDate()).toBe(14);
  });

  it('überschreitet Monatsgrenze korrekt', () => {
    const from = new Date('2026-06-20T00:00:00Z');
    const due  = calcDueDate(from);
    expect(due.getMonth()).toBe(6); // Juli = 6
    expect(due.getDate()).toBe(4);
  });
});

describe('generateMonthlyInvoiceForTenant', () => {
  const pool = makePool();
  const tenant = {
    id:                  'tenant-uuid-1',
    display_name:        'Pizzeria Bella Italia',
    package:             'standard',
    contract_started_at: new Date('2026-01-01'),
  };

  afterEach(() => {
    vi.clearAllMocks();
  });

  beforeEach(() => {
    vi.mocked(repo.findExistingMonthlyInvoice).mockResolvedValue(null);
    vi.mocked(repo.nextInvoiceNumber).mockResolvedValue('PP-2026-00001');
    vi.mocked(repo.createInvoice).mockResolvedValue({
      ...makeInvoiceRow(),
      // rowToInvoiceResponse gibt dieses Format zurück:
      id:               'invoice-uuid-1',
      tenant_id:        'tenant-uuid-1',
      invoice_number:   'PP-2026-00001',
      invoice_type:     'monthly',
      period_year:      2026,
      period_month:     6,
      amount_netto:     66.39,
      ust_rate:         0.19,
      ust_amount:       12.61,
      amount_brutto:    79.00,
      pdf_path:         null,
      status:           'gestellt',
      paid_at:          null,
      paid_amount:      null,
      reminder_sent_at: null,
      due_at:           '2026-06-15',
      created_at:       '2026-06-01T00:00:00.000Z',
      updated_at:       '2026-06-01T00:00:00.000Z',
    });
  });

  it('erstellt Rechnung wenn noch nicht vorhanden', async () => {
    const result = await generateMonthlyInvoiceForTenant(pool, tenant, 2026, 6);

    expect(result.skipped).toBe(false);
    expect(result.invoiceNumber).toBe('PP-2026-00001');
    expect(result.invoiceId).toBe('invoice-uuid-1');
    expect(repo.createInvoice).toHaveBeenCalledWith(
      pool,
      expect.objectContaining({
        tenantId:    'tenant-uuid-1',
        invoiceType: 'monthly',
        periodYear:  2026,
        periodMonth: 6,
      }),
    );
  });

  it('überspringt Rechnung wenn bereits vorhanden (Idempotenz)', async () => {
    vi.mocked(repo.findExistingMonthlyInvoice).mockResolvedValue({
      id:               'existing-invoice-uuid',
      tenant_id:        'tenant-uuid-1',
      invoice_number:   'PP-2026-00001',
      invoice_type:     'monthly',
      period_year:      2026,
      period_month:     6,
      amount_netto:     66.39,
      ust_rate:         0.19,
      ust_amount:       12.61,
      amount_brutto:    79.00,
      pdf_path:         null,
      status:           'gestellt',
      paid_at:          null,
      paid_amount:      null,
      reminder_sent_at: null,
      due_at:           '2026-06-15',
      created_at:       '2026-06-01T00:00:00.000Z',
      updated_at:       '2026-06-01T00:00:00.000Z',
    });

    const result = await generateMonthlyInvoiceForTenant(pool, tenant, 2026, 6);

    expect(result.skipped).toBe(true);
    expect(result.skipReason).toContain('bereits vorhanden');
    expect(repo.createInvoice).not.toHaveBeenCalled();
  });

  it('überspringt bei unbekanntem Paket', async () => {
    const unknownPkgTenant = { ...tenant, package: 'enterprise' };
    const result = await generateMonthlyInvoiceForTenant(pool, unknownPkgTenant, 2026, 6);

    expect(result.skipped).toBe(true);
    expect(result.skipReason).toContain('Unbekanntes Paket');
    expect(repo.createInvoice).not.toHaveBeenCalled();
  });

  it('gibt Fehler zurück wenn createInvoice wirft', async () => {
    vi.mocked(repo.createInvoice).mockRejectedValue(new Error('DB-Fehler'));

    const result = await generateMonthlyInvoiceForTenant(pool, tenant, 2026, 6);

    expect(result.error).toBe('DB-Fehler');
    expect(result.skipped).toBe(false);
  });

  it('verwendet korrekten Brutto-Betrag für Standard-Paket (79 €)', async () => {
    await generateMonthlyInvoiceForTenant(pool, tenant, 2026, 6);

    const call = vi.mocked(repo.createInvoice).mock.calls[0];
    if (!call) throw new Error('createInvoice wurde nicht aufgerufen');
    const [, input] = call;
    expect(input.amountBrutto).toBe(79.00);
  });
});

describe('generateSetupFeeInvoice', () => {
  const pool = makePool();
  const tenant = {
    id:                  'tenant-uuid-2',
    display_name:        'Café Metropol',
    package:             'solo',
    contract_started_at: new Date('2026-06-01'),
  };

  afterEach(() => {
    vi.clearAllMocks();
  });

  beforeEach(() => {
    vi.mocked(repo.nextInvoiceNumber).mockResolvedValue('PP-2026-00002');
    vi.mocked(repo.createInvoice).mockResolvedValue({
      id:               'setup-invoice-uuid',
      tenant_id:        'tenant-uuid-2',
      invoice_number:   'PP-2026-00002',
      invoice_type:     'setup',
      period_year:      null,
      period_month:     null,
      amount_netto:     251.26,
      ust_rate:         0.19,
      ust_amount:       47.74,
      amount_brutto:    299.00,
      pdf_path:         null,
      status:           'gestellt',
      paid_at:          null,
      paid_amount:      null,
      reminder_sent_at: null,
      due_at:           '2026-06-15',
      created_at:       '2026-06-01T00:00:00.000Z',
      updated_at:       '2026-06-01T00:00:00.000Z',
    });
  });

  it('erstellt Setup-Fee-Rechnung für Solo-Paket (299 €)', async () => {
    const result = await generateSetupFeeInvoice(pool, tenant);

    expect(result.skipped).toBe(false);
    expect(result.invoiceNumber).toBe('PP-2026-00002');
    expect(repo.createInvoice).toHaveBeenCalledWith(
      pool,
      expect.objectContaining({
        tenantId:    'tenant-uuid-2',
        invoiceType: 'setup',
        periodYear:  null,
        periodMonth: null,
        amountBrutto: 299.00,
      }),
    );
  });

  it('überspringt bei unbekanntem Paket', async () => {
    const result = await generateSetupFeeInvoice(pool, { ...tenant, package: 'unknown' });
    expect(result.skipped).toBe(true);
    expect(repo.createInvoice).not.toHaveBeenCalled();
  });
});

describe('Pricing-Konstanten', () => {
  it('alle vier Pakete haben monatlichen Preis', () => {
    expect(PACKAGE_MONTHLY_PRICE_BRUTTO_CENT.solo).toBe(3900);
    expect(PACKAGE_MONTHLY_PRICE_BRUTTO_CENT.standard).toBe(7900);
    expect(PACKAGE_MONTHLY_PRICE_BRUTTO_CENT.pro).toBe(14900);
    expect(PACKAGE_MONTHLY_PRICE_BRUTTO_CENT.filiale).toBe(29900);
  });

  it('alle vier Pakete haben Setup-Fee', () => {
    expect(PACKAGE_SETUP_FEE_BRUTTO_CENT.solo).toBe(29900);
    expect(PACKAGE_SETUP_FEE_BRUTTO_CENT.standard).toBe(49900);
    expect(PACKAGE_SETUP_FEE_BRUTTO_CENT.pro).toBe(79900);
    expect(PACKAGE_SETUP_FEE_BRUTTO_CENT.filiale).toBe(149900);
  });
});
