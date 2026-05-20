/**
 * Tests für src/api/_client.ts
 *
 * Testet den HTTP-Client direkt ohne API-Layer-Abstraktion.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../tests/msw/server';
import {
  apiRequest,
  apiBlob,
  unwrap,
  getActiveTenantId,
  setActiveTenantId,
  ApiError,
} from './_client';

describe('setActiveTenantId / getActiveTenantId', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('setzt und liest Tenant-ID', () => {
    setActiveTenantId('tenant-abc');
    expect(getActiveTenantId()).toBe('tenant-abc');
  });

  it('gibt null zurück wenn kein Tenant gesetzt', () => {
    expect(getActiveTenantId()).toBeNull();
  });
});

describe('ApiError', () => {
  it('erstellt Fehler mit Status und Code', () => {
    const err = new ApiError(404, 'Nicht gefunden', 'NOT_FOUND');
    expect(err.status).toBe(404);
    expect(err.message).toBe('Nicht gefunden');
    expect(err.code).toBe('NOT_FOUND');
    expect(err.name).toBe('ApiError');
  });
});

describe('unwrap', () => {
  it('entpackt { data: ... } Wrapper', () => {
    expect(unwrap({ data: [1, 2, 3] })).toEqual([1, 2, 3]);
  });

  it('gibt Wert direkt zurück wenn kein data-Wrapper', () => {
    expect(unwrap([1, 2, 3])).toEqual([1, 2, 3]);
  });

  it('funktioniert mit null', () => {
    expect(unwrap(null)).toBeNull();
  });

  it('funktioniert mit string', () => {
    expect(unwrap('raw')).toBe('raw');
  });
});

describe('apiRequest', () => {
  it('macht GET-Request', async () => {
    server.use(
      http.get('/api/v1/test', () => HttpResponse.json({ ok: true, data: 'result' })),
    );
    const result = await apiRequest<{ ok: boolean; data: string }>('/test');
    expect(result.data).toBe('result');
  });

  it('macht POST-Request mit JSON-Body', async () => {
    server.use(
      http.post('/api/v1/test', async ({ request }) => {
        const body = await request.json() as { name: string };
        expect(body.name).toBe('Test');
        return HttpResponse.json({ ok: true, data: { created: true } }, { status: 201 });
      }),
    );
    const result = await apiRequest<{ ok: boolean; data: { created: boolean } }>('/test', {
      method: 'POST',
      body: { name: 'Test' },
    });
    expect(result.data.created).toBe(true);
  });

  it('setzt Tenant-Header automatisch', async () => {
    localStorage.setItem('pp_tenant_id', 'auto-tenant');
    server.use(
      http.get('/api/v1/test', ({ request }) => {
        expect(request.headers.get('x-pp-tenant-id')).toBe('auto-tenant');
        return HttpResponse.json({ ok: true });
      }),
    );
    await apiRequest('/test');
  });

  it('überschreibt Tenant-Header mit explicit tenantId', async () => {
    localStorage.setItem('pp_tenant_id', 'default-tenant');
    server.use(
      http.get('/api/v1/test', ({ request }) => {
        expect(request.headers.get('x-pp-tenant-id')).toBe('explicit-tenant');
        return HttpResponse.json({ ok: true });
      }),
    );
    await apiRequest('/test', { tenantId: 'explicit-tenant' });
  });

  it('wirft ApiError bei 4xx', async () => {
    server.use(
      http.get('/api/v1/test', () =>
        HttpResponse.json({ ok: false, error: { code: 'FORBIDDEN', message: 'Kein Zugriff' } }, { status: 403 }),
      ),
    );
    await expect(apiRequest('/test')).rejects.toThrow('Kein Zugriff');
  });

  it('gibt undefined bei 204 zurück', async () => {
    server.use(
      http.delete('/api/v1/test', () => new HttpResponse(null, { status: 204 })),
    );
    const result = await apiRequest('/test', { method: 'DELETE' });
    expect(result).toBeUndefined();
  });

  it('gibt undefined bei 404 zurück wenn optional=true', async () => {
    server.use(
      http.get('/api/v1/optional', () =>
        HttpResponse.json({ ok: false, error: { message: 'Nicht gefunden' } }, { status: 404 }),
      ),
    );
    const result = await apiRequest('/optional', { optional: true });
    expect(result).toBeUndefined();
  });
});

describe('apiBlob', () => {
  it('gibt Blob zurück', async () => {
    server.use(
      http.get('/api/v1/file', () =>
        new HttpResponse(new Blob(['content']), { headers: { 'Content-Type': 'application/pdf' } }),
      ),
    );
    const blob = await apiBlob('/file');
    expect(blob.size).toBeGreaterThan(0);
    expect(blob.type).toBe('application/pdf');
  });

  it('wirft bei Fehler', async () => {
    server.use(
      http.get('/api/v1/file', () =>
        HttpResponse.json({ ok: false, error: { message: 'Nicht gefunden' } }, { status: 404 }),
      ),
    );
    await expect(apiBlob('/file')).rejects.toThrow();
  });
});
