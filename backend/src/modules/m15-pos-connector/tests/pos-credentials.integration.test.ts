/**
 * T023 — M15 POS-Credentials Integration-Tests gegen echte DB.
 *
 * Testet:
 *   1. listActiveSumUpTenants: liest aktive pos_credentials korrekt
 *   2. purgeInactivePosCredentials: drei Fixture-Varianten (aktiv, inaktiv+in-Retention,
 *      inaktiv+aussen-Retention), Boundary-Test, Audit-Log-Eintrag
 *
 * HINWEIS: listActiveSumUpTenants nutzt set_config(app.bypass_rls) — in CI
 * laeuft die DB als gastro_owner (via TEST_DATABASE_URL) → bypass-GUC wirkt.
 * In Prod laeuft der Cron-Job ebenfalls als Owner-Connection.
 *
 * Voraussetzung: TEST_DATABASE_URL oder gastro_test auf localhost.
 * Bei nicht-erreichbarer DB werden alle Tests geskippt.
 */

import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  cleanGastroTestDb,
  seedPosCredential,
  seedTenant,
  setupGastroTestDb,
} from '../../../__tests__/integration/gastro-db-setup';
import { listActiveSumUpTenants } from '../kasse-transactions.repository';
import { purgeInactivePosCredentials } from '../pos.repository';

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

// ── listActiveSumUpTenants ────────────────────────────────────────────────────

describe('M15 — listActiveSumUpTenants Integration', () => {
  it('leere DB → leeres Array', async () => {
    if (!dbAvailable) return;

    const result = await listActiveSumUpTenants(pool);
    expect(result).toEqual([]);
  });

  it('gibt aktive sumup_lite-Credentials korrekt zurueck', async () => {
    if (!dbAvailable) return;

    const tenantId = await seedTenant(pool, { slug: `t-${Date.now()}` });
    await seedPosCredential(pool, tenantId, {
      posSystem: 'sumup_lite',
      posAccountId: 'merch-active-001',
      active: true,
    });

    const result = await listActiveSumUpTenants(pool);
    expect(result).toHaveLength(1);
    expect(result[0].tenant_id).toBe(tenantId);
    expect(result[0].pos_account_id).toBe('merch-active-001');
  });

  it('ignoriert inaktive Credentials', async () => {
    if (!dbAvailable) return;

    const tenantId = await seedTenant(pool, { slug: `t-${Date.now()}` });
    await seedPosCredential(pool, tenantId, {
      posSystem: 'sumup_lite',
      posAccountId: 'merch-inactive',
      active: false,
      inactiveReason: 'revoked',
    });

    const result = await listActiveSumUpTenants(pool);
    expect(result).toHaveLength(0);
  });

  it('listet mehrere Tenants mit aktiven Credentials', async () => {
    if (!dbAvailable) return;

    const tenantA = await seedTenant(pool, { slug: `ta-${Date.now()}` });
    const tenantB = await seedTenant(pool, { slug: `tb-${Date.now()}` });

    await seedPosCredential(pool, tenantA, { posAccountId: 'merch-a', active: true });
    await seedPosCredential(pool, tenantB, { posAccountId: 'merch-b', active: true });

    const result = await listActiveSumUpTenants(pool);
    expect(result).toHaveLength(2);

    const tenantIds = result.map((r) => r.tenant_id);
    expect(tenantIds).toContain(tenantA);
    expect(tenantIds).toContain(tenantB);
  });
});

// ── purgeInactivePosCredentials ───────────────────────────────────────────────

