import { initSentry } from './core/sentry';
// Decision: initSentry() vor allen anderen Imports aufrufen, damit Sentry
// Node-Instrumentierung greift, bevor Fastify und andere Module geladen werden.
initSentry();

import { Pool } from 'pg';
import { buildApp } from './app';
import { config } from './core/config';
import { assertNonPrivilegedDbRole } from './core/db/role-check';
import { logger } from './core/logger';
import { closeDsgvoQueue } from './core/queue/dsgvo-queue';
import { closeOcrQueue } from './core/queue/ocr-queue';
import { createS3Client } from './core/storage/storage.service';
import { startDsgvoWorker, stopDsgvoWorker } from './workers/dsgvo-worker';
import { startOcrWorker, stopOcrWorker } from './workers/ocr-worker';

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

  // T007: BullMQ-OCR-Worker im selben Prozess starten. Bei höherer Last lässt
  // sich der Worker später in einen eigenen Container auslagern — der Code
  // funktioniert in beiden Setups.
  if (config.OCR_QUEUE_ENABLED) {
    try {
      const s3 = createS3Client();
      // Reuse den DB-Pool von Fastify (decorate 'db' aus app.ts)
      const db = (app as unknown as { db: Pool }).db;
      await startOcrWorker({ db, s3 });
      logger.info('[ocr-worker] gestartet');
    } catch (err) {
      logger.error(
        { err: err instanceof Error ? err.message : String(err) },
        '[ocr-worker] Start fehlgeschlagen — Backend läuft ohne OCR-Worker weiter',
      );
    }
  }

  // T010: BullMQ-DSGVO-Worker für Auskunfts-ZIP-Builds im selben Prozess.
  if (config.DSGVO_QUEUE_ENABLED) {
    try {
      const s3 = createS3Client();
      const db = (app as unknown as { db: Pool }).db;
      await startDsgvoWorker({ db, s3 });
      logger.info('[dsgvo-worker] gestartet');
    } catch (err) {
      logger.error(
        { err: err instanceof Error ? err.message : String(err) },
        '[dsgvo-worker] Start fehlgeschlagen — Backend läuft ohne DSGVO-Worker weiter',
      );
    }
  }

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Graceful Shutdown eingeleitet');
    await stopOcrWorker().catch(() => undefined);
    await closeOcrQueue().catch(() => undefined);
    await stopDsgvoWorker().catch(() => undefined);
    await closeDsgvoQueue().catch(() => undefined);
    await app.close();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

void main();
