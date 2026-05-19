/**
 * T009/M05 — Lexware-Office-Export-Service fuer die belege-Tabelle.
 *
 * Verantwortung:
 *   1. Token aus booking_credentials laden (entschluesseln).
 *   2. Beleg + File-Bytes aus MinIO ziehen.
 *   3. Voucher-Payload bauen (belege-voucher-builder).
 *   4. Category-ID aufloesen (category.mapper) — fallback '4980'.
 *   5. Voucher bei Lexoffice anlegen (createVoucher).
 *   6. Datei als Anhang hochladen (uploadVoucherFile).
 *   7. export_log Erfolg/Fehler protokollieren.
 *   8. belege.status auf 'exported' setzen, payload.exports.lexware_office
 *      mit external_id ergaenzen.
 *
 * Retry: 3 Versuche mit exponential Backoff (Wrapper-Schicht hier — der
 * existierende LexofficeClient hat ja schon internal retries, wir nehmen
 * eine weitere Schicht fuer ALLE Fehler, nicht nur fetch-Fehler).
 *
 * Discord-Alert: bei finalem Fail Best-Effort an DISCORD_OPS_WEBHOOK_URL.
 */

import { GetObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import type { Pool } from 'pg';

import type { PoolClient } from 'pg';
import { CategoryMapper } from '../../../core/adapters/booking/lexoffice/category.mapper';
import {
  LexofficeApiError,
  LexofficeClient,
} from '../../../core/adapters/booking/lexoffice/lexoffice.client';
import { logAuditEvent } from '../../../core/audit/audit-log';
import { config } from '../../../core/config';
import { logger } from '../../../core/logger';
import { buildBelegVoucher } from './belege-voucher-builder';
import {
  BookingCredentialNotConfiguredError,
  getBookingTokenDecrypted,
} from './booking-credentials.repository';
import { categoryToSkr04 } from './category-skr-map';
import { countAttempts, findExistingPushedExport, recordExport } from './export-log.repository';

const MAX_ATTEMPTS = 3;

export interface ExportBelegResult {
  beleg_id: string;
  status: 'pushed' | 'skipped' | 'failed';
  external_id?: string;
  external_url?: string;
  error?: string;
  attempts: number;
}

export interface ExporterDeps {
  pool: Pool;
  s3: S3Client;
  /** Test-Hook: Lexoffice-Client per Injection statt aus Credentials gebaut. */
  lexofficeClient?: LexofficeClient;
  /** Test-Hook: Fetch fuer Discord-Alert mocken. */
  fetchImpl?: typeof fetch;
}

async function downloadFileBytes(s3: S3Client, key: string): Promise<Buffer> {
  const result = await s3.send(new GetObjectCommand({ Bucket: config.MINIO_BUCKET, Key: key }));
  const body = result.Body as { transformToByteArray?: () => Promise<Uint8Array> } | undefined;
  if (!body?.transformToByteArray) {
    throw new Error(`Storage-Download leer: ${key}`);
  }
  const arr = await body.transformToByteArray();
  return Buffer.from(arr);
}

/**
 * Discord-Alert bei finalem Fail. Best-effort.
 */
async function sendDiscordAlert(
  belegId: string,
  errorMessage: string,
  fetchImpl: typeof fetch,
): Promise<void> {
  const url = config.DISCORD_OPS_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: `🔴 Lexware-Export fuer Beleg \`${belegId.slice(0, 8)}…\` ist nach ${MAX_ATTEMPTS} Versuchen final fehlgeschlagen.\nFehler: ${errorMessage.slice(0, 200)}`,
      }),
    });
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err), belegId },
      '[lexware-exporter] Discord-Alert konnte nicht gesendet werden',
    );
  }
}

interface BelegRow {
  id: string;
  status: string;
  file_object_key: string;
  file_mime_type: string;
  supplier_name: string | null;
  document_date: Date | null;
  total_gross: number | null;
  currency: string;
  category: string | null;
  payload: Record<string, unknown>;
}

