/**
 * T005/M15 — SumUp Daily-Sync-Service.
 *
 * syncDay(tenantId, businessDate):
 *   1. Access-Token aus pos_credentials laden (mit Auto-Refresh).
 *   2. Transaktions-History via SumUp-API fuer 00:00..24:00 UTC pullen.
 *   3. Aggregation: total brutto/netto, MwSt 7/19/0-Split, Payment-Methode-Split.
 *   4. UPSERT in kasse_transactions (idempotent ueber UNIQUE).
 *   5. Audit-Log + last_used_at update.
 *
 * Retry: 3 Versuche mit exponential Backoff (1s/4s/16s) bei 5xx oder
 * Netzwerk-Fehlern. Bei Auth-Fehlern oder 4xx: kein Retry, sofort fehlschlagen
 * (Token revoked → Mitarbeiter muss Re-OAuth machen).
 *
 * Discord-Alert nach finalem Fail via DISCORD_OPS_WEBHOOK_URL.
 */

import type Redis from 'ioredis';
import type { Pool } from 'pg';

import { config } from '../../core/config';
import { logger } from '../../core/logger';
import { type DailyAggregate, upsertKasseTransactionDay } from './kasse-transactions.repository';
import { getSumUpAccessToken } from './pos-token-helper';
import { SumUpApiError, type SumUpTransaction, fetchTransactionHistory } from './sumup.service';

const MAX_ATTEMPTS = 3;

export interface SyncDayResult {
  tenant_id: string;
  business_date: string;
  status: 'synced' | 'skipped_no_token' | 'failed';
  transaction_count: number;
  total_brutto: number;
  error?: string;
  attempts: number;
}

export interface SyncDeps {
  pool: Pool;
  redis?: Redis;
  /** Test-Hook: ueberschreibt die SumUp-API. */
  fetchTransactionHistoryImpl?: typeof fetchTransactionHistory;
  /** Test-Hook: Token-Lookup mocken. */
  getAccessTokenImpl?: typeof getSumUpAccessToken;
  /** Test-Hook: Discord-Webhook-fetch mocken. */
  fetchImpl?: typeof fetch;
}

/**
 * Aggregiert eine Liste SumUp-Transaktionen zu einem Daily-Z-Bon.
 * Pure Funktion — testbar ohne DB.
 *
 * Strategie:
 *   * Nur status='SUCCESSFUL' wird gezaehlt (Refunds/Failed ignoriert).
 *   * Brutto = SumUp.amount (positiv = Einnahme).
 *   * Netto + MwSt-Amount aus vat_rate berechnet wenn vorhanden, sonst
 *     19% als Default (gastro-typisch fuer Getraenke/Vor-Ort).
 *   * MwSt-Split: pro Position wenn products[] vorhanden, sonst ueber den
 *     ganzen Betrag mit dem transaction-vat_rate.
 *   * Payment-Method-Split: CARD/CASH/MOBILE/OTHER (alles andere = 'other').
 */
export function aggregateTransactions(
  transactions: SumUpTransaction[],
): Omit<DailyAggregate, 'tenantId' | 'posSystem' | 'businessDate'> {
  let totalBrutto = 0;
  let totalNetto = 0;
  let ust19Brutto = 0;
  let ust19Netto = 0;
  let ust19Amount = 0;
  let ust7Brutto = 0;
  let ust7Netto = 0;
  let ust7Amount = 0;
  let ust0Brutto = 0;
  let transactionCount = 0;
  const paymentMethodSplit: Record<string, number> = {};

  for (const tx of transactions) {
    if (tx.status !== 'SUCCESSFUL') continue;
    if (typeof tx.amount !== 'number' || tx.amount <= 0) continue;
    transactionCount++;
    totalBrutto = round2(totalBrutto + tx.amount);

    // Payment-Method
    const pm = normalizePaymentMethod(tx.payment_type);
    paymentMethodSplit[pm] = round2((paymentMethodSplit[pm] ?? 0) + tx.amount);

    // MwSt-Split — pro Position wenn vorhanden, sonst Transaction-vat_rate, sonst 19%
    if (tx.products && tx.products.length > 0) {
      for (const p of tx.products) {
        const price = p.price ?? 0;
        const qty = p.quantity ?? 1;
        const grossLine = round2(price * qty);
        const vatRate = p.vat_rate ?? tx.vat_rate ?? 0.19;
        applyVatLine(vatRate, grossLine, (b19, n19, a19, b7, n7, a7, b0) => {
          ust19Brutto = round2(ust19Brutto + b19);
          ust19Netto = round2(ust19Netto + n19);
          ust19Amount = round2(ust19Amount + a19);
          ust7Brutto = round2(ust7Brutto + b7);
          ust7Netto = round2(ust7Netto + n7);
          ust7Amount = round2(ust7Amount + a7);
          ust0Brutto = round2(ust0Brutto + b0);
        });
      }
    } else {
      const vatRate = tx.vat_rate ?? 0.19;
      applyVatLine(vatRate, tx.amount, (b19, n19, a19, b7, n7, a7, b0) => {
        ust19Brutto = round2(ust19Brutto + b19);
        ust19Netto = round2(ust19Netto + n19);
        ust19Amount = round2(ust19Amount + a19);
        ust7Brutto = round2(ust7Brutto + b7);
        ust7Netto = round2(ust7Netto + n7);
        ust7Amount = round2(ust7Amount + a7);
        ust0Brutto = round2(ust0Brutto + b0);
      });
    }
  }

  totalNetto = round2(ust19Netto + ust7Netto + ust0Brutto);

  return {
    totalBrutto,
    totalNetto,
    transactionCount,
    ust19Brutto,
    ust19Netto,
    ust19Amount,
    ust7Brutto,
    ust7Netto,
    ust7Amount,
    ust0Brutto,
    paymentMethodSplit,
  };
}

