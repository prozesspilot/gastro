/**
 * T023 — M05 Export-Log Integration-Tests gegen echte DB.
 *
 * Testet die Kern-Pfade von exportBelegToLexware:
 *   - Idempotenz-Skip: wenn Beleg bereits gepusht → sofort skip zurueck
 *   - findExistingPushedExport: liest korrekt aus export_log
 *   - countAttempts: zaehlt korrekt
 *   - recordExport: schreibt + liest korrekt zurueck
 *   - Tenant-Isolation: kein Cross-Tenant-Leak
 *
 * HINWEIS: `exportBelegToLexware` selbst erfordert einen Lexoffice-API-Key
 * und S3 — deshalb testen wir hier NUR den DB-Layer (findExistingPushedExport,
 * recordExport, countAttempts). Die Handler-Tests mocken die externe API.
 *
 * Voraussetzung: TEST_DATABASE_URL oder gastro_test auf localhost.
 * Bei nicht-erreichbarer DB werden alle Tests geskippt.
 */

import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  countAttempts,
  findExistingPushedExport,
  recordExport,
} from '../../modules/m05-lexoffice/services/export-log.repository';
import {
  cleanGastroTestDb,
  seedBeleg,
  seedTenant,
  setupGastroTestDb,
} from '../integration/gastro-db-setup';

let pool: pg.Pool;
let dbAvailable = false;

beforeAll(async () => {
  try {
    pool = await setupGastroTestDb();
    dbAvailable = true;
  } catch {
    // DB nicht erreichbar — Tests werden geskippt
  }
});

afterAll(async () => {
  if (pool) {
    await pool.end().catch(() => {});
  }
});

beforeEach(async () => {
  if (dbAvailable) {
    await cleanGastroTestDb(pool);
  }
});

describe('M05 — export_log Repository Integration', () => {
  it('findExistingPushedExport: gibt null zurueck wenn kein Export vorhanden', async () => {
    if (!dbAvailable) return;

    const tenantId = await seedTenant(pool, { slug: `t-${Date.now()}` });
    const { id: belegId } = await seedBeleg(pool, tenantId);

    const result = await findExistingPushedExport(pool, tenantId, belegId, 'lexware_office');
    expect(result).toBeNull();
  });

  it('recordExport + findExistingPushedExport: Idempotenz-Roundtrip', async () => {
    if (!dbAvailable) return;

    const tenantId = await seedTenant(pool, { slug: `t-${Date.now()}` });
    const { id: belegId } = await seedBeleg(pool, tenantId);

    // Export-Eintrag anlegen
    await recordExport(pool, {
      tenantId,
      belegId,
      target: 'lexware_office',
      status: 'pushed',
      externalId: 'lx-voucher-001',
      externalUrl: 'https://app.lexoffice.de/voucher/lx-voucher-001',
      attemptNo: 1,
    });

    // Idempotenz-Check: findet den gepushten Export
    const existing = await findExistingPushedExport(pool, tenantId, belegId, 'lexware_office');
    expect(existing).not.toBeNull();
    if (!existing) throw new Error('existing must be defined');
    expect(existing.external_id).toBe('lx-voucher-001');
    expect(existing.status).toBe('pushed');
    expect(existing.attempt_no).toBe(1);
  });

  it('countAttempts: zaehlt alle Versuche unabhaengig vom Status', async () => {
    if (!dbAvailable) return;

    const tenantId = await seedTenant(pool, { slug: `t-${Date.now()}` });
    const { id: belegId } = await seedBeleg(pool, tenantId);

    // 0 Versuche
    expect(await countAttempts(pool, tenantId, belegId, 'lexware_office')).toBe(0);

    // 1. Fehlgeschlagener Versuch
    await recordExport(pool, {
      tenantId,
      belegId,
      target: 'lexware_office',
      status: 'failed',
      errorCode: 'server_error',
      errorMessage: '502 Bad Gateway',
      attemptNo: 1,
    });

    expect(await countAttempts(pool, tenantId, belegId, 'lexware_office')).toBe(1);

    // 2. Erfolgreicher Versuch
    await recordExport(pool, {
      tenantId,
      belegId,
      target: 'lexware_office',
      status: 'pushed',
      externalId: 'lx-v2',
      attemptNo: 2,
    });

    expect(await countAttempts(pool, tenantId, belegId, 'lexware_office')).toBe(2);
  });

  it('Tenant-Isolation: findExistingPushedExport findet keinen Export aus anderem Tenant', async () => {
    if (!dbAvailable) return;

    const tenantA = await seedTenant(pool, { slug: `ta-${Date.now()}` });
    const tenantB = await seedTenant(pool, { slug: `tb-${Date.now()}` });

    const { id: belegA } = await seedBeleg(pool, tenantA);

    // Export fuer Tenant A anlegen
    await recordExport(pool, {
      tenantId: tenantA,
      belegId: belegA,
      target: 'lexware_office',
      status: 'pushed',
      externalId: 'lx-tenant-a',
      attemptNo: 1,
    });

    // Tenant B soll den Beleg von A NICHT sehen (andere belegId sowieso, aber
    // auch bei gleicher belegId wuerde der Tenant-Filter greifen)
    const resultB = await findExistingPushedExport(pool, tenantB, belegA, 'lexware_office');
    expect(resultB).toBeNull();
  });

  it('findExistingPushedExport: ignoriert failed-Status (gibt nur pushed zurueck)', async () => {
    if (!dbAvailable) return;

    const tenantId = await seedTenant(pool, { slug: `t-${Date.now()}` });
    const { id: belegId } = await seedBeleg(pool, tenantId);

    // Nur ein fehlgeschlagener Versuch
    await recordExport(pool, {
      tenantId,
      belegId,
      target: 'lexware_office',
      status: 'failed',
      errorCode: 'api_error',
      attemptNo: 1,
    });

    // findExistingPushedExport sucht explizit nach status='pushed'
    const result = await findExistingPushedExport(pool, tenantId, belegId, 'lexware_office');
    expect(result).toBeNull();
  });
});
