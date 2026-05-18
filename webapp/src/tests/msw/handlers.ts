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

  http.post(`${BASE}/receipts/:id/file`, ({ params }) =>
    HttpResponse.json({
      ok: true,
      data: {
        id:              params['id'],
        tenant_id:       'tenant-001',
        customer_id:     'cust-001',
        status:          'received',
        original_name:   'test.pdf',
        mime_type:       'application/pdf',
        storage_key:     `tenant-001/${params['id']}/test.pdf`,
        file_size_bytes: 7,
        file_sha256:     'a1b2c3',
        source:          'manual',
        metadata:        {},
        error_message:   null,
        created_at:      '2024-01-01T00:00:00Z',
        updated_at:      '2024-01-01T00:00:01Z',
      },
    }),
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

// ── Communications ────────────────────────────────────────────────────────

export const communicationHandlers = [
  http.get(`${BASE}/communications`, () =>
    HttpResponse.json({ ok: true, data: [] }),
  ),
];

// ── Advisor ───────────────────────────────────────────────────────────────

export const advisorHandlers = [
  http.get(`${BASE}/advisor/overview`, () =>
    HttpResponse.json({ ok: true, data: [] }),
  ),

  http.get(`${BASE}/advisor/receipts/pending`, () =>
    HttpResponse.json({ ok: true, data: [] }),
  ),
];

// ── Plugins ───────────────────────────────────────────────────────────────

export const pluginHandlers = [
  http.get(`${BASE}/plugins`, () =>
    HttpResponse.json({ ok: true, data: { plugins: [] } }),
  ),
];

// ── Stats ─────────────────────────────────────────────────────────────────

export const statsHandlers = [
  http.get(`${BASE}/customers/:id/stats`, () =>
    HttpResponse.json({
      ok: true,
      data: {
        customer_id: 'cust-001',
        receipts_by_month: [],
        by_category: [],
        top_suppliers: [],
        export_rate: { lexoffice: 0, datev: 0 },
        processing_times: { avg_ms: null, p95_ms: null },
      },
    }),
  ),
];

// ── T014: Belege ──────────────────────────────────────────────────────────

/** Beispiel-Beleg für Test-Assertions */
export const MOCK_BELEG = {
  id:               'b-001',
  status:           'received' as const,
  source_channel:   'manual_upload' as const,
  received_at:      '2026-05-18T10:00:00Z',
  file_object_key:  'tenant-001/2026/05/b-001.jpg',
  file_mime_type:   'image/jpeg',
  file_size_bytes:  204800,
  supplier_name:    'Lieferant GmbH',
  document_date:    '2026-05-17',
  total_gross:      119.0,
  currency:         'EUR',
  category:         'wareneinkauf_food',
};

export const belegeHandlers = [
  http.post(`${BASE}/belege/upload`, () =>
    HttpResponse.json(
      { beleg_id: 'b-001', storage_key: 'tenant-001/2026/05/b-001.jpg', status: 'received' },
      { status: 201 },
    ),
  ),

  http.get(`${BASE}/belege`, () =>
    HttpResponse.json({
      belege:     [],
      pagination: { page: 1, page_size: 50, total: 0, total_pages: 0 },
    }),
  ),

  http.get(`${BASE}/belege/:id`, ({ params }) =>
    HttpResponse.json({
      beleg:               { ...MOCK_BELEG, id: String(params['id']) },
      download_url:        'http://localhost/test-preview.jpg',
      download_expires_at: '2026-05-18T11:00:00Z',
    }),
  ),
];

// ── M14: Auth ─────────────────────────────────────────────────────────────
// Default: /auth/refresh schlägt fehl (Cold-Start) → nicht eingeloggt.
// Tests, die einen eingeloggten User brauchen, überschreiben das per server.use().

export const authHandlers = [
  http.post(`${BASE}/auth/refresh`, () =>
    HttpResponse.json({ ok: false, error: { code: 'NO_REFRESH_TOKEN', message: 'kein Cookie' } }, { status: 401 }),
  ),
  http.post(`${BASE}/auth/logout`, () =>
    HttpResponse.json({ ok: true, data: { logged_out: true } }),
  ),
  // M14: Default → keine aktive Cookie-Session (Cold-Start)
  http.get(`${BASE}/auth/session`, () =>
    HttpResponse.json({ error: 'no_session', message: 'Nicht eingeloggt' }, { status: 401 }),
  ),
];

// ── Alle Handler zusammen ─────────────────────────────────────────────────

export const handlers = [
  ...authHandlers,
  ...receiptHandlers,
  ...customerHandlers,
  ...tenantHandlers,
  ...categoryHandlers,
  ...healthHandlers,
  ...communicationHandlers,
  ...advisorHandlers,
  ...pluginHandlers,
  ...statsHandlers,
  ...belegeHandlers,
];