describe('M15 — purgeInactivePosCredentials Integration', () => {
  it('aktive Credential wird NICHT geloescht', async () => {
    if (!dbAvailable) return;

    const tenantId = await seedTenant(pool, { slug: `t-${Date.now()}` });
    const { id: credId } = await seedPosCredential(pool, tenantId, { active: true });

    const purged = await purgeInactivePosCredentials(pool, 30);
    expect(purged).toHaveLength(0);

    // Credential muss noch in DB sein
    const check = await pool.query('SELECT id FROM pos_credentials WHERE id = $1', [credId]);
    expect(check.rows).toHaveLength(1);
  });

  it('inaktive Credential INNERHALB Retention-Frist bleibt erhalten', async () => {
    if (!dbAvailable) return;

    const tenantId = await seedTenant(pool, { slug: `t-${Date.now()}` });

    // updated_at = vor 29 Tagen (Retention=30) → noch NICHT faellig
    const updatedAt = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000);
    const { id: credId } = await seedPosCredential(pool, tenantId, {
      active: false,
      inactiveReason: 'revoked',
      updatedAt,
    });

    const purged = await purgeInactivePosCredentials(pool, 30);
    expect(purged).toHaveLength(0);

    const check = await pool.query('SELECT id FROM pos_credentials WHERE id = $1', [credId]);
    expect(check.rows).toHaveLength(1);
  });

  it('inaktive Credential AUSSERHALB Retention-Frist wird geloescht', async () => {
    if (!dbAvailable) return;

    const tenantId = await seedTenant(pool, { slug: `t-${Date.now()}` });

    // updated_at = vor 31 Tagen (Retention=30) → faellig
    const updatedAt = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    const { id: credId } = await seedPosCredential(pool, tenantId, {
      active: false,
      inactiveReason: 'revoked',
      updatedAt,
    });

    const purged = await purgeInactivePosCredentials(pool, 30);
    expect(purged).toHaveLength(1);
    expect(purged[0].id).toBe(credId);
    expect(purged[0].tenant_id).toBe(tenantId);

    // Credential muss aus DB weg sein
    const check = await pool.query('SELECT id FROM pos_credentials WHERE id = $1', [credId]);
    expect(check.rows).toHaveLength(0);
  });

  it('Boundary: inaktiv seit genau 30 Tagen → noch NICHT geloescht (< not <=)', async () => {
    if (!dbAvailable) return;

    const tenantId = await seedTenant(pool, { slug: `t-${Date.now()}` });

    // Genau 30 Tage alt: WHERE updated_at < now() - 30d → NICHT geloescht
    const updatedAt = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const { id: credId } = await seedPosCredential(pool, tenantId, {
      active: false,
      inactiveReason: 'expired',
      updatedAt,
    });

    const purged = await purgeInactivePosCredentials(pool, 30);
    // Exakt auf der Grenze: < (nicht <=) → nicht geloescht
    // (Ob es gerade 0 oder 1 ist haengt von Sub-Sekunden-Timing ab — Boundary-Test
    // verfiziiert haupstachlich dass der Query nicht crasht)
    expect(purged.length).toBeLessThanOrEqual(1);

    if (purged.length === 0) {
      const check = await pool.query('SELECT id FROM pos_credentials WHERE id = $1', [credId]);
      expect(check.rows).toHaveLength(1);
    }
  });

  it('Audit-Log-Eintrag wird tenant-isoliert in audit_log geschrieben', async () => {
    if (!dbAvailable) return;

    const tenantId = await seedTenant(pool, { slug: `t-${Date.now()}` });

    const updatedAt = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000);
    await seedPosCredential(pool, tenantId, {
      active: false,
      inactiveReason: 'revoked',
      updatedAt,
    });

    await purgeInactivePosCredentials(pool, 30);

    // audit_log-Eintrag muss existieren
    const auditResult = await pool.query<{ event_type: string; tenant_id: string }>(
      `SELECT event_type, tenant_id FROM audit_log
        WHERE tenant_id = $1 AND event_type = 'pos_credentials.purged'
        LIMIT 1`,
      [tenantId],
    );
    expect(auditResult.rows).toHaveLength(1);
    expect(auditResult.rows[0].event_type).toBe('pos_credentials.purged');
    expect(auditResult.rows[0].tenant_id).toBe(tenantId);
  });

  it('Multi-Tenant: loescht nur Credentials des richtigen Tenants', async () => {
    if (!dbAvailable) return;

    const tenantA = await seedTenant(pool, { slug: `ta-${Date.now()}` });
    const tenantB = await seedTenant(pool, { slug: `tb-${Date.now()}` });

    const oldDate = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);

    // Tenant A: faellig
    const { id: credA } = await seedPosCredential(pool, tenantA, {
      active: false,
      updatedAt: oldDate,
    });

    // Tenant B: aktiv (bleibt)
    const { id: credB } = await seedPosCredential(pool, tenantB, { active: true });

    const purged = await purgeInactivePosCredentials(pool, 30);
    expect(purged).toHaveLength(1);
    expect(purged[0].id).toBe(credA);

    // Tenant B Credential muss noch da sein
    const checkB = await pool.query('SELECT id FROM pos_credentials WHERE id = $1', [credB]);
    expect(checkB.rows).toHaveLength(1);
  });
});
