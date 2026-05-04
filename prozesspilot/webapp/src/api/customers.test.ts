/**
 * Tests für src/api/customers.ts
 */

import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../tests/msw/server';
import {
  getCustomers,
  getCustomer,
  createCustomer,
  deleteCustomer,
  getCustomerProfile,
  updateCustomerProfile,
  getCustomerProfileHistory,
} from './customers';

const BASE = '/api/v1';

describe('getCustomers', () => {
  it('gibt Kunden-Liste zurück', async () => {
    const result = await getCustomers('tenant-001');
    expect(result).toHaveLength(1);
    expect(result[0].display_name).toBe('Test GmbH');
  });

  it('mappt name-Feld wenn kein display_name vorhanden', async () => {
    server.use(
      http.get(`${BASE}/customers`, () =>
        HttpResponse.json({
          ok: true,
          data: [{ id: 'c-1', tenant_id: 't-1', name: 'Nur Name GmbH', created_at: '2024-01-01T00:00:00Z' }],
          pagination: { total: 1 },
        }),
      ),
    );
    const result = await getCustomers('t-1');
    expect(result[0].display_name).toBe('Nur Name GmbH');
  });

  it('wirft bei 5xx', async () => {
    server.use(
      http.get(`${BASE}/customers`, () =>
        HttpResponse.json({ ok: false, error: { message: 'Fehler' } }, { status: 500 }),
      ),
    );
    await expect(getCustomers('t-1')).rejects.toThrow();
  });

  it('gibt leere Liste zurück wenn Backend 0 Kunden liefert', async () => {
    server.use(
      http.get(`${BASE}/customers`, () =>
        HttpResponse.json({ ok: true, data: [], pagination: { total: 0 } }),
      ),
    );
    const result = await getCustomers('t-1');
    expect(result).toEqual([]);
  });
});

describe('getCustomer', () => {
  it('lädt einzelnen Kunden per ID', async () => {
    const result = await getCustomer('tenant-001', 'cust-001');
    expect(result.id).toBe('cust-001');
  });

  it('wirft ApiError bei 404', async () => {
    server.use(
      http.get(`${BASE}/customers/:id`, () =>
        HttpResponse.json({ ok: false, error: { message: 'Nicht gefunden' } }, { status: 404 }),
      ),
    );
    await expect(getCustomer('t-1', 'nonexistent')).rejects.toThrow('Nicht gefunden');
  });
});

describe('createCustomer', () => {
  it('erstellt neuen Kunden', async () => {
    const result = await createCustomer('tenant-001', { name: 'Neuer Kunde' });
    expect(result.id).toBeTruthy();
  });

  it('wirft bei doppeltem Kunden (409)', async () => {
    server.use(
      http.post(`${BASE}/customers`, () =>
        HttpResponse.json({ ok: false, error: { code: 'DUPLICATE_EXTERNAL_ID', message: 'Bereits vorhanden' } }, { status: 409 }),
      ),
    );
    await expect(createCustomer('t-1', { name: 'Doppelt' })).rejects.toThrow('Bereits vorhanden');
  });
});

describe('deleteCustomer', () => {
  it('löscht Kunden ohne Rückgabe', async () => {
    server.use(
      http.delete(`${BASE}/customers/:id`, () => new HttpResponse(null, { status: 204 })),
    );
    await expect(deleteCustomer('t-1', 'c-1')).resolves.toBeUndefined();
  });
});

describe('getCustomerProfile', () => {
  it('lädt Profil und gibt Default-Module zurück wenn keine gesetzt', async () => {
    const result = await getCustomerProfile('cust-001', 'tenant-001');
    expect(result.id).toBeTruthy();
    expect(result.enabled_modules).toBeDefined();
  });

  it('gibt leeres Profil zurück wenn 404 und optional=true', async () => {
    server.use(
      http.get(`${BASE}/customers/:id/profile`, () =>
        new HttpResponse(null, { status: 404 }),
      ),
    );
    const result = await getCustomerProfile('nonexistent');
    // Soll Fallback-Profil zurückgeben, nicht werfen
    expect(result).toBeDefined();
    expect(result.enabled_modules).toBeDefined();
  });

  it('mappt enabled_modules aus Array-Format (Legacy)', async () => {
    server.use(
      http.get(`${BASE}/customers/:id/profile`, () =>
        HttpResponse.json({
          ok: true,
          data: {
            id: 'cust-001',
            enabled_modules: ['M01', 'M02', 'M03'],
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
          },
        }),
      ),
    );
    const result = await getCustomerProfile('cust-001');
    expect(result.enabled_modules.m01_ingestion).toBe(true);
    expect(result.enabled_modules.m02_archiving).toBe(true);
    expect(result.enabled_modules.m03_extraction).toBe(true);
    expect(result.enabled_modules.m04_categorization).toBe(false);
  });
});

describe('updateCustomerProfile', () => {
  it('aktualisiert Profil', async () => {
    server.use(
      http.put(`${BASE}/customers/:id/profile`, () =>
        HttpResponse.json({
          ok: true,
          data: { id: 'cust-001', display_name: 'Geändert', created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-02T00:00:00Z' },
        }),
      ),
    );
    const result = await updateCustomerProfile('cust-001', { display_name: 'Geändert' });
    expect(result.display_name).toBe('Geändert');
  });
});

describe('getCustomerProfileHistory', () => {
  it('gibt History-Einträge zurück', async () => {
    server.use(
      http.get(`${BASE}/customers/:id/profile/history`, () =>
        HttpResponse.json({
          ok: true,
          data: {
            entries: [
              {
                history_id: 'h-001',
                profile_version: 1,
                snapshot: {},
                changed_by: null,
                changed_at: '2024-01-01T00:00:00Z',
                change_summary: 'Initial',
              },
            ],
          },
        }),
      ),
    );
    const result = await getCustomerProfileHistory('cust-001');
    expect(result).toHaveLength(1);
    expect(result[0].history_id).toBe('h-001');
  });

  it('gibt leere Liste zurück wenn keine History', async () => {
    server.use(
      http.get(`${BASE}/customers/:id/profile/history`, () =>
        HttpResponse.json({ ok: true, data: { entries: [] } }),
      ),
    );
    const result = await getCustomerProfileHistory('cust-001');
    expect(result).toEqual([]);
  });
});
