/**
 * M08 — WhatsApp-Sender (STUB).
 *
 * Phase 2: nutzt M10-MetaGraphClient + Template 'monthly_report_de'. Bis
 * dahin wird nur geloggt.
 */

import { logger } from '../../../core/logger';
import type { MonthlyTotals } from './aggregator';

export async function sendMonthlyReportSummary(
  phoneNumberId: string,
  to: string,
  totals: MonthlyTotals,
  accessToken: string,
): Promise<void> {
  logger.info(
    {
      phoneNumberId,
      to,
      period: totals.period,
      receipts_count: totals.receipts_count,
      has_token: Boolean(accessToken),
    },
    'WhatsApp-Versand (STUB)',
  );
  // TODO Phase 2: Graph-API call template "monthly_report_de"
}
