/**
 * M04 — Gegenkonto-Resolver.
 * Bestimmt das DATEV-Gegenkonto (Sammel-Kreditor) für eine Buchung.
 */

import type { Receipt } from '../../_shared/receipts/receipt.repository';

export interface CustomerProfileForDatev {
  customer_id: string;
  /** Optionales Override für Gegenkonto (Standard: 1600) */
  datev_counter_account?: string;
  [key: string]: unknown;
}

/**
 * Gibt das Gegenkonto für eine Buchung zurück.
 * Standard: 1600 (Verbindlichkeiten aus Lieferungen und Leistungen)
 * Override: CustomerProfile.datev_counter_account
 */
export function resolveCounterAccount(
  receipt: Receipt,
  profile: CustomerProfileForDatev,
): string {
  // Optionaler Profil-Override
  if (profile.datev_counter_account && String(profile.datev_counter_account).trim()) {
    return String(profile.datev_counter_account).trim();
  }

  // Steuersatz 0% → trotzdem 1600 (Standard-Kreditor)
  const fields = (
    (receipt.extraction as { fields?: Record<string, unknown> } | undefined)?.fields ?? {}
  ) as { tax_lines?: Array<{ rate: number }> };

  const taxLines = fields.tax_lines ?? [];
  const allZero = taxLines.length > 0 && taxLines.every((t) => t.rate === 0);

  if (allZero) {
    return '1600';
  }

  return '1600';
}
