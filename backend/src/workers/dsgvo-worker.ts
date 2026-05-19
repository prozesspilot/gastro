/**
 * T010/M12 — BullMQ-Worker fuer DSGVO-Auskunfts-ZIP-Builds.
 *
 * Verantwortung:
 *   1. Job konsumieren ({ request_id, tenant_id }).
 *   2. DSGVO-Request aus DB laden.
 *   3. AuskunftBundle sammeln (auskunft.service.collectAuskunftBundle).
 *   4. ZIP bauen mit `archiver` (passwortgeschuetzt via zip-encryption nicht
 *      direkt unterstuetzt — wir nutzen openssl-symmetric-encrypted ZIP via
 *      separater Passwort-Mail. Pilot-OK: ZIP ohne Passwort + Signed-URL mit
 *      Short-TTL ist akzeptables Sicherheits-Niveau).
 *   5. Upload nach MinIO (Pfad <tenant>/dsgvo/<request_id>.zip).
 *   6. Status auf 'ready' setzen, expires_at = now() + DSGVO_EXPORT_TTL_DAYS.
 *   7. Mail an Subject mit Signed-URL.
 *
 * Bei Fehler: Status='failed', error_message, kein Mail-Versand.
 */

import { randomBytes } from 'node:crypto';
import type { S3Client } from '@aws-sdk/client-s3';
import type { Worker } from 'bullmq';
import type { Pool } from 'pg';

import { config } from '../core/config';
import { logger } from '../core/logger';
import {
  DSGVO_QUEUE_NAME,
  type DsgvoJobData,
  type DsgvoJobResult,
} from '../core/queue/dsgvo-queue';
import { getPresignedDownloadUrl, uploadObject } from '../core/storage/storage.service';
import { collectAuskunftBundle } from '../modules/dsgvo/services/auskunft.service';
import {
  getDsgvoRequestById,
  updateDsgvoRequestStatus,
} from '../modules/dsgvo/services/dsgvo-request.repository';
import { sendAuskunftReadyMail } from '../modules/dsgvo/services/email.service';

export interface DsgvoWorkerDeps {
  db: Pool;
  s3: S3Client;
}

let cachedWorker: Worker<DsgvoJobData, DsgvoJobResult> | null = null;

/**
 * Baut das ZIP-Buffer aus dem Bundle. Drei JSON-Files + ein README.
 *
 * Archiver streamt normalerweise an einen WritableStream; wir collecten
 * stattdessen via Promise.
 */
async function buildZipBuffer(
  bundle: Awaited<ReturnType<typeof collectAuskunftBundle>>,
): Promise<Buffer> {
  const archiver = (await import('archiver')).default;
  const archive = archiver('zip', { zlib: { level: 9 } });
  const chunks: Buffer[] = [];

  archive.on('data', (chunk) => chunks.push(chunk as Buffer));
  const done = new Promise<void>((resolve, reject) => {
    archive.on('end', resolve);
    archive.on('error', reject);
  });

  archive.append(JSON.stringify(bundle.meta, null, 2), { name: 'meta.json' });
  archive.append(JSON.stringify(bundle.belege, null, 2), { name: 'belege.json' });
  archive.append(JSON.stringify(bundle.audit_log, null, 2), { name: 'audit_log.json' });
  archive.append(JSON.stringify(bundle.users, null, 2), { name: 'users.json' });
  archive.append(
    `DSGVO-Auskunftsdaten
====================

Dieser Export enthaelt alle Daten, die wir zur E-Mail-Adresse "${bundle.meta.subject_email}"
in unserem System gespeichert haben, gemaess Art. 15 DSGVO.

Generiert am: ${bundle.meta.generated_at}
Tenant:       ${bundle.meta.tenant_id}

Inhalt:
  - meta.json       Metadaten + Treffer-Anzahl
  - belege.json     ${bundle.meta.matched_belege_count} Beleg(e), in denen die E-Mail vorkommt
  - audit_log.json  ${bundle.meta.matched_audit_count} Audit-Log-Eintraege
  - users.json      ${bundle.meta.matched_users_count} User-Account-Eintraege (falls Mitarbeiter)

Hinweise:
  - Wenn Belege fehlen, die wir aus gesetzlicher Aufbewahrungspflicht
    (§ 147 AO, 10 Jahre) nicht loeschen koennen, sind diese in
    belege.json enthalten — ggf. mit anonymisierten Feldern.
  - Bei Rueckfragen: Antwort auf die Mail mit Download-Link.
`,
    { name: 'README.txt' },
  );

  await archive.finalize();
  await done;
  return Buffer.concat(chunks);
}

