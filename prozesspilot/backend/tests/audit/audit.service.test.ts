/**
 * Tests für audit.service.
 */

import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app';
import { log } from '../../src/core/audit/audit.service';

let app: FastifyInstance;
let tenantId: string;

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  const { rows } = await app.db.query<{ id: string }>(
    `INSERT INTO tenants (slug, name) VALUES ($1, $2) RETURNING id`,
    [`test-audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, 'Audit Test'],
  );
  tenantId = rows[0].id;
});

afterEach(async () => {
  await app.db.query(`DELETE FROM tenants WHERE id = $1`, [tenantId]);
});

describe('audit.log', () => {
  it('schreibt korrekt in audit_log', async () => {
    await log(app.db, tenantId, 'receipt', 'rec-123', 'status_changed', { old: 'pending', new: 'done' });

    const { rows } = await app.db.query<{
      tenant_id: string; entity_type: string; entity_id: string; action: string; payload: unknown; actor: string | null;
    }>(
      `SELECT tenant_id, entity_type, entity_id, action, payload, actor FROM audit_log WHERE tenant_id = $1`,
      [tenantId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].entity_type).toBe('receipt');
    expect(rows[0].entity_id).toBe('rec-123');
    expect(rows[0].action).toBe('status_changed');
    expect(rows[0].actor).toBe('system');
    expect(rows[0].payload).toMatchObject({ old: 'pending', new: 'done' });
  });

  it('respektiert tenant_id Isolation', async () => {
    const { rows } = await app.db.query<{ id: string }>(
      `INSERT INTO tenants (slug, name) VALUES ($1, $2) RETURNING id`,
      [`test-audit-iso-${Date.now()}`, 'Iso'],
    );
    const otherTenantId = rows[0].id;

    await log(app.db, tenantId, 'receipt', 'a', 'created');
    await log(app.db, otherTenantId, 'receipt', 'b', 'created');

    const { rows: r1 } = await app.db.query(
      `SELECT entity_id FROM audit_log WHERE tenant_id = $1`,
      [tenantId],
    );
    expect(r1).toHaveLength(1);
    expect((r1[0] as { entity_id: string }).entity_id).toBe('a');

    await app.db.query(`DELETE FROM tenants WHERE id = $1`, [otherTenantId]);
  });

  it('akzeptiert eigenen Actor', async () => {
    await log(app.db, tenantId, 'receipt', 'r1', 'created', {}, 'user:42');
    const { rows } = await app.db.query<{ actor: string }>(
      `SELECT actor FROM audit_log WHERE tenant_id = $1 AND entity_id = 'r1'`,
      [tenantId],
    );
    expect(rows[0].actor).toBe('user:42');
  });
});