async function setTenantContext(client: PoolClient, tenantId: string): Promise<void> {
  await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
}

async function loadBeleg(pool: Pool, tenantId: string, belegId: string): Promise<BelegRow | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setTenantContext(client, tenantId);
    const result = await client.query<BelegRow>(
      `SELECT id, status, file_object_key, file_mime_type, supplier_name,
              document_date, total_gross, currency, category, payload
         FROM belege
        WHERE id = $1 AND tenant_id = $2`,
      [belegId, tenantId],
    );
    await client.query('COMMIT');
    return result.rows[0] ?? null;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Setzt belege.status auf 'exported' + ergaenzt payload.exports.lexware_office.
 * Wird nach erfolgreichem Push aufgerufen.
 *
 * T009-Review-Fix #4 (FSM-Sprung): Die Migration-030 FSM-Doku sieht den
 * Status-Lebenszyklus
 *   received → extracted → categorized → archived → exported
 * vor. T009 ueberspringt 'categorized' und 'archived', weil M02-Archivierung
 * im Pilot noch nicht implementiert ist (kein Drive/Dropbox-Adapter gegen
 * Migration-030-Belege). Der CHECK-Constraint in Migration 030 erlaubt den
 * Direkt-Sprung — semantisch sind die uebersprungenen Stufen "wurden
 * gleichzeitig erledigt" zu interpretieren. Wenn M02 nachgezogen wird,
 * muss hier ein Pre-Check ergaenzt werden (z.B. nur exportieren wenn schon
 * archiviert), und der Sprung 'extracted -> exported' wird zu
 * 'archived -> exported'. Backlog-Task: "T-?: FSM-Guard fuer Lexware-Export
 * nach M02-Archiv-Hook".
 */