export function buildDsgvoJobProcessor(deps: DsgvoWorkerDeps) {
  return async function processDsgvoJob(job: {
    id?: string;
    data: DsgvoJobData;
    attemptsMade: number;
  }): Promise<DsgvoJobResult> {
    const { request_id, tenant_id } = job.data;
    logger.info(
      { jobId: job.id, request_id, tenant_id, attempt: job.attemptsMade + 1 },
      '[dsgvo-worker] Processing job',
    );

    // 1. Request laden
    const request = await getDsgvoRequestById(deps.db, tenant_id, request_id);
    if (!request) {
      logger.warn({ request_id, tenant_id }, '[dsgvo-worker] Request nicht gefunden');
      return { status: 'failed', error: 'request_not_found' };
    }
    if (request.type !== 'auskunft') {
      logger.warn(
        { request_id, type: request.type },
        '[dsgvo-worker] Falscher Request-Typ — Worker macht nur auskunft',
      );
      return { status: 'failed', error: 'wrong_type' };
    }

    // 2. Status auf processing
    await updateDsgvoRequestStatus(deps.db, tenant_id, request_id, { status: 'processing' });

    try {
      // 3. Bundle sammeln
      const bundle = await collectAuskunftBundle(deps.db, tenant_id, request.subject_email);

      // 4. ZIP bauen
      const zipBuffer = await buildZipBuffer(bundle);

      // 5. Upload nach MinIO
      const objectKey = `${tenant_id}/dsgvo/${request_id}.zip`;
      await uploadObject(deps.s3, objectKey, zipBuffer, 'application/zip');

      // 6. Status auf ready + expires_at
      const expiresAt = new Date(Date.now() + config.DSGVO_EXPORT_TTL_DAYS * 24 * 3600 * 1000);
      await updateDsgvoRequestStatus(deps.db, tenant_id, request_id, {
        status: 'ready',
        export_object_key: objectKey,
        expires_at: expiresAt,
      });

      // 7. Mail an Subject mit Signed-URL
      const signedUrl = await getPresignedDownloadUrl(
        deps.s3,
        objectKey,
        config.DSGVO_EXPORT_TTL_DAYS * 24 * 3600,
      );
      // Pilot-Vereinfachung: kein ZIP-Passwort, Sicherheit kommt aus Signed-URL-TTL.
      // Wir hinterlegen einen generierten Token NUR als Audit-Marker (Spalte
      // export_password_hash). Wenn spaeter zip-encryption noetig wird, kann
      // hier eine echte Passwort-Pipeline ergaenzt werden.
      const fauxToken = randomBytes(8).toString('hex');
      await updateDsgvoRequestStatus(deps.db, tenant_id, request_id, {
        export_password_hash: fauxToken, // nur Audit-Marker
      });
      await sendAuskunftReadyMail({
        to: request.subject_email,
        downloadUrl: signedUrl,
        zipPassword: '(keines — Signed-URL ist zeitlich begrenzt)',
        ttlDays: config.DSGVO_EXPORT_TTL_DAYS,
      });

      return { status: 'ready', export_object_key: objectKey };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err: msg, request_id, tenant_id }, '[dsgvo-worker] ZIP-Build fehlgeschlagen');
      await updateDsgvoRequestStatus(deps.db, tenant_id, request_id, {
        status: 'failed',
        error_message: msg,
      });
      // re-throw damit BullMQ retried
      throw err;
    }
  };
}

export async function startDsgvoWorker(
  deps: DsgvoWorkerDeps,
): Promise<Worker<DsgvoJobData, DsgvoJobResult>> {
  if (cachedWorker) return cachedWorker;
  const bullmq = await import('bullmq');
  const processor = buildDsgvoJobProcessor(deps);
  const worker = new bullmq.Worker<DsgvoJobData, DsgvoJobResult>(DSGVO_QUEUE_NAME, processor, {
    connection: { url: config.REDIS_URL },
    concurrency: 1, // ZIP-Bau ist CPU-/Memory-intensiv
  });

  worker.on('completed', (job, result) => {
    logger.info(
      { request_id: job.data.request_id, status: result.status },
      '[dsgvo-worker] Job completed',
    );
  });

  worker.on('error', (err) => {
    logger.error(
      { err: err instanceof Error ? err.message : String(err) },
      '[dsgvo-worker] Worker-Error',
    );
  });

  cachedWorker = worker;
  return worker;
}

export async function stopDsgvoWorker(): Promise<void> {
  if (cachedWorker) {
    await cachedWorker.close();
    cachedWorker = null;
  }
}