function applyVatLine(
  vatRate: number,
  brutto: number,
  apply: (
    b19: number,
    n19: number,
    a19: number,
    b7: number,
    n7: number,
    a7: number,
    b0: number,
  ) => void,
): void {
  if (Math.abs(vatRate - 0.19) < 0.001) {
    const netto = brutto / 1.19;
    apply(brutto, netto, brutto - netto, 0, 0, 0, 0);
  } else if (Math.abs(vatRate - 0.07) < 0.001) {
    const netto = brutto / 1.07;
    apply(0, 0, 0, brutto, netto, brutto - netto, 0);
  } else {
    // 0% (Pfand / durchlaufende Posten) oder unbekannt
    apply(0, 0, 0, 0, 0, 0, brutto);
  }
}

function normalizePaymentMethod(raw: string | undefined): string {
  const lower = (raw ?? '').toLowerCase();
  if (lower.includes('cash')) return 'cash';
  if (lower.includes('card')) return 'card';
  if (lower.includes('mobile')) return 'mobile';
  return 'other';
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ── Main Sync-Function ──────────────────────────────────────────────────

async function sendDiscordAlert(
  tenantId: string,
  date: string,
  errorMessage: string,
  fetchImpl: typeof fetch,
): Promise<void> {
  const url = config.DISCORD_OPS_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: `🔴 SumUp-Sync fuer Tenant \`${tenantId.slice(0, 8)}…\` (${date}) nach ${MAX_ATTEMPTS} Versuchen fehlgeschlagen.\nFehler: ${errorMessage.slice(0, 200)}`,
      }),
    });
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err), tenantId },
      '[sumup-sync] Discord-Alert konnte nicht gesendet werden',
    );
  }
}

/**
 * Pullt + aggregiert + persistiert einen Tag fuer einen Tenant.
 */
export async function syncDay(
  tenantId: string,
  businessDate: string, // ISO YYYY-MM-DD
  actorUserId: string,
  deps: SyncDeps,
): Promise<SyncDayResult> {
  const fetchHistory = deps.fetchTransactionHistoryImpl ?? fetchTransactionHistory;
  const getToken = deps.getAccessTokenImpl ?? getSumUpAccessToken;
  const fetchImpl = deps.fetchImpl ?? fetch;

  // ISO-Datums-Fenster fuer SumUp (UTC).
  const fromIso = `${businessDate}T00:00:00Z`;
  const toIso = `${businessDate}T23:59:59Z`;

  let lastError: string | null = null;
  let attempt = 0;

  while (attempt < MAX_ATTEMPTS) {
    attempt++;
    try {
      const token = await getToken(deps.pool, tenantId, deps.redis);
      if (!token) {
        logger.warn({ tenantId, businessDate }, '[sumup-sync] Kein aktiver SumUp-Token — Skip');
        return {
          tenant_id: tenantId,
          business_date: businessDate,
          status: 'skipped_no_token',
          transaction_count: 0,
          total_brutto: 0,
          attempts: attempt,
        };
      }

      const transactions = await fetchHistory(token, fromIso, toIso);
      const agg = aggregateTransactions(transactions);

      await upsertKasseTransactionDay(
        deps.pool,
        {
          tenantId,
          posSystem: 'sumup_lite',
          businessDate,
          ...agg,
          rawData: {
            sumup_fetched_at: new Date().toISOString(),
            count: transactions.length,
          },
        },
        actorUserId,
      );

      logger.info(
        {
          tenantId,
          businessDate,
          count: agg.transactionCount,
          total: agg.totalBrutto,
        },
        '[sumup-sync] Tag erfolgreich synchronisiert',
      );

      return {
        tenant_id: tenantId,
        business_date: businessDate,
        status: 'synced',
        transaction_count: agg.transactionCount,
        total_brutto: agg.totalBrutto,
        attempts: attempt,
      };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      const isAuth4xx =
        err instanceof SumUpApiError && err.statusCode >= 400 && err.statusCode < 500;
      logger.warn(
        { err: lastError, tenantId, businessDate, attempt },
        '[sumup-sync] Versuch fehlgeschlagen',
      );
      if (isAuth4xx) {
        // Kein Retry bei 4xx — Token revoked oder Validierungs-Fehler
        await sendDiscordAlert(tenantId, businessDate, lastError, fetchImpl);
        return {
          tenant_id: tenantId,
          business_date: businessDate,
          status: 'failed',
          transaction_count: 0,
          total_brutto: 0,
          error: lastError,
          attempts: attempt,
        };
      }
      if (attempt < MAX_ATTEMPTS) {
        // Exponential Backoff: 1s, 4s
        const delayMs = 1000 * 4 ** (attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  // Final Fail
  await sendDiscordAlert(tenantId, businessDate, lastError ?? 'unbekannt', fetchImpl);
  return {
    tenant_id: tenantId,
    business_date: businessDate,
    status: 'failed',
    transaction_count: 0,
    total_brutto: 0,
    error: lastError ?? 'unbekannt',
    attempts: attempt,
  };
}
