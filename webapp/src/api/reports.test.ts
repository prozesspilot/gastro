/**
 * Tests für src/api/reports.ts
 */

import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../tests/msw/server';
import { buildReport, deliverReport, getReports, downloadReport, pushToLexoffice } from './reports';

const BASE = '/api/v1';

const MOCK_REPORT = {
  report_id: 'rep-001',
  customer_id: 'cust-001',
  period: '2024-01',
  status: 'done',
  pdf_object_key: 'reports/2024-01.pdf',
  totals: {
    receipts_count: 12,
    gross_sum: 5000,
    net_sum: 4200,
    trend_pct: 10,
    top_categories: [],
    top_suppliers: [],
  },
  delivery_log: [],
  created_at: '2024-02-01T00:00:00Z',
};

describe('buildReport', () => {
  it('erstellt einen Bericht', async () => {
    server.use(
      http.post(`${BASE}/customers/:id/reports/monthly/build`, () =>
        HttpResponse.json({ ok: true, data: { report_id: 'rep-001', period: '2024-01', status: 'done', totals: null } }),
      ),
    );
    const result = await buildReport('cust-001', { period: '2024-01' });
    expect(result.report_id).toBe('rep-001');
    expect(result.period).toBe('2024-01');
  });

  it('wirft bei Fehler', async () => {
    server.use(
      http.post(`${BASE}/customers/:id/reports/monthly/build`, () =>
        HttpResponse.json({ ok: false, error: { message: 'Build fehlgeschlagen' } }, { status: 500 }),
      ),
    );
    await expect(buildReport('cust-001', {})).rejects.toThrow('Build fehlgeschlagen');
  });
});

describe('deliverReport', () => {
  it('stellt einen Bericht zu', async () => {
    server.use(
      http.post(`${BASE}/customers/:id/reports/monthly/deliver`, () =>
        HttpResponse.json({
          ok: true,
          data: {
            report_id: 'rep-001',
            period: '2024-01',
            delivered: [{ channel: 'email', to: 'test@example.com', status: 'sent' }],
          },
        }),
      ),
    );
    const result = await deliverReport('cust-001', { period: '2024-01' });
    expect(result.delivered).toHaveLength(1);
  });
});

describe('getReports', () => {
  it('gibt Report-Liste zurück', async () => {
    server.use(
      http.get(`${BASE}/customers/:id/reports`, () =>
        HttpResponse.json({ ok: true, data: [MOCK_REPORT] }),
      ),
    );
    const result = await getReports('cust-001');
    expect(result).toHaveLength(1);
    expect(result[0].period).toBe('2024-01');
  });

  it('gibt leere Liste zurück wenn keine Reports', async () => {
    server.use(
      http.get(`${BASE}/customers/:id/reports`, () =>
        HttpResponse.json({ ok: true, data: [] }),
      ),
    );
    const result = await getReports('cust-001');
    expect(result).toEqual([]);
  });

  it('gibt leere Liste zurück wenn Data kein Array ist', async () => {
    server.use(
      http.get(`${BASE}/customers/:id/reports`, () =>
        HttpResponse.json({ ok: true, data: null }),
      ),
    );
    const result = await getReports('cust-001');
    expect(result).toEqual([]);
  });
});

describe('downloadReport', () => {
  it('gibt Blob zurück', async () => {
    server.use(
      http.get(`${BASE}/customers/:id/reports/:reportId/download`, () =>
        new HttpResponse(new Blob(['%PDF']), { headers: { 'Content-Type': 'application/pdf' } }),
      ),
    );
    const blob = await downloadReport('cust-001', 'rep-001');
    expect(blob.size).toBeGreaterThan(0);
    expect(blob.type).toBe('application/pdf');
  });

  it('wirft bei 404', async () => {
    server.use(
      http.get(`${BASE}/customers/:id/reports/:reportId/download`, () =>
        HttpResponse.json({ ok: false, error: { message: 'Nicht gefunden' } }, { status: 404 }),
      ),
    );
    await expect(downloadReport('cust-001', 'nonexistent')).rejects.toThrow('Nicht gefunden');
  });
});

describe('pushToLexoffice', () => {
  it('pusht Beleg zu Lexoffice', async () => {
    server.use(
      http.post(`${BASE}/receipts/:id/exports/lexoffice`, () =>
        HttpResponse.json({
          ok: true,
          data: { receipt_patch: { status: 'exported', exports: [] } },
        }),
      ),
    );
    const result = await pushToLexoffice('r-001', {});
    expect(result.receipt_patch.status).toBe('exported');
  });
});