async function markBelegExported(
  pool: Pool,
  tenantId: string,
  belegId: string,
  externalId: string,
  externalUrl: string | null,
  actorUserId: string,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setTenantContext(client, tenantId);

    const exportEntry = {
      target: 'lexware_office',
      external_id: externalId,
      external_url: externalUrl,
      pushed_at: new Date().toISOString(),
    };
    await client.query(
      `UPDATE belege
          SET status = 'exported',
              payload = jsonb_set(
                COALESCE(payload, '{}'::jsonb),
                '{exports,lexware_office}',
                $3::jsonb,
                true
              )
        WHERE id = $1 AND tenant_id = $2`,
      [belegId, tenantId, JSON.stringify(exportEntry)],
    );

    await logAuditEvent(client, {
      tenantId,
      entityType: 'beleg',
      entityId: belegId,
      eventType: 'beleg.exported',
      actor: { type: 'staff', id: actorUserId },
      payloadAfter: { target: 'lexware_office', external_id: externalId },
    });

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Haupt-Funktion: pushe einen einzelnen Beleg an Lexware Office.
 * Idempotent: wenn schon gepusht, return 'skipped' mit existing external_id.
 */
export async function exportBelegToLexware(
  tenantId: string,
  belegId: string,
  actorUserId: string,
  deps: ExporterDeps,
): Promise<ExportBelegResult> {
  const fetchImpl = deps.fetchImpl ?? fetch;

  // 1. Idempotenz-Check
  const existing = await findExistingPushedExport(deps.pool, tenantId, belegId, 'lexware_office');
  if (existing) {
    return {
      beleg_id: belegId,
      status: 'skipped',
      external_id: existing.external_id ?? undefined,
      external_url: existing.external_url ?? undefined,
      attempts: existing.attempt_no,
    };
  }

  // 2. Beleg laden
  const beleg = await loadBeleg(deps.pool, tenantId, belegId);
  if (!beleg) {
    return { beleg_id: belegId, status: 'failed', error: 'beleg_not_found', attempts: 0 };
  }

  const previousAttempts = await countAttempts(deps.pool, tenantId, belegId, 'lexware_office');
  let attemptNo = previousAttempts + 1;
  let lastError: string | null = null;

  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    try {
      // 3. Client + Token aufloesen (nur beim ersten Attempt — danach reuse)
      const client = deps.lexofficeClient ?? (await buildClient(deps.pool, tenantId));

      // 4. Voucher bauen — Category-Mapping via SKR04 → Lexoffice-UUID
      const skrAccount = categoryToSkr04(beleg.category);
      const mapper = new CategoryMapper({ pool: deps.pool, client });
      const categoryId = await mapper.mapSkrToLexoffice(skrAccount, tenantId);
      const voucher = buildBelegVoucher({
        beleg,
        lexofficeCategoryId: categoryId,
      });

      // 5. Voucher anlegen
      const created = await client.createVoucher(voucher);

      // 6. Anhang hochladen (best-effort: wenn der Datei-Download oder
      //    Upload fehlschlaegt, ist der Voucher trotzdem da → wir loggen
      //    Warning aber gelten als 'pushed').
      try {
        const fileBytes = await downloadFileBytes(deps.s3, beleg.file_object_key);
        const filename = `${beleg.id}.${beleg.file_mime_type.split('/')[1] ?? 'bin'}`;
        await client.uploadVoucherFile(created.id, fileBytes, filename, beleg.file_mime_type);
      } catch (attErr) {
        logger.warn(
          {
            err: attErr instanceof Error ? attErr.message : String(attErr),
            belegId,
            voucherId: created.id,
          },
          '[lexware-exporter] Anhang konnte nicht hochgeladen werden — Voucher bleibt ohne Datei',
        );
      }

      // 7. Erfolg loggen
      const externalUrl = `https://app.lexoffice.de/voucher/${created.id}`;
      await recordExport(deps.pool, {
        tenantId,
        belegId,
        target: 'lexware_office',
        status: 'pushed',
        externalId: created.id,
        externalUrl,
        attemptNo,
      });

      // 8. Beleg-Status update
      await markBelegExported(deps.pool, tenantId, belegId, created.id, externalUrl, actorUserId);

      return {
        beleg_id: belegId,
        status: 'pushed',
        external_id: created.id,
        external_url: externalUrl,
        attempts: attemptNo,
      };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      const isAuthError = err instanceof BookingCredentialNotConfiguredError;
      const isFatal4xx = err instanceof LexofficeApiError && err.status >= 400 && err.status < 500;

      // Log this attempt
      await recordExport(deps.pool, {
        tenantId,
        belegId,
        target: 'lexware_office',
        status: i < MAX_ATTEMPTS - 1 && !isAuthError && !isFatal4xx ? 'retry_pending' : 'failed',
        errorCode: err instanceof LexofficeApiError ? `lexoffice_${err.status}` : 'internal',
        errorMessage: lastError,
        attemptNo,
      });

      // Bei Auth-Fehler oder 4xx: kein Retry sinnvoll
      if (isAuthError || isFatal4xx) {
        await sendDiscordAlert(belegId, lastError, fetchImpl);
        return {
          beleg_id: belegId,
          status: 'failed',
          error: lastError,
          attempts: attemptNo,
        };
      }

      attemptNo++;
      if (i < MAX_ATTEMPTS - 1) {
        // Exponential Backoff: 1s, 4s, 16s
        const delayMs = 1000 * 4 ** i;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  // Final fail nach MAX_ATTEMPTS
  await sendDiscordAlert(belegId, lastError ?? 'unbekannter Fehler', fetchImpl);
  return {
    beleg_id: belegId,
    status: 'failed',
    error: lastError ?? 'unbekannter Fehler',
    attempts: attemptNo - 1,
  };
}

/**
 * Baut einen Lexoffice-Client aus dem in booking_credentials gespeicherten Token.
 */
async function buildClient(pool: Pool, tenantId: string): Promise<LexofficeClient> {
  const { token } = await getBookingTokenDecrypted(pool, tenantId, 'lexware_office');
  return new LexofficeClient({
    apiKey: token,
    customerId: tenantId,
  });
}
