/**
 * M09 — Expected-Checker
 *
 * Prüft für einen Kunden ob erwartete Belege eingegangen sind.
 * Für fehlende Belege wird eine Erinnerungsmail gebaut und versendet.
 */

import type { Pool } from 'pg';
import { logger } from '../../../core/logger';

interface ExpectedReceipt {
  expected_id: string;
  customer_id: string;
  supplier_name: string;
  cadence: string;
  expected_day: number | null;
  amount_min: number | null;
  amount_max: number | null;
  remind_after_days: number;
  active: boolean;
}

/**
 * Prüft alle aktiven expected_receipts eines Kunden und erstellt
 * Erinnerungsmails für fehlende Belege.
 *
 * @param customerId - Kunden-ID
 * @param db - Pool
 * @param buildAndSend - Callback um Kommunikation zu bauen und zu versenden
 */
export async function checkExpectedReceipts(
  customerId: string,
  db: Pool,
  buildAndSend: (params: {
    customerId: string;
    trigger: string;
    expectedId: string;
    supplierName: string;
    period: string;
  }) => Promise<void>,
): Promise<{ checked: number; reminded: number }> {
  const { rows: expected } = await db.query<ExpectedReceipt>(
    'SELECT * FROM expected_receipts WHERE customer_id = $1 AND active = true',
    [customerId],
  );

  if (expected.length === 0) return { checked: 0, reminded: 0 };

  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1; // 1-based
  const currentDay = today.getDate();

  let reminded = 0;

  for (const entry of expected) {
    try {
      const expectedDay = entry.expected_day ?? 1;
      const deadlineDay = expectedDay + entry.remind_after_days;

      // Nur wenn wir nach dem Fälligkeitstag + Wartezeit sind
      if (currentDay < deadlineDay) {
        continue;
      }

      // Zeitraum bestimmen
      const period =
        entry.cadence === 'monthly'
          ? `${currentYear}-${String(currentMonth).padStart(2, '0')}`
          : `Q${Math.ceil(currentMonth / 3)} ${currentYear}`;

      // Prüfe ob in diesem Zeitraum ein Beleg von diesem Lieferant eingegangen ist
      const periodStart =
        entry.cadence === 'monthly'
          ? new Date(currentYear, currentMonth - 1, 1)
          : new Date(currentYear, Math.floor((currentMonth - 1) / 3) * 3, 1);

      const { rows: receipts } = await db.query<{ receipt_id: string }>(
        `SELECT r.receipt_id
           FROM receipts r
          WHERE r.customer_id = $1
            AND r.created_at >= $2
            AND r.payload->'extraction'->'fields'->>'supplier_name' ILIKE $3
          LIMIT 1`,
        [customerId, periodStart.toISOString(), `%${entry.supplier_name}%`],
      );

      if (receipts.length > 0) {
        // Beleg bereits eingegangen — alles gut
        continue;
      }

      // Prüfe ob wir in diesem Zeitraum bereits eine Erinnerung geschickt haben
      const { rows: existingComm } = await db.query<{ communication_id: string }>(
        `SELECT communication_id FROM communications
          WHERE customer_id = $1
            AND template IN ('missing_invoice_de_v2', 'reminder_overdue_de_v1')
            AND created_at >= $2
            AND to_address IN (
              SELECT contact_email FROM supplier_contacts
               WHERE customer_id = $1 AND supplier_name ILIKE $3
            )
          LIMIT 1`,
        [customerId, periodStart.toISOString(), `%${entry.supplier_name}%`],
      );

      if (existingComm.length > 0) {
        // Erinnerung bereits geschickt
        continue;
      }

      // Erinnerung bauen und senden
      await buildAndSend({
        customerId,
        trigger: 'missing_receipt',
        expectedId: entry.expected_id,
        supplierName: entry.supplier_name,
        period,
      });
      reminded++;
    } catch (err) {
      logger.warn(
        { err, expected_id: entry.expected_id, customerId },
        'expected-checker: Fehler bei Eintrag',
      );
    }
  }

  return { checked: expected.length, reminded };
}
