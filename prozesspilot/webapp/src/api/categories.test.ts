/**
 * Tests für src/api/categories.ts
 */

import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../tests/msw/server';
import { getCategories } from './categories';

const BASE = '/api/v1';

describe('getCategories', () => {
  it('gibt Kategorien-Liste zurück', async () => {
    const result = await getCategories();
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].id).toBeTruthy();
    expect(result[0].name).toBeTruthy();
  });

  it('gibt Fallback-Kategorien wenn Backend 404 liefert (optional)', async () => {
    server.use(
      http.get(`${BASE}/categories`, () =>
        new HttpResponse(null, { status: 404 }),
      ),
    );
    const result = await getCategories();
    // optional: soll Fallback zurückgeben
    expect(result.length).toBeGreaterThan(0);
    expect(result.some((c) => c.id === 'wareneinkauf_food')).toBe(true);
  });

  it('gibt Fallback-Kategorien wenn Backend leere Liste liefert', async () => {
    server.use(
      http.get(`${BASE}/categories`, () =>
        HttpResponse.json({ ok: true, data: [] }),
      ),
    );
    const result = await getCategories();
    // Leere Liste → Fallback
    expect(result.length).toBeGreaterThan(0);
  });

  it('gibt Backend-Kategorien zurück wenn vorhanden', async () => {
    server.use(
      http.get(`${BASE}/categories`, () =>
        HttpResponse.json({
          ok: true,
          data: [
            { id: 'custom_cat', name: 'Custom Kategorie', skr03_konto: '9999', skr04_konto: '9998', is_system: false },
          ],
        }),
      ),
    );
    const result = await getCategories();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('custom_cat');
  });

  it('akzeptiert tenantId-Parameter', async () => {
    server.use(
      http.get(`${BASE}/categories`, ({ request }) => {
        // Tenant-Header sollte gesetzt sein
        const tenantHeader = request.headers.get('x-pp-tenant-id');
        expect(tenantHeader).toBe('tenant-001');
        return HttpResponse.json({ ok: true, data: [] });
      }),
    );
    // Gibt Fallback zurück wegen leerer Liste
    await getCategories('tenant-001');
  });
});
