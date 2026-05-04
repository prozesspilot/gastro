/**
 * Tests für src/api/tenants.ts
 */

import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../tests/msw/server';
import { getTenants, createTenant } from './tenants';

const BASE = '/api/v1';

describe('getTenants', () => {
  it('gibt Tenant-Liste zurück', async () => {
    const result = await getTenants();
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Demo-Tenant');
  });

  it('wirft bei 5xx', async () => {
    server.use(
      http.get(`${BASE}/tenants`, () =>
        HttpResponse.json({ ok: false, error: { message: 'Fehler' } }, { status: 500 }),
      ),
    );
    await expect(getTenants()).rejects.toThrow();
  });

  it('gibt leere Liste zurück wenn keine Tenants', async () => {
    server.use(
      http.get(`${BASE}/tenants`, () =>
        // apiOkPaged: data ist das Array direkt
        HttpResponse.json({ ok: true, data: [], pagination: { total: 0 } }),
      ),
    );
    const result = await getTenants();
    expect(result).toEqual([]);
  });
});

describe('createTenant', () => {
  it('erstellt neuen Tenant', async () => {
    const result = await createTenant({ slug: 'neu', name: 'Neuer Tenant' });
    expect(result.id).toBeTruthy();
    expect(result.name).toBe('Neuer Tenant');
  });

  it('wirft bei Konflikt (409)', async () => {
    server.use(
      http.post(`${BASE}/tenants`, () =>
        HttpResponse.json({ ok: false, error: { message: 'Slug vergeben' } }, { status: 409 }),
      ),
    );
    await expect(createTenant({ slug: 'doppelt', name: 'Doppelt' })).rejects.toThrow('Slug vergeben');
  });
});
