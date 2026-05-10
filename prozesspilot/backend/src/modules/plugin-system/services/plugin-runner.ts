/**
 * Plugin-Runner — integriert sich in das Hook-System.
 *
 * Laedt alle aktivierten Plugins fuer einen Tenant und ein Hook-Event
 * und ruft den Dispatcher parallel auf (Promise.allSettled).
 *
 * Fehler einzelner Plugins unterbrechen die Hauptverarbeitung NIEMALS.
 */

import type { Pool } from 'pg';
import { logger } from '../../../core/logger';
import { type PluginRegistryRow, dispatchToPlugin } from './plugin-dispatcher';

/**
 * Fuehrt alle aktivierten Plugins fuer ein bestimmtes Hook-Event aus.
 *
 * @param db       PostgreSQL-Pool
 * @param tenantId Tenant-ID (fuer Plugin-Filterung)
 * @param hookEvent  Name des Hook-Events (z.B. 'after_categorization')
 * @param payload  Daten, die an das Plugin uebergeben werden
 * @param receiptId Optional: ID des betroffenen Belegs
 */
export async function runPluginsForEvent(
  db: Pool,
  tenantId: string,
  hookEvent: string,
  payload: unknown,
  receiptId?: string,
): Promise<void> {
  let plugins: PluginRegistryRow[];

  try {
    const { rows } = await db.query<PluginRegistryRow>(
      `SELECT plugin_id, tenant_id, name, version, webhook_url, webhook_secret, hook_events, enabled
         FROM plugin_registry
        WHERE tenant_id = $1
          AND enabled = true
          AND hook_events @> ARRAY[$2]::TEXT[]`,
      [tenantId, hookEvent],
    );
    plugins = rows;
  } catch (err) {
    logger.warn(
      { err, tenantId, hookEvent },
      'Plugin-Lookup fehlgeschlagen — ueberspringe Plugin-Ausführung',
    );
    return;
  }

  if (plugins.length === 0) return;

  logger.info(
    { tenant_id: tenantId, hook_event: hookEvent, plugin_count: plugins.length },
    'Plugin-Events ausfuehren',
  );

  // Parallel ausfuehren, Fehler einzelner Plugins ignorieren
  const results = await Promise.allSettled(
    plugins.map((plugin) => dispatchToPlugin(db, plugin, hookEvent, payload, receiptId)),
  );

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const plugin = plugins[i];
    if (result && plugin && result.status === 'rejected') {
      logger.warn(
        { plugin_id: plugin.plugin_id, hook_event: hookEvent, reason: result.reason },
        'Plugin-Dispatch abgelehnt',
      );
    }
  }
}
