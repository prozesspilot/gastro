/**
 * MSW Default-Handler — Mock-Antworten für alle API-Calls
 *
 * Diese Handler decken den Glücksfall (Happy Path) ab.
 * Test-spezifische Overrides werden per `server.use(...)` gesetzt.
 */

import { http, HttpResponse } from 'msw';

const BASE = '/api/v1';

// ── Receipts ──────────────────────────────────────────────────────────────

export const receiptHandlers = [
  http.get(`${BASE}/receipts`, () =>
    HttpResponse.json({
      ok: true,
      data: {
        receipts: [],
        total: 0,
        limit: 20,
        offset: 0,
      },
    }),
  ),

  http.get(`${BASE}/receipts/stats`, () =>
    HttpResponse.json({
      ok: true,
      data: {
        total: 0,
        by_status: { pending: 0, processing: 0, done: 0, error: 0 },
        by_source: { manual: 0, whatsapp: 0, email: 0 },
        today_count: 0,
        this_week_count: 0,
      },
    }),
  ),

  http.get(`${BASE}/receipts/:id`, ({ params }) =>
    HttpResponse.json({
      ok: true,
      data: {
        id:            params['id'],
        tenant_id:     'tenant-001',
        customer_id:   'cust-001',
        status:        'done',
        original_name: 'test-beleg.pdf',
        mime_type:     'application/pdf',
        storage_key:   null,
        file_size_bytes: 1024,
        file_sha256:   null,
        source:        'manual',
        metadata:      {},
        error_message: null,
        created_at:    '2024-01-01T00:00:00Z',
        updated_at:    '2024-01-01T00:00:00Z',
      },
    }),
  ),

  http.post(`${BASE}/receipts`, () =>
    HttpResponse.json({
      ok: true,
      data: {
        id:            'new-receipt-001',
        tenant_id:     'tenant-001',
        customer_id:   'cust-001',
        status:        'received',
        original_name: 'test.pdf',
        mime_type:     'application/pdf',
        storage_key:   null,
        file_size_bytes: 0,
        file_sha256:   null,
        source:        'manual',
        metadata:      {},
        error_message: null,
        created_at:    '2024-01-01T00:00:00Z',
        updated_at:    '2024-01-01T00:00:00Z',
      },
    }, { status: 201 }),
  ),

  http.put(`${BASE}/receipts/:id/status`, ({ params }) =>
    HttpResponse.json({
      ok: true,
      data: {
        id:     params['id'],
        status: 'done',
        updated_at: '2024-01-01T01:00:00Z',
      },
    }),
  ),

  http.post(`${BASE}/receipts/:id/reprocess`, ({ params }) =>
    HttpResponse.json({
      ok: true,
      data: { id: params['id'], status: 'received', updated_at: '2024-01-01T01:00:00Z' },
    }),
  ),
];

// ── Customers ─────────────────────────────────────────────────────────────

export const customerHandlers = [
  http.get(`${BASE}/customers`, () =>
    HttpResponse.json({
      ok: true,
      data: [
        { id: 'cust-001', tenant_id: 'tenant-001', name: 'Test GmbH', display_name: 'Test GmbH', created_at: '2024-01-01T00:00:00Z' },
      ],
      pagination: { total: 1, page: 1, limit: 20, has_next: false },
    }),
  ),

  http.get(`${BASE}/customers/:id`, ({ params }) =>
    HttpResponse.json({
      ok: true,
      data: {
        id:           params['id'],
        tenant_id:    'tenant-001',
        name:         'Test GmbH',
        display_name: 'Test GmbH',
        created_at:   '2024-01-01T00:00:00Z',
      },
    }),
  ),

  http.post(`${BASE}/customers`, () =>
    HttpResponse.json({
      ok: true,
      data: { id: 'new-cust-001', tenant_id: 'tenant-001', name: 'Neuer Kunde', display_name: 'Neuer Kunde', created_at: '2024-01-01T00:00:00Z' },
    }, { status: 201 }),
  ),

  http.get(`${BASE}/customers/:id/profile`, ({ params }) =>
    HttpResponse.json({
      ok: true,
      data: {
        id:           params['id'],
        customer_id:  params['id'],
        display_name: 'Test GmbH',
        enabled_modules: {},
        created_at:   '2024-01-01T00:00:00Z',
        updated_at:   '2024-01-01T00:00:00Z',
      },
    }),
  ),
];

// ── Tenants ───────────────────────────────────────────────────────────────

export const tenantHandlers = [
  http.get(`${BASE}/tenants`, () =>
    HttpResponse.json({
      ok: true,
      // apiOkPaged: data ist das Array, pagination ist separat
      data: [
        { id: 'tenant-001', name: 'Demo-Tenant', slug: 'demo', created_at: '2024-01-01T00:00:00Z' },
      ],
      pagination: { total: 1, page: 1, limit: 50 },
    }),
  ),

  http.post(`${BASE}/tenants`, () =>
    HttpResponse.json({
      ok: true,
      data: { id: 'new-tenant-001', name: 'Neuer Tenant', slug: 'neu', created_at: '2024-01-01T00:00:00Z' },
    }, { status: 201 }),
  ),
];

// ── Categories ────────────────────────────────────────────────────────────

export const categoryHandlers = [
  http.get(`${BASE}/categories`, () =>
    HttpResponse.json({
      ok: true,
      data: [
        { id: 'wareneinkauf_food', name: 'Wareneinkauf Lebensmittel', skr03_konto: '3100', skr04_konto: '5100', is_system: true },
        { id: 'buerokosten',       name: 'Bürokosten',                skr03_konto: '4930', skr04_konto: '6815', is_system: true },
      ],
    }),
  ),
];

// ── Health ────────────────────────────────────────────────────────────────

export const healthHandlers = [
  http.get('/api/v1/health', () =>
    HttpResponse.json({ ok: true, version: '0.1.0', uptime: 999 }),
  ),

  http.get('/api/v1/ready', () =>
    HttpResponse.json({ ok: true, db: { connected: true }, redis: { connected: true } }),
  ),
];

// ── Alle Handler zusammen ─────────────────────────────────────────────────

export const handlers = [
  ...receiptHandlers,
  ...customerHandlers,
  ...tenantHandlers,
  ...categoryHandlers,
  ...healthHandlers,
];
