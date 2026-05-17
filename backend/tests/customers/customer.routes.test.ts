/**
 * D5 — Integration-Tests Customer-API
 *
 * Nutzt Fastify's inject() — kein echter HTTP-Server nötig.
 * ERFORDERT laufende Postgres-Instanz (docker compose up -d).
 *
 * Testdatenbank: prozesspilot (aus .env / DATABASE_URL)
 * Tenant: wird vor jedem Test frisch angelegt und danach bereinigt.
 */

import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app';

// Skip all DB integration tests when no Postgres is available (set PP_E2E=1 to run)
const E2E = process.env.PP_E2E === '1';

// ── Test-Setup ──────────────────────────────────────────────────────────────

let app: FastifyInstance;
let tenantId: string;

beforeAll(async () => {
  if (!E2E) return;
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  if (!E2E) return;
  await app.close();
});

beforeEach(async () => {
  if (!E2E) return;
  // Frischen Test-Mandanten anlegen
  const { rows } = await app.db.query<{ id: string }>(
    'INSERT INTO tenants (slug, name) VALUES ($1, $2) RETURNING id',
    [`test-tenant-${Date.now()}`, 'Test-Mandant'],
  );
  tenantId = rows[0].id;
});

afterEach(async () => {
  if (!E2E) return;
  // Testdaten bereinigen (kaskadiert auf customers)
  await app.db.query('DELETE FROM tenants WHERE id = $1', [tenantId]);
});

// ── Hilfsfunktion ───────────────────────────────────────────────────────────

function headers() {
  return { 'content-type': 'application/json', 'x-pp-tenant-id': tenantId };
}

async function createTestCustomer(overrides: Record<string, unknown> = {}) {
  return app.inject({
    method: 'POST',
    url: '/api/v1/customers',
    headers: headers(),
    payload: { name: 'Max Mustermann', email: 'max@example.com', ...overrides },
  });
}

// ── POST /api/v1/customers ──────────────────────────────────────────────────

describe.skipIf(!E2E)('POST /api/v1/customers', () => {
  it('legt einen neuen Kunden an und gibt 201 zurück', async () => {
    const res = await createTestCustomer();
    const body = res.json();

    expect(res.statusCode).toBe(201);
    expect(body.ok).toBe(true);
    expect(body.data.name).toBe('Max Mustermann');
    expect(body.data.email).toBe('max@example.com');
    expect(body.data.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(body.data.tenant_id).toBe(tenantId);
    expect(body.data.active).toBe(true);
  });

  it('legt Kunden ohne optionale Felder an', async () => {
    const res = await createTestCustomer({ email: undefined });
    const body = res.json();

    expect(res.statusCode).toBe(201);
    expect(body.data.email).toBeNull();
    expect(body.data.tax_number).toBeNull();
  });

  it('gibt 422 bei fehlenden Pflichtfeldern zurück', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/customers',
      headers: headers(),
      payload: {},
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().ok).toBe(false);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('gibt 422 bei ungültiger E-Mail zurück', async () => {
    const res = await createTestCustomer({ email: 'keine-email' });
    expect(res.statusCode).toBe(422);
  });

  it('gibt 400 bei fehlendem x-pp-tenant-id Header zurück', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/customers',
      headers: { 'content-type': 'application/json' },
      payload: { name: 'Test' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('MISSING_TENANT');
  });

  it('gibt 409 bei doppelter external_id zurück', async () => {
    await createTestCustomer({ external_id: 'DATEV-001' });
    const res = await createTestCustomer({ external_id: 'DATEV-001' });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('DUPLICATE_EXTERNAL_ID');
  });
});

// ── GET /api/v1/customers ───────────────────────────────────────────────────

describe.skipIf(!E2E)('GET /api/v1/customers', () => {
  beforeEach(async () => {
    if (!E2E) return;
    await createTestCustomer({ name: 'Kunde A' });
    await createTestCustomer({ name: 'Kunde B', external_id: 'EXT-B' });
  });

  it('gibt paginierte Liste zurück', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/customers', headers: headers() });
    const body = res.json();

    expect(res.statusCode).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.length).toBeGreaterThanOrEqual(2);
    expect(body.pagination).toMatchObject({ page: 1, limit: 20 });
  });

  it('filtert nach external_id', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/customers?external_id=EXT-B',
      headers: headers(),
    });
    const body = res.json();

    expect(res.statusCode).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].external_id).toBe('EXT-B');
  });

  it('respektiert page und limit', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/customers?page=1&limit=1',
      headers: headers(),
    });
    const body = res.json();

    expect(body.data).toHaveLength(1);
    expect(body.pagination.limit).toBe(1);
  });
});

// ── GET /api/v1/customers/:id ───────────────────────────────────────────────

describe.skipIf(!E2E)('GET /api/v1/customers/:id', () => {
  it('gibt den Kunden zurück wenn gefunden', async () => {
    const created = (await createTestCustomer()).json();
    const id = created.data.id;

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/customers/${id}`,
      headers: headers(),
    });
    const body = res.json();

    expect(res.statusCode).toBe(200);
    expect(body.data.id).toBe(id);
    expect(body.data.name).toBe('Max Mustermann');
  });

  it('gibt 404 zurück wenn Kunde nicht existiert', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/customers/00000000-0000-0000-0000-000000000000',
      headers: headers(),
    });
    expect(res.statusCode).toBe(404);
  });
});

// ── PATCH /api/v1/customers/:id ─────────────────────────────────────────────

describe.skipIf(!E2E)('PATCH /api/v1/customers/:id', () => {
  it('aktualisiert den Namen', async () => {
    const created = (await createTestCustomer()).json();
    const id = created.data.id;

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/customers/${id}`,
      headers: headers(),
      payload: { name: 'Neuer Name' },
    });
    const body = res.json();

    expect(res.statusCode).toBe(200);
    expect(body.data.name).toBe('Neuer Name');
    expect(body.data.email).toBe('max@example.com'); // unverändert
  });

  it('gibt 422 bei leerem Update-Objekt zurück', async () => {
    const created = (await createTestCustomer()).json();
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/customers/${created.data.id}`,
      headers: headers(),
      payload: {},
    });
    expect(res.statusCode).toBe(422);
  });

  it('gibt 404 zurück wenn Kunde nicht existiert', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/customers/00000000-0000-0000-0000-000000000000',
      headers: headers(),
      payload: { name: 'Test' },
    });
    expect(res.statusCode).toBe(404);
  });
});

// ── DELETE /api/v1/customers/:id ────────────────────────────────────────────

describe.skipIf(!E2E)('DELETE /api/v1/customers/:id', () => {
  it('deaktiviert den Kunden (soft delete) und gibt 204 zurück', async () => {
    const created = (await createTestCustomer()).json();
    const id = created.data.id;

    const del = await app.inject({
      method: 'DELETE',
      url: `/api/v1/customers/${id}`,
      headers: headers(),
    });
    expect(del.statusCode).toBe(204);

    // Kunde ist danach nicht mehr abrufbar (active = false)
    const get = await app.inject({
      method: 'GET',
      url: `/api/v1/customers/${id}`,
      headers: headers(),
    });
    expect(get.statusCode).toBe(404);
  });

  it('gibt 404 zurück wenn Kunde nicht existiert', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/v1/customers/00000000-0000-0000-0000-000000000000',
      headers: headers(),
    });
    expect(res.statusCode).toBe(404);
  });
});
