/**
 * T078 — Status-Gate im Lexware-Exporter.
 *
 * Schliesst den Edge-Audit-Befund: ein 'requires_review'-Beleg HAT
 * payload.categorization (updateBelegCategorization schreibt sie auch im
 * requires_review-Zweig) und wuerde das hasPersistedCategorization-Gate passieren
 * — darf aber NICHT exportiert werden (ungeprueft → ginge still an den
 * Steuerberater). Mock-Pool: kein existing Export, loadBeleg liefert den Beleg.
 */
import type { S3Client } from '@aws-sdk/client-s3';
import type { Pool, PoolClient } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { exportBelegToLexware } from '../services/belege-lexware-exporter';

function makeMockPool(belegRow: Record<string, unknown> | null) {
  const client = {
    query: vi.fn(async (sql: string) => {
      if (sql.includes('FROM export_log')) return { rows: [] }; // kein bisheriger Export
      if (sql.includes('FROM belege')) return { rows: belegRow ? [belegRow] : [] };
      return { rows: [] }; // BEGIN / COMMIT / set_config / ROLLBACK
    }),
    release: vi.fn(),
  } as unknown as PoolClient;
  return {
    connect: vi.fn(async () => client),
    query: vi.fn(async () => ({ rows: [] })),
  } as unknown as Pool;
}

const s3 = { send: vi.fn() } as unknown as S3Client;

function beleg(status: string) {
  return {
    id: '550e8400-e29b-41d4-a716-446655440001',
    status,
    file_object_key: 'tenant/b.jpg',
    file_mime_type: 'image/jpeg',
    supplier_name: 'METRO',
    document_date: '2026-06-01',
    total_gross: 42,
    currency: 'EUR',
    category: 'wareneinkauf_food',
    // payload.categorization gesetzt → passiert das hasPersistedCategorization-Gate.
    payload: { categorization: { category: 'wareneinkauf_food', skr_account: '3100' } },
  };
}

describe('exportBelegToLexware — T078 Status-Gate', () => {
  it('requires_review-Beleg MIT payload.categorization wird NICHT exportiert (failed/not_categorized)', async () => {
    const pool = makeMockPool(beleg('requires_review'));
    const res = await exportBelegToLexware('t1', '550e8400-e29b-41d4-a716-446655440001', 'u1', {
      pool,
      s3,
    });
    expect(res.status).toBe('failed');
    expect(res.error).toBe('not_categorized');
    // Gate greift VOR jeglichem Storage-/Lexware-Zugriff.
    expect(s3.send).not.toHaveBeenCalled();
  });
});
