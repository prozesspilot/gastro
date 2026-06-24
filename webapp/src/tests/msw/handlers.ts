/**
 * MSW Default-Handler — nur die lebenden Endpoints (A3-Reboot T059).
 * Geister-Welt (receipts/customers/communications/advisor/plugins/stats) entfernt.
 * Test-spezifische Overrides per `server.use(...)`.
 */

import { http, HttpResponse } from 'msw';

const BASE = '/api/v1';

// ── Tenants (T058: GET /tenants, Staff-Cross-Tenant) ───────────────────────
export const tenantHandlers = [
  http.get(`${BASE}/tenants`, () =>
    HttpResponse.json({
      ok: true,
      data: [
        {
          id: 'tenant-001',
          slug: 'demo',
          display_name: 'Demo-Tenant',
          package: 'standard',
          deletion_status: 'active',
          onboarding_status: 'activated',
        },
      ],
    }),
  ),
];

// ── Categories ─────────────────────────────────────────────────────────────
export const categoryHandlers = [
  http.get(`${BASE}/categories`, () =>
    HttpResponse.json({
      ok: true,
      data: [
        {
          id: 'wareneinkauf_food',
          name: 'Wareneinkauf Lebensmittel',
          skr03_konto: '3100',
          skr04_konto: '5100',
          is_system: true,
        },
      ],
    }),
  ),
];

// ── Health ─────────────────────────────────────────────────────────────────
export const healthHandlers = [
  http.get('/api/v1/health', () => HttpResponse.json({ ok: true, version: '0.1.0', uptime: 999 })),
  http.get('/api/v1/ready', () =>
    HttpResponse.json({ ok: true, db: { connected: true }, redis: { connected: true } }),
  ),
];

// ── Belege (M01) ───────────────────────────────────────────────────────────
export const MOCK_BELEG = {
  id: 'b-001',
  status: 'received' as const,
  source_channel: 'manual_upload' as const,
  received_at: '2026-05-18T10:00:00Z',
  file_object_key: 'tenant-001/2026/05/b-001.jpg',
  file_mime_type: 'image/jpeg',
  file_size_bytes: 204800,
  supplier_name: 'Lieferant GmbH',
  document_date: '2026-05-17',
  total_gross: 119.0,
  currency: 'EUR',
  category: 'wareneinkauf_food',
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
      belege: [],
      pagination: { page: 1, page_size: 50, total: 0, total_pages: 0 },
    }),
  ),
  http.get(`${BASE}/belege/:id`, ({ params }) =>
    HttpResponse.json({
      beleg: { ...MOCK_BELEG, id: String(params['id']) },
      download_url: 'http://localhost/test-preview.jpg',
      download_expires_at: '2026-05-18T11:00:00Z',
    }),
  ),
];

// ── Auth (M14) — Default: nicht eingeloggt ─────────────────────────────────
export const authHandlers = [
  http.post(`${BASE}/auth/refresh`, () =>
    HttpResponse.json(
      { ok: false, error: { code: 'NO_REFRESH_TOKEN', message: 'kein Cookie' } },
      { status: 401 },
    ),
  ),
  http.post(`${BASE}/auth/logout`, () => HttpResponse.json({ ok: true, data: { logged_out: true } })),
  http.get(`${BASE}/auth/session`, () =>
    HttpResponse.json({ error: 'no_session', message: 'Nicht eingeloggt' }, { status: 401 }),
  ),
];

export const handlers = [
  ...authHandlers,
  ...tenantHandlers,
  ...categoryHandlers,
  ...healthHandlers,
  ...belegeHandlers,
];
