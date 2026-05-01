/**
 * D8 — Integration-Tests Document-Routes
 *
 * Storage-Service wird gemockt — kein MinIO nötig.
 * Postgres wird wie bei Customer-Tests genutzt (docker compose up -d).
 */

import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Storage-Service mocken ────────────────────────────────────────────────────

vi.mock('../../src/core/storage/storage.service', () => ({
  createS3Client:          vi.fn(() => ({})),
  uploadObject:            vi.fn().mockResolvedValue({
    key:          'tenant/2024-01/test.pdf',
    bucket:       'prozesspilot-raw',
    size_bytes:   100,
    content_type: 'application/pdf',
  }),
  getPresignedDownloadUrl: vi.fn().mockResolvedValue('https://minio.local/presigned-url'),
  deleteObject:            vi.fn().mockResolvedValue(true),
}));

import { buildApp } from '../../src/app';

// ── Test-Setup ────────────────────────────────────────────────────────────────

let app: FastifyInstance;
let tenantId: string;

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});

afterAll(async () => { await app.close(); });

beforeEach(async () => {
  const { rows } = await app.db.query<{ id: string }>(
    `INSERT INTO tenants (slug, name) VALUES ($1, $2) RETURNING id`,
    [`test-doc-tenant-${Date.now()}`, 'Doc-Test-Mandant'],
  );
  tenantId = rows[0].id;
});

afterEach(async () => {
  await app.db.query(`DELETE FROM tenants WHERE id = $1`, [tenantId]);
  vi.clearAllMocks();
});

// ── Hilfsfunktionen ───────────────────────────────────────────────────────────

function headers(contentType = 'application/pdf', filename = 'test.pdf') {
  return {
    'content-type':       contentType,
    'x-pp-tenant-id':     tenantId,
    'x-original-filename': filename,
  };
}

// ── POST /api/v1/documents/upload ─────────────────────────────────────────────

describe('POST /api/v1/documents/upload', () => {
  it('lädt PDF hoch und gibt 201 zurück', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/documents/upload',
      headers: headers(),
      payload: Buffer.from('%PDF-1.4 test'),
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.data.content_type).toBe('application/pdf');
    expect(body.data.status).toBe('pending');
    expect(body.data.tenant_id).toBe(tenantId);
  });

  it('gibt 415 bei nicht erlaubtem Content-Type zurück', async () => {
    // text/xml ist nicht im Content-Type-Parser registriert →
    // Fastify lehnt den Request selbst mit 415 ab (kein custom error.code)
    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/documents/upload',
      headers: { ...headers('text/xml'), 'content-type': 'text/xml' },
      payload: Buffer.from('<xml/>'),
    });

    expect(res.statusCode).toBe(415);
  });

  it('gibt 422 bei leerem Body zurück', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/documents/upload',
      headers: headers(),
      payload: Buffer.alloc(0),
    });

    expect(res.statusCode).toBe(422);
  });

  it('gibt 400 bei fehlendem x-pp-tenant-id zurück', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/documents/upload',
      headers: { 'content-type': 'application/pdf' },
      payload: Buffer.from('%PDF'),
    });

    expect(res.statusCode).toBe(400);
  });
});

// ── GET /api/v1/documents ─────────────────────────────────────────────────────

describe('GET /api/v1/documents', () => {
  beforeEach(async () => {
    // Zwei Dokumente vorab hochladen
    for (const name of ['doc-a.pdf', 'doc-b.pdf']) {
      await app.inject({
        method:  'POST',
        url:     '/api/v1/documents/upload',
        headers: headers('application/pdf', name),
        payload: Buffer.from('%PDF'),
      });
    }
  });

  it('gibt paginierte Liste zurück', async () => {
    const res = await app.inject({
      method:  'GET',
      url:     '/api/v1/documents',
      headers: { 'x-pp-tenant-id': tenantId },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.length).toBeGreaterThanOrEqual(2);
    expect(body.pagination.page).toBe(1);
  });
});

// ── GET /api/v1/documents/:id ─────────────────────────────────────────────────

describe('GET /api/v1/documents/:id', () => {
  it('gibt Dokument zurück wenn vorhanden', async () => {
    const upload = await app.inject({
      method:  'POST',
      url:     '/api/v1/documents/upload',
      headers: headers(),
      payload: Buffer.from('%PDF'),
    });
    const id = upload.json().data.id as string;

    const res = await app.inject({
      method:  'GET',
      url:     `/api/v1/documents/${id}`,
      headers: { 'x-pp-tenant-id': tenantId },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.id).toBe(id);
  });

  it('gibt 404 zurück wenn nicht vorhanden', async () => {
    const res = await app.inject({
      method:  'GET',
      url:     '/api/v1/documents/00000000-0000-0000-0000-000000000000',
      headers: { 'x-pp-tenant-id': tenantId },
    });

    expect(res.statusCode).toBe(404);
  });
});

// ── GET /api/v1/documents/:id/download-url ────────────────────────────────────

describe('GET /api/v1/documents/:id/download-url', () => {
  it('gibt presigned URL zurück', async () => {
    const upload = await app.inject({
      method:  'POST',
      url:     '/api/v1/documents/upload',
      headers: headers(),
      payload: Buffer.from('%PDF'),
    });
    const id = upload.json().data.id as string;

    const res = await app.inject({
      method:  'GET',
      url:     `/api/v1/documents/${id}/download-url`,
      headers: { 'x-pp-tenant-id': tenantId },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.url).toContain('presigned');
    expect(res.json().data.expires_in).toBe(3600);
  });
});
