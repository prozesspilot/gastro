import { initSentry } from './core/sentry';
// Decision: initSentry() vor allen anderen Imports aufrufen, damit Sentry
// Node-Instrumentierung greift, bevor Fastify und andere Module geladen werden.
initSentry();

import { Pool } from 'pg';
import { buildApp } from './app';
import { config } from './core/config';
import { assertNonPrivilegedDbRole } from './core/db/role-check';
import { logger } from './core/logger';

async function main(): Promise<void> {
  // T011 B4: vor allem anderen prüfen, dass die DB-Rolle nicht Superuser
  // bzw. BYPASSRLS hat — sonst sind alle RLS-Policies wirkungslos.
  // In Production crasht der Start hier sofort mit klarer Fehlermeldung;
  // in Dev/Test wird nur gewarnt.
  const checkPool = new Pool({ connectionString: config.DATABASE_URL });
  try {
    await assertNonPrivilegedDbRole(checkPool, config.NODE_ENV);
  } finally {
    await checkPool.end();
  }

  const app = await buildApp();

  try {
    const address = await app.listen({ port: config.PORT, host: '0.0.0.0' });
    logger.info({ address }, 'ProzessPilot Backend gestartet');
  } catch (err) {
    logger.error(err, 'Fehler beim Starten des Servers');
    process.exit(1);
  }

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Graceful Shutdown eingeleitet');
    await app.close();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

void main();
