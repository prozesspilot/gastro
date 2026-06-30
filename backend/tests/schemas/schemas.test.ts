/**
 * D4 — Unit-Tests für die Zod-Kern-Schemas (`core/schemas/common`).
 *
 * Prüft gültige und ungültige Eingaben. Kein laufender Server/Infra nötig.
 *
 * Hinweis (2026-06-30): Die Legacy-`customer`-Welt-Schemas (customer/document/
 * routing-job/tenant/profile) wurden entfernt — nach dem belege-Reboot in Live-`src`
 * ungenutzt. Die zugehörigen Tests entfielen mit.
 */

import { describe, expect, it } from 'vitest';
import {
  apiError,
  apiOk,
  apiOkPaged,
  buildPaginationMeta,
  paginationQuerySchema,
  slugSchema,
  uuidSchema,
} from '../../src/core/schemas';

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
