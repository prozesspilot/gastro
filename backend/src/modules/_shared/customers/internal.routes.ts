/**
 * Konzept-konforme interne Endpunkte für die Welt-A-customer_profiles-Tabelle.
 *
 * Wird von WF-M08 zum Auflisten aktiver Kunden genutzt:
 *   GET /api/v1/internal/customers?active=true&package=standard,pro
 *
 * Quelle: customer_profiles (TEXT customer_id, JSONB integrations + custom + routing).
 * Optionale Spalten (display_name, package, status) liegen, falls vorhanden, in
 * profile.custom oder als ALTER-Spalten — wir tolerieren beide Welten und
 * geben pragmatisch alles zurück, was wir finden.
 */

import type { FastifyInstance } from 'fastify';
import { apiOk } from '../../../core/schemas/common';

interface CustomerProfileRow {
  customer_id: string;
  integrations: unknown;
  routing: unknown;
  custom: unknown;
  modules_enabled: unknown;
  updated_at: Date;
}

export async function internalCustomersRoutes(app: FastifyInstance): Promise<void> {
  app.get('/customers', async (req, reply) => {
    const q = req.query as { active?: string; package?: string };
    const wantActive = q.active !== 'false';
    const wantPackages = (q.package ?? '')
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);

    const { rows } = await app.db.query<CustomerProfileRow>(
      `SELECT customer_id, integrations, routing, custom, modules_enabled, updated_at
         FROM customer_profiles
        ORDER BY updated_at DESC`,
    );

    const filtered = rows.filter((r) => {
      const cust = (r.custom ?? {}) as Record<string, unknown>;
      const pkg = typeof cust.package === 'string' ? (cust.package as string) : 'basic';
      const status = typeof cust.status === 'string' ? (cust.status as string) : 'active';
      const isActive = status === 'active';
      if (wantActive && !isActive) return false;
      if (wantPackages.length > 0 && !wantPackages.includes(pkg)) return false;
      return true;
    });

    const data = filtered.map((r) => {
      const custom = (r.custom ?? {}) as Record<string, unknown>;
      return {
        id: r.customer_id,
        customer_id: r.customer_id,
        display_name: typeof custom.display_name === 'string' ? custom.display_name : r.customer_id,
        package: typeof custom.package === 'string' ? custom.package : 'basic',
        status: typeof custom.status === 'string' ? custom.status : 'active',
        modules_enabled: r.modules_enabled,
        updated_at: r.updated_at.toISOString(),
      };
    });

    return reply.send(apiOk(data));
  });
}
