import { initSentry } from './core/sentry';
// Decision: initSentry() vor allen anderen Imports aufrufen, damit Sentry
// Node-Instrumentierung greift, bevor Fastify und andere Module geladen werden.
initSentry();

import { buildApp } from './app';
import { config } from './core/config';
import { logger } from './core/logger';

async function main(): Promise<void> {
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
