/**
 * Tests für src/api/stats.ts
 */

import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../tests/msw/server';
import { getCustomerStats } from './stats';

const BASE = '/api/v1';

const MOCK_STATS = {
  customer_id: 'cust-001',
  receipts_by_month: [
    { year: 2024, month: 1, count: 12, gross_sum: 2400 },
    { year: 2024, month: 2, count: 8,  gross_sum: 1600 },
  ],
  by_category: [
    { category_name: 'Wareneinkauf', category_id: 'wareneinkauf_food', count: 5, gross_sum: 1000 },
  ],
  top_suppliers: [
    { supplier_name: 'Muster GmbH', count: 3, gross_sum: 600 },
  ],
  export_rate: { lexoffice: 0.8, datev: 0.2 },
  processing_times: { avg_ms: 1200, p95_ms: 3500 },
};

describe('getCustomerStats', () => {
  it('gibt Stats-Objekt zurück', async () => {
    server.use(
      http.get(`${BASE}/customers/:id/stats`, () =>
        HttpResponse.json({ ok: true, data: MOCK_STATS }),
      ),
    );
    const result = await getCustomerStats('cust-001');
    expect(result.customer_id).toBe('cust-001');
    expect(result.receipts_by_month).toHaveLength(2);
  });

  it('übergibt from/to Query-Parameter', async () => {
    server.use(
      http.get(`${BASE}/customers/:id/stats`, ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get('from')).toBe('2024-01');
        expect(url.searchParams.get('to')).toBe('2024-03');
        return HttpResponse.json({ ok: true, data: MOCK_STATS });
      }),
    );
    await getCustomerStats('cust-001', { from: '2024-01', to: '2024-03' });
  });

  it('sendet keine leeren Query-Parameter', async () => {
    server.use(
      http.get(`${BASE}/customers/:id/stats`, ({ request }) => {
        const url = new URL(request.url);
        expect(url.search).toBe('');
        return HttpResponse.json({ ok: true, data: MOCK_STATS });
      }),
    );
    await getCustomerStats('cust-001');
  });

  it('wirft bei 4xx', async () => {
    server.use(
      http.get(`${BASE}/customers/:id/stats`, () =>
        HttpResponse.json({ ok: false, error: { message: 'Nicht gefunden' } }, { status: 404 }),
      ),
    );
    await expect(getCustomerStats('nonexistent')).rejects.toThrow();
  });
});
