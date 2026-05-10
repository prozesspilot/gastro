/**
 * D4 — Unit-Tests für Zod-Schemas
 *
 * Prüft gültige und ungültige Eingaben für alle Kern-Schemas.
 * Kein laufender Server oder Infra-Service notwendig.
 */

import { describe, expect, it } from 'vitest';
import {
  apiError,
  apiOk,
  apiOkPaged,
  buildPaginationMeta,
  createCustomerSchema,
  createDocumentSchema,
  createRoutingJobSchema,
  createTenantSchema,
  listCustomersQuerySchema,
  paginationQuerySchema,
  slugSchema,
  updateCustomerSchema,
  updateTenantSchema,
  uuidSchema,
} from '../../src/core/schemas';

// ── common ─────────────────────────────────────────────────────────────────

describe('uuidSchema', () => {
  it('akzeptiert eine gültige UUID', () => {
    expect(uuidSchema.safeParse('123e4567-e89b-12d3-a456-426614174000').success).toBe(true);
  });
  it('lehnt einen ungültigen String ab', () => {
    expect(uuidSchema.safeParse('keine-uuid').success).toBe(false);
  });
});

describe('slugSchema', () => {
  it('akzeptiert gültige Slugs', () => {
    expect(slugSchema.safeParse('mustermann-gmbh').success).toBe(true);
    expect(slugSchema.safeParse('abc123').success).toBe(true);
  });
  it('lehnt Großbuchstaben ab', () => {
    expect(slugSchema.safeParse('Mustermann').success).toBe(false);
  });
  it('lehnt führende/abschließende Bindestriche ab', () => {
    expect(slugSchema.safeParse('-mustermann').success).toBe(false);
    expect(slugSchema.safeParse('mustermann-').success).toBe(false);
  });
  it('lehnt zu kurze Slugs ab', () => {
    expect(slugSchema.safeParse('a').success).toBe(false);
  });
});

