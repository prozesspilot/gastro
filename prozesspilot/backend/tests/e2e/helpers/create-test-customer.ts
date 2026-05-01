/**
 * E2E-Helper: createTestCustomer
 *
 * Legt einen Test-Customer in der Welt-A-customer_profiles-Tabelle an.
 * Gibt eine cleanup-Funktion zurück, die den Eintrag wieder löscht.
 *
 * Nutzt nicht die UUID-customers-Tabelle (Welt B), weil M03/M05/M08 + die
 * neuen Routing-/Complete-Endpoints durchgehend mit TEXT customer_id arbeiten.
 */

import type { Pool } from 'pg';

export interface TestCustomerOpts {
  customerId?: string;
  package?: string;
  modules?: string[];
  integrations?: Record<string, unknown>;
  routing?: Record<string, unknown>;
  custom?: Record<string, unknown>;
}

export interface TestCustomerHandle {
  customer_id: string;
  cleanup: () => Promise<void>;
}

export async function createTestCustomer(
  pool: Pool,
  opts: TestCustomerOpts = {},
): Promise<TestCustomerHandle> {
  const customerId = opts.customerId ?? `cust_e2e_${Date.now().toString(36)}`;
  const integrations = opts.integrations ?? {};
  const routing = opts.routing ?? {};
  const custom = { display_name: `Test ${customerId}`, package: opts.package ?? 'standard', status: 'active', ...(opts.custom ?? {}) };
  const modules = opts.modules ?? ['M01', 'M03', 'M02', 'M07'];

  await pool.query(
    `INSERT INTO customer_profiles (customer_id, modules_enabled, integrations, routing, custom)
     VALUES ($1, $2::jsonb, $3::jsonb, $4::jsonb, $5::jsonb)
     ON CONFLICT (customer_id) DO UPDATE
       SET modules_enabled = EXCLUDED.modules_enabled,
           integrations    = EXCLUDED.integrations,
           routing         = EXCLUDED.routing,
           custom          = EXCLUDED.custom,
           updated_at      = now()`,
    [customerId, JSON.stringify(modules), JSON.stringify(integrations), JSON.stringify(routing), JSON.stringify(custom)],
  );

  return {
    customer_id: customerId,
    cleanup: async () => {
      // Robust: Reihenfolge so wählen, dass abhängige Inserts vorher weg sind.
      // Wenn `receipts.customer_id` ein UUID-Typ ist (Migration 013), dann
      // wirft das DELETE — wir fangen das hier ab, damit der nachfolgende
      // customer_profiles-Cleanup garantiert läuft.
      await pool.query(`DELETE FROM hook_executions WHERE customer_id = $1`, [customerId]).catch(() => undefined);
      await pool.query(`DELETE FROM error_log WHERE customer_id = $1`, [customerId]).catch(() => undefined);
      await pool.query(`DELETE FROM customer_hooks WHERE customer_id = $1`, [customerId]).catch(() => undefined);
      await pool.query(`DELETE FROM receipts WHERE customer_id = $1`, [customerId]).catch(() => undefined);
      await pool.query(`DELETE FROM customer_profiles WHERE customer_id = $1`, [customerId]);
    },
  };
}
