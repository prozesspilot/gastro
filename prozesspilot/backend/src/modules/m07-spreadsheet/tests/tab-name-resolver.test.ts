/**
 * M07 — tab-name-resolver Unit-Tests
 *
 * Verifiziert Jahres-Rotation (M07 §2 / §7), Custom-Templates und Fallback-Kette
 * (document_date → audit.received → created_at → now()).
 */

import { describe, expect, it } from 'vitest';
import { renderTabName } from '../services/tab-name-resolver';
import type { Receipt } from '../../_shared/receipts/receipt.repository';

function receiptWithDate(date: string): Receipt {
  return {
    receipt_id:  'r1',
    customer_id: 'c1',
    status:      'archived',
    file: { object_key: 'k', mime_type: 'image/jpeg', size_bytes: 1, sha256: 'x' },
    extraction: { fields: { document_date: date } },
  };
}

describe('M07 tab-name-resolver — renderTabName()', () => {
  it('Dezember-Beleg 2026 → "Belege 2026"', () => {
    const tab = renderTabName('Belege {year}', receiptWithDate('2026-12-15'));
    expect(tab).toBe('Belege 2026');
  });

  it('Januar-Beleg 2027 → "Belege 2027"', () => {
    const tab = renderTabName('Belege {year}', receiptWithDate('2027-01-03'));
    expect(tab).toBe('Belege 2027');
  });

  it('Custom-Template mit {year} und {quarter}', () => {
    const tab = renderTabName('{year}-{quarter}', receiptWithDate('2026-07-01'));
    expect(tab).toBe('2026-Q3');
  });

  it('Custom-Template mit {month_de}', () => {
    const tab = renderTabName('{month_de} {year}', receiptWithDate('2026-04-15'));
    expect(tab).toBe('April 2026');
  });

  it('Custom-Template mit {month}', () => {
    const tab = renderTabName('Belege-{year}-{month}', receiptWithDate('2026-03-09'));
    expect(tab).toBe('Belege-2026-03');
  });

  it('Fallback auf audit.received, wenn document_date fehlt', () => {
    const r: Receipt = {
      receipt_id: 'r1', customer_id: 'c1', status: 'archived',
      file: { object_key: 'k', mime_type: 'image/jpeg', size_bytes: 1, sha256: 'x' },
      audit: { events: [{ at: '2025-09-12T10:00:00Z', type: 'received', actor: 'system' }] },
    };
    expect(renderTabName('Belege {year}', r)).toBe('Belege 2025');
  });

  it('Jahresgrenze 31.12.2026 → 2026', () => {
    expect(renderTabName('Belege {year}', receiptWithDate('2026-12-31'))).toBe('Belege 2026');
  });

  it('Jahresgrenze 01.01.2027 → 2027', () => {
    expect(renderTabName('Belege {year}', receiptWithDate('2027-01-01'))).toBe('Belege 2027');
  });
});