describe('paginationQuerySchema', () => {
  it('setzt Standardwerte', () => {
    const result = paginationQuerySchema.parse({});
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
  });
  it('konvertiert Strings zu Zahlen', () => {
    const result = paginationQuerySchema.parse({ page: '2', limit: '50' });
    expect(result.page).toBe(2);
    expect(result.limit).toBe(50);
  });
  it('lehnt limit > 100 ab', () => {
    expect(paginationQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
  });
  it('lehnt page < 1 ab', () => {
    expect(paginationQuerySchema.safeParse({ page: 0 }).success).toBe(false);
  });
});

describe('buildPaginationMeta', () => {
  it('berechnet totalPages korrekt', () => {
    const meta = buildPaginationMeta(1, 20, 45);
    expect(meta.totalPages).toBe(3);
    expect(meta.total).toBe(45);
  });
});

describe('API-Response-Wrapper', () => {
  it('apiOk gibt ok:true und data zurück', () => {
    const res = apiOk({ id: '1' });
    expect(res.ok).toBe(true);
    expect(res.data).toEqual({ id: '1' });
  });
  it('apiOkPaged enthält pagination', () => {
    const res = apiOkPaged([1, 2], buildPaginationMeta(1, 20, 2));
    expect(res.ok).toBe(true);
    expect(res.data).toHaveLength(2);
    expect(res.pagination.total).toBe(2);
  });
  it('apiError gibt ok:false zurück', () => {
    const res = apiError('NOT_FOUND', 'Nicht gefunden');
    expect(res.ok).toBe(false);
    expect(res.error.code).toBe('NOT_FOUND');
  });
});

// ── tenant ─────────────────────────────────────────────────────────────────

describe('createTenantSchema', () => {
  it('akzeptiert gültige Eingaben', () => {
    const result = createTenantSchema.safeParse({
      slug: 'mustermann-gmbh',
      name: 'Mustermann GmbH',
    });
    expect(result.success).toBe(true);
  });
  it('lehnt fehlenden Slug ab', () => {
    expect(createTenantSchema.safeParse({ name: 'Test' }).success).toBe(false);
  });
  it('lehnt leeren Namen ab', () => {
    expect(createTenantSchema.safeParse({ slug: 'test', name: '' }).success).toBe(false);
  });
});

describe('updateTenantSchema', () => {
  it('akzeptiert Teilaktualisierungen', () => {
    expect(updateTenantSchema.safeParse({ name: 'Neuer Name' }).success).toBe(true);
    expect(updateTenantSchema.safeParse({ active: false }).success).toBe(true);
  });
  it('lehnt leeres Objekt ab', () => {
    expect(updateTenantSchema.safeParse({}).success).toBe(false);
  });
});

// ── customer ───────────────────────────────────────────────────────────────

describe('createCustomerSchema', () => {
  it('akzeptiert minimale Eingaben (nur name)', () => {
    const result = createCustomerSchema.safeParse({ name: 'Max Mustermann' });
    expect(result.success).toBe(true);
  });
  it('akzeptiert vollständige Eingaben', () => {
    const result = createCustomerSchema.safeParse({
      name: 'Max Mustermann',
      email: 'max@example.com',
      tax_number: 'DE123456789',
      external_id: 'DATEV-001',
    });
    expect(result.success).toBe(true);
  });
  it('lehnt ungültige E-Mail ab', () => {
    expect(createCustomerSchema.safeParse({ name: 'Test', email: 'keine-email' }).success).toBe(
      false,
    );
  });
  it('lehnt leeren Namen ab', () => {
    expect(createCustomerSchema.safeParse({ name: '' }).success).toBe(false);
  });
  it('lehnt zu langen Namen ab', () => {
    expect(createCustomerSchema.safeParse({ name: 'a'.repeat(201) }).success).toBe(false);
  });
});

describe('updateCustomerSchema', () => {
  it('akzeptiert einzelne Felder', () => {
    expect(updateCustomerSchema.safeParse({ name: 'Neuer Name' }).success).toBe(true);
    expect(updateCustomerSchema.safeParse({ active: false }).success).toBe(true);
  });
  it('lehnt leeres Objekt ab', () => {
    expect(updateCustomerSchema.safeParse({}).success).toBe(false);
  });
});

describe('listCustomersQuerySchema', () => {
  it('setzt Standardwerte', () => {
    const result = listCustomersQuerySchema.parse({});
    expect(result.page).toBe(1);
    expect(result.sort_by).toBe('created_at');
    expect(result.sort_order).toBe('desc');
  });
  it('erlaubt Filterung nach active', () => {
    const result = listCustomersQuerySchema.parse({ active: 'true' });
    expect(result.active).toBe(true);
  });
});

// ── document ───────────────────────────────────────────────────────────────

describe('createDocumentSchema', () => {
  const valid = {
    storage_key: 'tenants/abc/docs/invoice.pdf',
    original_name: 'Rechnung_2024.pdf',
    content_type: 'application/pdf',
    size_bytes: 102400,
  };

  it('akzeptiert gültige Dokument-Metadaten', () => {
    expect(createDocumentSchema.safeParse(valid).success).toBe(true);
  });
  it('lehnt unerlaubte MIME-Types ab', () => {
    expect(createDocumentSchema.safeParse({ ...valid, content_type: 'text/html' }).success).toBe(
      false,
    );
  });
  it('lehnt size_bytes = 0 ab', () => {
    expect(createDocumentSchema.safeParse({ ...valid, size_bytes: 0 }).success).toBe(false);
  });
  it('lehnt Dateien > 100 MB ab', () => {
    expect(
      createDocumentSchema.safeParse({ ...valid, size_bytes: 101 * 1024 * 1024 }).success,
    ).toBe(false);
  });
});

// ── routing-job ────────────────────────────────────────────────────────────

describe('createRoutingJobSchema', () => {
  it('akzeptiert leeres Objekt (alle Felder optional)', () => {
    const result = createRoutingJobSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.max_attempts).toBe(3);
      expect(result.data.payload).toEqual({});
    }
  });
  it('lehnt max_attempts > 10 ab', () => {
    expect(createRoutingJobSchema.safeParse({ max_attempts: 11 }).success).toBe(false);
  });
  it('akzeptiert eine beliebige JSON-Nutzlast', () => {
    const result = createRoutingJobSchema.safeParse({
      payload: { workflow: 'invoice', priority: 1 },
    });
    expect(result.success).toBe(true);
  });
});
