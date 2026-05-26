/**
 * Tests für src/api/receipts.ts
 * Nutzt MSW für HTTP-Mocks (kein echter Netzwerk-Call).
 */

import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../tests/msw/server';
import {
  getReceipts,
  getReceipt,
  uploadReceipt,
  updateReceiptStatus,
  reprocessReceipt,
  downloadReceipt,
  getReceiptStats,
  mapReceipt,
} from './receipts';

const BASE = '/api/v1';

describe('getReceipts', () => {
  it('gibt leere Liste zurück wenn Backend 0 Receipts liefert', async () => {
    const result = await getReceipts(undefined, {});
    expect(result).toEqual([]);
  });

  it('filtert nach Status', async () => {
    server.use(
      http.get(`${BASE}/receipts`, ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get('status')).toBe('done');
        return HttpResponse.json({ ok: true, data: { receipts: [], total: 0 } });
      }),
    );
    const result = await getReceipts(undefined, { status: 'done' });
    expect(result).toEqual([]);
  });

  it('filtert nach customerId', async () => {
    server.use(
      http.get(`${BASE}/receipts`, ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get('customer_id')).toBe('cust-001');
        return HttpResponse.json({ ok: true, data: { receipts: [], total: 0 } });
      }),
    );
    await getReceipts('cust-001', {});
  });

  it('mappt Backend-Receipt korrekt auf Frontend-Receipt', async () => {
    const backendReceipt = {
      id: 'r-001',
      tenant_id: 't-001',
      customer_id: 'c-001',
      status: 'done',
      original_name: 'beleg.pdf',
      mime_type: 'application/pdf',
      storage_key: null,
      file_size_bytes: 2048,
      file_sha256: null,
      source: 'manual',
      metadata: {},
      error_message: null,
      created_at: '2024-06-01T10:00:00Z',
      updated_at: '2024-06-01T11:00:00Z',
    };
    server.use(
      http.get(`${BASE}/receipts`, () =>
        HttpResponse.json({ ok: true, data: { receipts: [backendReceipt], total: 1 } }),
      ),
    );
    const result = await getReceipts(undefined, {});
    expect(result).toHaveLength(1);
    const r = result[0];
    expect(r.id).toBe('r-001');
    expect(r.status).toBe('done');
    expect(r.file_name).toBe('beleg.pdf');
    expect(r.file_size).toBe(2048);
  });

  it('wirft ApiError bei 4xx-Antwort', async () => {
    server.use(
      http.get(`${BASE}/receipts`, () =>
        HttpResponse.json({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Nicht erlaubt' } }, { status: 401 }),
      ),
    );
    await expect(getReceipts(undefined, {})).rejects.toThrow('Nicht erlaubt');
  });

  it('verarbeitet Array-Format (Legacy-Backend)', async () => {
    const raw = [
      { id: 'r-001', customer_id: 'c-001', status: 'pending', created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z' },
    ];
    server.use(
      http.get(`${BASE}/receipts`, () => HttpResponse.json({ ok: true, data: raw })),
    );
    const result = await getReceipts(undefined, {});
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('pending');
  });
});

describe('getReceipt', () => {
  it('lädt einen einzelnen Receipt per ID', async () => {
    const result = await getReceipt('receipt-test-id');
    expect(result.id).toBe('receipt-test-id');
    expect(result.status).toBe('done');
  });

  it('wirft bei 404', async () => {
    server.use(
      http.get(`${BASE}/receipts/:id`, () =>
        HttpResponse.json({ ok: false, error: { code: 'NOT_FOUND', message: 'Nicht gefunden' } }, { status: 404 }),
      ),
    );
    await expect(getReceipt('nonexistent')).rejects.toThrow('Nicht gefunden');
  });
});

describe('uploadReceipt', () => {
  it('erstellt Receipt-Datensatz mit Datei-Metadaten', async () => {
    const file = new File(['content'], 'test.pdf', { type: 'application/pdf' });
    const result = await uploadReceipt('cust-001', file);
    expect(result.id).toBeTruthy();
    expect(result.status).toBe('received');
  });

  it('wirft bei Customer-nicht-gefunden (404)', async () => {
    server.use(
      http.post(`${BASE}/receipts`, () =>
        HttpResponse.json({ ok: false, error: { code: 'CUSTOMER_NOT_FOUND', message: 'Kunde nicht gefunden' } }, { status: 404 }),
      ),
    );
    const file = new File([''], 'test.pdf', { type: 'application/pdf' });
    await expect(uploadReceipt('unknown', file)).rejects.toThrow('Kunde nicht gefunden');
  });
});

describe('updateReceiptStatus', () => {
  it('aktualisiert Status', async () => {
    const result = await updateReceiptStatus('r-001', 'done');
    expect(result).toBeTruthy();
  });

  it('wirft bei 5xx', async () => {
    server.use(
      http.put(`${BASE}/receipts/:id/status`, () =>
        HttpResponse.json({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'Server-Fehler' } }, { status: 500 }),
      ),
    );
    await expect(updateReceiptStatus('r-001', 'error')).rejects.toThrow('Server-Fehler');
  });
});

