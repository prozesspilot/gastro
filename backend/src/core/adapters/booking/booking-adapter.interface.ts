/**
 * BookingAdapter Interface — gemeinsame Abstraktion für M05 (Lexoffice) und M06 (sevDesk).
 *
 * Jede Buchungsintegration implementiert dieses Interface, damit der
 * Master-Workflow zwischen verschiedenen Adaptern wechseln kann, ohne
 * den Handler-Code zu ändern.
 */

import type { Receipt } from '../../../modules/_shared/receipts/receipt.repository';

/**
 * Ein Export-Eintrag, der in receipt.exports[] gespeichert wird.
 * Identisch mit dem Shape, den M05 und M06 in die Receipt-Payload schreiben.
 */
export interface ExportEntry {
  target: 'lexoffice' | 'sevdesk';
  status: 'pushed' | 'failed';
  external_id: string;
  external_url: string;
  pushed_at: string;
}

/**
 * CustomerProfile — Minimal-Shape für die Adapter.
 * Vollständiges Profil ist in customer_profiles (JSONB), hier nur was Adapter brauchen.
 */
export interface CustomerProfile {
  customer_id: string;
  modules_enabled?: string[];
  integrations?: Record<string, unknown>;
  custom?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Gemeinsames Interface für alle Buchungs-Adapter (M05 Lexoffice, M06 sevDesk).
 */
export interface BookingAdapter {
  readonly id: 'lexoffice' | 'sevdesk';

  /**
   * Schiebt einen Receipt als Beleg (Voucher) an den externen Dienst.
   * Muss idempotent sein: zweiter Aufruf mit demselben Receipt gibt existing zurück.
   */
  pushVoucher(receipt: Receipt, profile: CustomerProfile): Promise<ExportEntry>;

  /**
   * Testet ob die Verbindung/Credentials für den Kunden gültig sind.
   * @param customerId — ProzessPilot Customer-ID
   */
  testConnection(customerId: string): Promise<{ ok: boolean; organizationName?: string }>;
}
