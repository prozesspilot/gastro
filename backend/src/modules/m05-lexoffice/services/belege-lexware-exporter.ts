/**
 * T009/M05 — Lexware-Office-Export-Service fuer die belege-Tabelle.
 *
 * Verantwortung:
 *   1. Token aus booking_credentials laden (entschluesseln).
 *   2. Beleg + File-Bytes aus MinIO ziehen.
 *   3. Voucher-Payload bauen (belege-voucher-builder).
 *   4. SKR-Konto aus der persistierten Kategorisierung lesen (T052,
 *      resolve-export-skr) und via category.mapper auf die Lexoffice-Category-UUID
 *      aufloesen — fallback 'sonstige'.
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

import { createHash } from 'node:crypto';
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
import { emitBelegStatus } from '../../../core/sse/beleg-status';
import { buildBelegVoucher } from './belege-voucher-builder';
import {
  BookingCredentialNotConfiguredError,
  getBookingTokenDecrypted,
} from './booking-credentials.repository';
import { countAttempts, findExistingPushedExport, recordExport } from './export-log.repository';
import { hasPersistedCategorization, resolveExportSkrAccount } from './resolve-export-skr';

const MAX_ATTEMPTS = 3;

// T078: Nur kategorisierte (oder spätere) Belege dürfen exportiert werden. Alles
// davor — insb. 'requires_review' (hat payload.categorization, aber ungeprüft) —
// wird abgewiesen.
//
// Bewusste Asymmetrie zum Batch-Selektor findBelegIdsPendingExport (export-log.
// repository), der auf SQL-Ebene nur ('categorized','archived','exported') zieht:
// diese Menge hier ist eine SUPERMENGE für den Einzel-Endpoint. Die zusätzlichen
// transienten/Endstati (archiving/exporting/completed) sind unkritisch, weil der
// Idempotenz-Skip (oben, vor diesem Gate) bereits gepushte Belege ohnehin als
// 'skipped' abfängt; ausgeschlossen bleibt in BEIDEN Pfaden das Wesentliche:
// requires_review/extracted/… werden nie exportiert.
export const EXPORTABLE_STATUS = new Set<string>([
  'categorized',
  'archiving',
  'archived',
  'exporting',
  'exported',
  'completed',
]);

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
  // pg liefert NUMERIC(12,2) als String — ehrlicher Typ, Coercion in buildBelegVoucher.
  total_gross: number | string | null;
  currency: string;
  category: string | null;
  payload: Record<string, unknown>;
}

async function setTenantContext(client: PoolClient, tenantId: string): Promise<void> {
  // T041: Key MUSS app.current_tenant sein (von RLS-Policy current_tenant_id() gelesen).
  await client.query("SELECT set_config('app.current_tenant', $1, true)", [tenantId]);
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
 *
 * T074: Als testbarer Status-Writer exportiert (analog zu den M01-Repository-Writern),
 * damit der 'exported'-SSE-Emit direkt gegen die DB getestet werden kann.
 */
export async function markBelegExported(
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
    const updateResult = await client.query(
      `UPDATE belege
          SET status = 'exported',
              payload = jsonb_set(
                COALESCE(payload, '{}'::jsonb),
                '{exports,lexware_office}',
                $3::jsonb,
                true
              )
        WHERE id = $1 AND tenant_id = $2
        RETURNING id`,
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
    // T074: Live-Status 'exported' best-effort in den Web-Chat des Wirts (nach Commit).
    // rowCount-Gate (wie die M01-Writer): nur emittieren, wenn wirklich eine Row
    // committed wurde — kein Phantom-Emit, falls der Beleg zwischenzeitlich weg ist.
    if (updateResult.rowCount === 1) emitBelegStatus(tenantId, belegId, 'exported');
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

  // 2a. Status-Gate (Review #2): ein noch nicht kategorisierter Beleg darf NICHT
  //     exportiert werden. Sonst würde er über die Sonstige-Fallback-Kette still
  //     ohne KI-Konto gebucht. Der Batch selektiert 'extracted' gar nicht erst
  //     (findBelegIdsPendingExport); dies ist die Absicherung für den direkten
  //     Einzel-Export-Endpoint. → 'not_categorized' mappt im Handler auf 422.
  if (!hasPersistedCategorization(beleg.payload)) {
    return { beleg_id: belegId, status: 'failed', error: 'not_categorized', attempts: 0 };
  }

  // T078: Status-Gate. Ein requires_review-Beleg HAT bereits payload.categorization
  // (updateBelegCategorization schreibt sie auch im requires_review-Zweig), würde
  // also das Gate oben passieren und still an den Steuerberater gebucht — obwohl er
  // noch ungeprüft ist. Exportierbar ist nur 'categorized' oder später im
  // Lebenszyklus; alles davor (insb. requires_review) → not_categorized (422).
  if (!EXPORTABLE_STATUS.has(beleg.status)) {
    return { beleg_id: belegId, status: 'failed', error: 'not_categorized', attempts: 0 };
  }

  const previousAttempts = await countAttempts(deps.pool, tenantId, belegId, 'lexware_office');
  let attemptNo = previousAttempts + 1;
  let lastError: string | null = null;

  // Stabiler Idempotency-Key pro Beleg → Lexoffice dedupliziert serverseitig,
  // sodass weder der interne Client-Retry (bei 5xx/429) noch der aeussere
  // Retry hier einen doppelten Buchungsbeleg im Steuerberater-System erzeugen
  // (PR #59 Review-Blocker: doppelte Betriebsausgaben).
  const idempotencyKey = createHash('sha256')
    .update(`${tenantId}:${belegId}:lexware_office`)
    .digest('hex');

  // SKR-Konto ist rein in-memory (T052) und zwischen Retries identisch → einmal.
  const skrAccount = resolveExportSkrAccount(beleg);
  // categoryId-Auflösung (DB-Lookup/Heuristik) ist zwischen Retries ebenfalls
  // identisch und öffnet je Aufruf eine eigene Connection — daher über die
  // Versuche memoisieren statt pro Attempt neu aufzulösen (Review #MINOR T054).
  let resolvedCategoryId: string | null = null;

  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    try {
      // 3. Client + Token aufloesen (nur beim ersten Attempt — danach reuse)
      const client = deps.lexofficeClient ?? (await buildClient(deps.pool, tenantId));

      // 4. Voucher bauen — SKR-Konto aus der persistierten Kategorisierung (T052:
      //    Single Source of Truth, „angezeigt == gebucht"), dann SKR → Lexoffice-UUID.
      if (resolvedCategoryId === null) {
        const mapper = new CategoryMapper({ pool: deps.pool, client });
        resolvedCategoryId = await mapper.mapSkrToLexoffice(skrAccount, tenantId);
      }
      const voucher = buildBelegVoucher({
        beleg,
        lexofficeCategoryId: resolvedCategoryId,
      });

      // 5. Voucher anlegen (mit Idempotency-Key gegen Duplikate)
      const created = await client.createVoucher(voucher, idempotencyKey);

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
