/**
 * T005/M15 — Tests fuer Sync-Service.
 *
 * Wir testen:
 *   1. aggregateTransactions (Pure-Function) — Aggregations-Logik
 *   2. syncDay (Service) — Happy + No-Token + Retry + Final-Fail mit Mocks
 */

import type Redis from 'ioredis';
import type { Pool } from 'pg';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { aggregateTransactions, syncDay } from '../sumup-sync.service';
import { SumUpApiError, type SumUpTransaction } from '../sumup.service';

vi.mock('../kasse-transactions.repository', () => ({
  upsertKasseTransactionDay: vi.fn(async (_pool: Pool, agg: Record<string, unknown>) => ({
    id: 'kt-1',
    ...agg,
  })),
}));

const TENANT = '550e8400-e29b-41d4-a716-446655440000';
const STAFF = '550e8400-e29b-41d4-a716-446655440099';

// ── aggregateTransactions ─────────────────────────────────────────────────

function makeTx(overrides: Partial<SumUpTransaction>): SumUpTransaction {
  return {
    id: 'tx-1',
    timestamp: '2026-05-18T12:00:00Z',
    amount: 10,
    currency: 'EUR',
    status: 'SUCCESSFUL',
    payment_type: 'CARD',
    vat_rate: 0.19,
    ...overrides,
  };
}

describe('aggregateTransactions', () => {
  it('aggregiert mehrere Card-Transaktionen mit 19% MwSt', () => {
    const agg = aggregateTransactions([
      makeTx({ amount: 11.9, payment_type: 'CARD' }),
      makeTx({ amount: 23.8, payment_type: 'CARD' }),
    ]);
    expect(agg.transactionCount).toBe(2);
    expect(agg.totalBrutto).toBe(35.7);
    expect(agg.ust19Brutto).toBe(35.7);
    expect(agg.ust19Amount).toBeCloseTo(5.7, 2);
    expect(agg.paymentMethodSplit.card).toBe(35.7);
  });

  it('mischt 7% und 19% korrekt', () => {
    const agg = aggregateTransactions([
      makeTx({ amount: 10.7, vat_rate: 0.07 }),
      makeTx({ amount: 11.9, vat_rate: 0.19 }),
    ]);
    expect(agg.ust7Brutto).toBe(10.7);
    expect(agg.ust19Brutto).toBe(11.9);
    expect(agg.totalBrutto).toBe(22.6);
  });

  it('ignoriert nicht-SUCCESSFUL Transaktionen', () => {
    const agg = aggregateTransactions([
      makeTx({ amount: 10, status: 'SUCCESSFUL' }),
      makeTx({ amount: 99, status: 'FAILED' }),
      makeTx({ amount: 50, status: 'REFUNDED' }),
    ]);
    expect(agg.transactionCount).toBe(1);
    expect(agg.totalBrutto).toBe(10);
  });

  it('Payment-Method-Normalisierung CASH/CARD/MOBILE/OTHER', () => {
    const agg = aggregateTransactions([
      makeTx({ amount: 10, payment_type: 'CASH' }),
      makeTx({ amount: 20, payment_type: 'CARD' }),
      makeTx({ amount: 30, payment_type: 'MOBILE_PAYMENT' }),
      makeTx({ amount: 5, payment_type: 'BANK_TRANSFER' }),
    ]);
    expect(agg.paymentMethodSplit.cash).toBe(10);
    expect(agg.paymentMethodSplit.card).toBe(20);
    expect(agg.paymentMethodSplit.mobile).toBe(30);
    expect(agg.paymentMethodSplit.other).toBe(5);
  });

  it('Products-Array wird pro Position aggregiert', () => {
    const agg = aggregateTransactions([
      makeTx({
        amount: 21.4,
        products: [
          { name: 'Pizza', price: 10, vat_rate: 0.07, quantity: 1 },
          { name: 'Wein', price: 5.95, vat_rate: 0.19, quantity: 2 },
        ],
      }),
    ]);
    expect(agg.ust7Brutto).toBe(10);
    expect(agg.ust19Brutto).toBe(11.9);
  });

  it('0% MwSt landet in ust_0_brutto (Pfand etc.)', () => {
    const agg = aggregateTransactions([makeTx({ amount: 2.5, vat_rate: 0 })]);
    expect(agg.ust0Brutto).toBe(2.5);
    expect(agg.ust19Amount).toBe(0);
    expect(agg.ust7Amount).toBe(0);
  });

  it('leere Liste → alle Werte 0', () => {
    const agg = aggregateTransactions([]);
    expect(agg.transactionCount).toBe(0);
    expect(agg.totalBrutto).toBe(0);
    expect(agg.paymentMethodSplit).toEqual({});
  });
});

// ── syncDay ───────────────────────────────────────────────────────────────

describe('syncDay', () => {
  const pool = {} as unknown as Pool;
  const redis = {} as unknown as Redis;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Happy-Path: synced mit aggregierten Transaktionen', async () => {
    const result = await syncDay(TENANT, '2026-05-18', STAFF, {
      pool,
      redis,
      getAccessTokenImpl: async () => 'fake-token',
      fetchTransactionHistoryImpl: async () => [makeTx({ amount: 11.9 }), makeTx({ amount: 23.8 })],
    });
    expect(result.status).toBe('synced');
    expect(result.transaction_count).toBe(2);
    expect(result.total_brutto).toBe(35.7);
    expect(result.attempts).toBe(1);
  });

  it('Kein Token → status=skipped_no_token', async () => {
    const result = await syncDay(TENANT, '2026-05-18', STAFF, {
      pool,
      redis,
      getAccessTokenImpl: async () => null,
      fetchTransactionHistoryImpl: async () => [],
    });
    expect(result.status).toBe('skipped_no_token');
    expect(result.attempts).toBe(1);
  });

  it('Auth-Fehler (401) → kein Retry, sofort failed', async () => {
    const result = await syncDay(TENANT, '2026-05-18', STAFF, {
      pool,
      redis,
      getAccessTokenImpl: async () => 'expired-token',
      fetchTransactionHistoryImpl: async () => {
        throw new SumUpApiError(401, 'Unauthorized');
      },
      fetchImpl: vi.fn(async () => new Response('ok')) as unknown as typeof fetch,
    });
    expect(result.status).toBe('failed');
    expect(result.attempts).toBe(1);
  });

  it('Netzwerk-Fehler → 3 Retries, dann failed', async () => {
    const attempts: number[] = [];
    const result = await syncDay(TENANT, '2026-05-18', STAFF, {
      pool,
      redis,
      getAccessTokenImpl: async () => 'token',
      fetchTransactionHistoryImpl: async () => {
        attempts.push(Date.now());
        throw new Error('ECONNRESET');
      },
      fetchImpl: vi.fn(async () => new Response('ok')) as unknown as typeof fetch,
    });
    expect(result.status).toBe('failed');
    expect(result.attempts).toBe(3);
    expect(attempts.length).toBe(3);
  }, 30_000); // exponential backoff: 0+1s+4s = 5s

  it('Retry erfolgreich beim 2. Versuch', async () => {
    let calls = 0;
    const result = await syncDay(TENANT, '2026-05-18', STAFF, {
      pool,
      redis,
      getAccessTokenImpl: async () => 'token',
      fetchTransactionHistoryImpl: async () => {
        calls++;
        if (calls === 1) throw new Error('Transient 503');
        return [makeTx({ amount: 11.9 })];
      },
    });
    expect(result.status).toBe('synced');
    expect(result.attempts).toBe(2);
    expect(result.transaction_count).toBe(1);
  }, 10_000);
});