describe('reprocessReceipt', () => {
  it('startet Re-Processing und gibt Receipt zurück', async () => {
    const result = await reprocessReceipt('r-001');
    expect(result).toBeTruthy();
  });

  it('wirft bei 404 wenn Receipt nicht existiert', async () => {
    server.use(
      http.post(`${BASE}/receipts/:id/reprocess`, () =>
        HttpResponse.json({ ok: false, error: { code: 'NOT_FOUND', message: 'Nicht gefunden' } }, { status: 404 }),
      ),
    );
    await expect(reprocessReceipt('nonexistent')).rejects.toThrow('Nicht gefunden');
  });
});

describe('downloadReceipt', () => {
  it('gibt Blob zurück', async () => {
    server.use(
      http.get(`${BASE}/receipts/:id/download`, () =>
        new HttpResponse(new Blob(['PDF-Content']), {
          headers: { 'Content-Type': 'application/pdf' },
        }),
      ),
    );
    const blob = await downloadReceipt('r-001');
    // Realm-Mismatch: jsdom-Blob ≠ Node-global Blob → semantischer statt instanceof-Check
    expect(blob.size).toBeGreaterThan(0);
    expect(blob.type).toBe('application/pdf');
  });

  it('wirft bei 404 (kein Storage-Key)', async () => {
    server.use(
      http.get(`${BASE}/receipts/:id/download`, () =>
        HttpResponse.json({ ok: false, error: { code: 'NO_FILE', message: 'Keine Datei vorhanden' } }, { status: 404 }),
      ),
    );
    await expect(downloadReceipt('r-001')).rejects.toThrow('Keine Datei vorhanden');
  });
});

describe('getReceiptStats', () => {
  it('gibt Stats-Objekt zurück', async () => {
    const stats = await getReceiptStats();
    expect(stats.total).toBeDefined();
    expect(stats.by_status).toBeDefined();
  });

  it('wirft bei 5xx', async () => {
    server.use(
      http.get(`${BASE}/receipts/stats`, () =>
        HttpResponse.json({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'Fehler' } }, { status: 500 }),
      ),
    );
    await expect(getReceiptStats()).rejects.toThrow();
  });
});

describe('mapReceipt', () => {
  it('mappt extraction aus metadata', () => {
    const raw = {
      id: 'r-001',
      customer_id: 'c-001',
      status: 'extracted',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
      metadata: {
        extraction: {
          confidence: 0.92,
          raw_text: 'Muster GmbH',
          fields: {
            supplier_name: 'Muster GmbH',
            total_gross: 119.0,
            document_date: '2024-01-15',
          },
        },
      },
    };
    const result = mapReceipt(raw as Parameters<typeof mapReceipt>[0]);
    expect(result.extracted_data?.vendor_name).toBe('Muster GmbH');
    expect(result.extracted_data?.total_amount).toBe(119.0);
    expect(result.extracted_data?.confidence).toBe(0.92);
  });

  it('gibt leere file_name wenn kein Name vorhanden', () => {
    const raw = {
      id: 'r-002',
      customer_id: 'c-001',
      status: 'pending',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    };
    const result = mapReceipt(raw as Parameters<typeof mapReceipt>[0]);
    expect(result.file_name).toBe('unbenannt');
  });
});
