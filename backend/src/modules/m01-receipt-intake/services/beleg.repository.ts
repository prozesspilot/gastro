/**
 * M01 — Beleg Repository
 *
 * DB-Layer für die `belege`-Tabelle (Migration 030_belege.sql).
 *
 * RLS-Hinweis:
 *   Die belege-Tabelle hat FORCE ROW LEVEL SECURITY. Die Policy prüft
 *   `is_rls_bypassed() OR tenant_id = current_tenant_id()`.
 *
 *   `set_config('app.current_tenant', id, true)` ist LOCAL — wirkt nur innerhalb
 *   einer Transaktion (B2-Fix). Deshalb werden alle Funktionen mit einem
 *   expliziten BEGIN/COMMIT-Block ausgeführt. Der Key MUSS app.current_tenant
 *   heißen (T041), sonst liest current_tenant_id() NULL und die Policy blockt alles.
 *
 * DECISION: Wir verwenden pool.connect() + explizites BEGIN/COMMIT:
 *   1. `set_config(..., true)` ohne TX würde in Auto-Commit sofort gelten und
 *      beim nächsten Query-Cycle von derselben Connection bereits weg sein.
 *   2. insertBeleg schreibt Audit-Log in derselben Tx (GoBD-Atomicity, B1).
 */

import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { logAuditEvent } from '../../../core/audit/audit-log';

// ── Types ──────────────────────────────────────────────────────────────────

export type BelegStatus =
  | 'received'
  | 'extracting'
  | 'extracted'
  | 'categorizing'
  | 'categorized'
  | 'archiving'
  | 'archived'
  | 'exporting'
  | 'exported'
  | 'completed'
  | 'requires_review'
  | 'error';

export type SourceChannel = 'whatsapp' | 'email' | 'web_chat' | 'manual_upload' | 'api' | 'sumup';

/**
 * Vollständiges Beleg-Interface inkl. payload (nur im Detail-Endpoint zurückgeben).
 * M8: payload-Feld nur hier, nicht im List-Interface.
 */
export interface DbBeleg {
  id: string;
  tenant_id: string;
  status: BelegStatus;
  source_channel: SourceChannel;
  source_external_id: string | null;
  received_at: Date;
  file_object_key: string;
  file_mime_type: string;
  file_size_bytes: number;
  file_sha256: string;
  payload: Record<string, unknown>;
  supplier_name: string | null;
  document_date: Date | null;
  total_gross: number | null;
  currency: string;
  category: string | null;
  created_at: Date;
  updated_at: Date;
  /** T015: Soft-Delete-Timestamp. NULL = aktiv, gesetzt = "geloescht". */
  deleted_at: Date | null;
}

/**
 * Listendarstellung ohne payload (M8: payload ist JSONB und kann groß sein —
 * wird nur im Detail-Endpoint zurückgegeben).
 */
export type DbBelegListItem = Omit<DbBeleg, 'payload'>;

/** Explizite Spalten für die List-Query (kein SELECT *) */
const LIST_COLUMNS = [
  'id',
  'tenant_id',
  'status',
  'source_channel',
  'source_external_id',
  'received_at',
  'file_object_key',
  'file_mime_type',
  'file_size_bytes',
  'file_sha256',
  'supplier_name',
  'document_date',
  'total_gross',
  'currency',
  'category',
  'created_at',
  'updated_at',
  'deleted_at',
].join(', ');

// ── Zod-Schema für InsertBelegInput (M2) ──────────────────────────────────
// T033 DECISION: camelCase hier ist BEWUSSTE Ausnahme — dieses Schema ist eine
// interne TypeScript-Grenze zwischen upload.handler.ts und beleg.repository.ts,
// nicht wire-facing. JSON-Felder die extern sichtbar sind (API-Responses) nutzen
// immer snake_case (CLAUDE.md §6.2). Interne TS-Funktionsparameter sind davon
// ausgenommen.

const InsertBelegInputSchema = z.object({
  tenantId: z.string().uuid({ message: 'tenantId muss eine gültige UUID sein' }),
  // T070: web_chat-Eingang (Wirt) zusätzlich zum Staff-Upload — rückwärts-kompatibel.
  sourceChannel: z.enum(['manual_upload', 'web_chat']),
  fileObjectKey: z.string().min(1),
  fileMimeType: z.string().min(1),
  fileSizeBytes: z.number().int().nonnegative(),
  fileSha256: z.string().length(64),
  // Nur beim Staff-Upload gesetzt; beim web_chat-Eingang (Wirt, kein Account) NULL.
  uploadedByUserId: z
    .string()
    .uuid({ message: 'uploadedByUserId muss eine gültige UUID sein' })
    .nullable(),
  originalFilename: z.string().min(1),
});

export type InsertBelegInput = z.infer<typeof InsertBelegInputSchema>;

export interface ListBelegeOptions {
  limit: number;
  offset: number;
  status?: BelegStatus;
}

// ── Interne Helpers ────────────────────────────────────────────────────────

/**
 * Setzt den Tenant-Context für RLS auf der gegebenen Connection.
 * Muss INNERHALB einer Transaktion (nach BEGIN) aufgerufen werden.
 */
async function setTenantContext(client: PoolClient, tenantId: string): Promise<void> {
  // T041: Key MUSS app.current_tenant sein (von RLS-Policy current_tenant_id() gelesen).
  await client.query("SELECT set_config('app.current_tenant', $1, true)", [tenantId]);
}

// ── Repository-Funktionen ──────────────────────────────────────────────────

/**
 * Legt einen neuen Beleg an.
 *
 * Idempotenz: Bei Conflict auf (tenant_id, file_sha256) wird die existierende
 * Row zurückgegeben + isDuplicate=true gesetzt.
 *
 * B1-Atomicity: Audit-Log wird in derselben Transaktion geschrieben.
 * B2-Fix: Explizites BEGIN/COMMIT — set_config LOCAL braucht Transaktion.
 * M2-Fix: Zod-Validierung der Input-UUIDs vor DB-Zugriff.
 *
 * DECISION: ON CONFLICT DO NOTHING + nachfolgendes SELECT statt DO UPDATE,
 * damit die originale Row erhalten bleibt und kein Update-Seiteneffekt entsteht.
 */
export async function insertBeleg(
  pool: Pool,
  input: InsertBelegInput,
): Promise<{ beleg: DbBeleg; isDuplicate: boolean }> {
  // M2: Zod-Validierung der Input-Daten
  const parsed = InsertBelegInputSchema.parse(input);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setTenantContext(client, parsed.tenantId);

    const payload = {
      audit: {
        uploaded_by_user_id: parsed.uploadedByUserId,
      },
      meta: {
        original_filename: parsed.originalFilename,
      },
    };

    const insertResult = await client.query<DbBeleg>(
      `INSERT INTO belege (
         tenant_id, source_channel, file_object_key, file_mime_type,
         file_size_bytes, file_sha256, payload
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
       ON CONFLICT (tenant_id, file_sha256) DO NOTHING
       RETURNING *`,
      [
        parsed.tenantId,
        parsed.sourceChannel,
        parsed.fileObjectKey,
        parsed.fileMimeType,
        parsed.fileSizeBytes,
        parsed.fileSha256,
        JSON.stringify(payload),
      ],
    );

    let beleg: DbBeleg;
    let isDuplicate: boolean;

    if (insertResult.rows.length > 0) {
      beleg = insertResult.rows[0];
      isDuplicate = false;

      // B1: Audit-Log in derselben Tx (GoBD-Atomicity)
      // T070: Staff-Upload → actor 'staff'; web_chat-Eingang (uploadedByUserId NULL)
      // → actor 'customer' (Wirt, kein Account). AuditActor.id erlaubt null.
      await logAuditEvent(client, {
        tenantId: parsed.tenantId,
        entityType: 'beleg',
        entityId: beleg.id,
        eventType: 'beleg.uploaded',
        actor: parsed.uploadedByUserId
          ? { type: 'staff', id: parsed.uploadedByUserId }
          : { type: 'customer', id: null },
        payloadAfter: {
          source_channel: parsed.sourceChannel,
          file_mime_type: parsed.fileMimeType,
          file_size_bytes: parsed.fileSizeBytes,
          original_filename: parsed.originalFilename,
        },
      });
    } else {
      // Conflict-Fall: existierende Row holen
      const existingResult = await client.query<DbBeleg>(
        'SELECT * FROM belege WHERE tenant_id = $1 AND file_sha256 = $2',
        [parsed.tenantId, parsed.fileSha256],
      );

      if (existingResult.rows.length === 0) {
        // Sollte nicht passieren — aber defensiv absichern
        throw new Error(
          `Beleg nicht gefunden nach ON CONFLICT: tenant=${parsed.tenantId.substring(0, 8)}..., sha256=${parsed.fileSha256.substring(0, 16)}...`,
        );
      }

      beleg = existingResult.rows[0];
      isDuplicate = true;
      // DECISION: Kein Audit-Log bei Duplikat-Upload — der ursprüngliche Eintrag bleibt unverändert.
    }

    await client.query('COMMIT');
    return { beleg, isDuplicate };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Listet Belege paginiert, filterbar nach Status.
 * Sortierung: received_at DESC.
 *
 * M8: Verwendet Window-Function COUNT(*) OVER() statt separater COUNT-Query.
 *     payload-Feld wird NICHT zurückgegeben (DbBelegListItem).
 * B2-Fix: Explizites BEGIN/COMMIT.
 */
export async function listBelege(
  pool: Pool,
  tenantId: string,
  opts: ListBelegeOptions,
): Promise<{ belege: DbBelegListItem[]; total: number }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setTenantContext(client, tenantId);

    // M8: Window-Function statt 2 Queries, explizite Spalten statt SELECT *
    // T015: Soft-deleted Belege (deleted_at IS NOT NULL) werden NICHT gelistet.
    const result = await client.query<DbBelegListItem & { total_count: string }>(
      `SELECT ${LIST_COLUMNS},
              COUNT(*) OVER() AS total_count
       FROM belege
       WHERE tenant_id = $1
         AND deleted_at IS NULL
         AND ($2::text IS NULL OR status = $2::text)
       ORDER BY received_at DESC
       LIMIT $3 OFFSET $4`,
      [tenantId, opts.status ?? null, opts.limit, opts.offset],
    );

    await client.query('COMMIT');

    const total = result.rows.length > 0 ? Number.parseInt(result.rows[0].total_count, 10) : 0;

    // total_count aus den Zeilen-Objekten entfernen bevor Return
    const belege = result.rows.map(({ total_count: _tc, ...row }) => row as DbBelegListItem);

    return { belege, total };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Prüft ob ein Beleg mit dem gegebenen SHA256-Hash bereits existiert.
 *
 * N1-Fix: Korrekte RLS-Disziplin — eigener BEGIN/COMMIT-Block mit
 * setTenantContext (LOCAL, set_config mit true), kein session-scoped
 * set_config via pool.query (was Connection-Vergiftung verursachen würde).
 *
 * @returns Beleg-ID + file_object_key + Status oder null wenn nicht gefunden.
 */
export async function getBelegBySha256(
  pool: Pool,
  tenantId: string,
  sha256: string,
): Promise<{
  id: string;
  file_object_key: string;
  status: BelegStatus;
  deleted_at: Date | null;
} | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setTenantContext(client, tenantId);
    // T015 Review-Fix B1: deleted_at jetzt MIT zurückgegeben statt gefiltert.
    // Soft-deleted Belege müssen erkannt werden, damit der Upload-Handler sie
    // "undelete"n kann (siehe undeleteBelegBySha256). Hartes Filtern hier würde
    // dazu führen, dass ein wieder hochgeladener Beleg neu insertet wird —
    // aber der UNIQUE-Constraint (tenant_id, file_sha256) bricht dann.
    const result = await client.query<{
      id: string;
      file_object_key: string;
      status: string;
      deleted_at: Date | null;
    }>(
      'SELECT id, file_object_key, status, deleted_at FROM belege WHERE tenant_id = $1 AND file_sha256 = $2',
      [tenantId, sha256],
    );
    await client.query('COMMIT');
    if (result.rows.length === 0) return null;
    return {
      id: result.rows[0].id,
      file_object_key: result.rows[0].file_object_key,
      status: result.rows[0].status as BelegStatus,
      deleted_at: result.rows[0].deleted_at,
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * T015 Review-Fix B1: "Undelete" eines soft-gelöschten Belegs.
 *
 * Wenn ein Wirt eine bereits gelöschte Datei (gleicher SHA256) erneut hochlädt,
 * wird der existierende Eintrag reaktiviert (deleted_at = NULL) statt eines
 * neuen Inserts. Sonst bricht der UNIQUE-Constraint (tenant_id, file_sha256).
 *
 * GoBD-sauber: keine neue Beleg-ID, Audit-Trail behält alle bisherigen
 * Korrekturen + Soft-Delete-Event + jetzt das Undelete-Event.
 *
 * Atomar in derselben Tx wie das UPDATE + audit_log-Insert.
 */
export async function undeleteBelegBySha256(
  pool: Pool,
  tenantId: string,
  sha256: string,
  actor: { type: 'staff' | 'system' | 'customer'; id: string | null },
): Promise<DbBeleg | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setTenantContext(client, tenantId);

    const updateResult = await client.query<DbBeleg>(
      `UPDATE belege
          SET deleted_at = NULL, updated_at = now()
        WHERE tenant_id = $1
          AND file_sha256 = $2
          AND deleted_at IS NOT NULL
       RETURNING *`,
      [tenantId, sha256],
    );

    if (updateResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return null;
    }

    const beleg = updateResult.rows[0];

    await logAuditEvent(client, {
      tenantId,
      entityType: 'beleg',
      entityId: beleg.id,
      eventType: 'beleg.undeleted',
      actor,
      payloadAfter: { reason: 'sha256_reupload_after_soft_delete' },
    });

    await client.query('COMMIT');
    return beleg;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Holt einen einzelnen Beleg per ID + tenant_id.
 * Gibt null zurück wenn nicht vorhanden oder anderer Tenant (Tenant-Isolation).
 *
 * B2-Fix: Explizites BEGIN/COMMIT.
 */
export async function getBelegById(
  pool: Pool,
  tenantId: string,
  id: string,
): Promise<DbBeleg | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setTenantContext(client, tenantId);

    // T015: Soft-deleted Belege werden im Detail-Endpoint NICHT mehr zurueck-
    // gegeben (UI soll sie nicht oeffnen koennen). Hart-Loeschung erfolgt
    // erst nach Aufbewahrungsfrist via separater Cron-Job.
    const result = await client.query<DbBeleg>(
      'SELECT * FROM belege WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
      [id, tenantId],
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

// ── T015: Manual-Edit-Operationen ──────────────────────────────────────────

/**
 * Felder, die ein Mitarbeiter via PATCH editieren darf (Korrektur des
 * OCR-Ergebnisses). Andere Felder (status, file_*, payload-Intern) sind
 * tabu — die werden vom System/Worker gesetzt.
 *
 * T015-Akzeptanz: Lieferant, Datum, Betrag, MwSt-Satz, Kategorie + Bewirtungs-
 * Felder (Anlass, Teilnehmer) bei Kategorie 'bewirtung'.
 */
export interface UpdateBelegFieldsInput {
  supplier_name?: string | null;
  document_date?: string | null; // ISO YYYY-MM-DD
  total_gross?: number | null;
  currency?: string | null;
  category?: string | null;
  /** MwSt-Satz in Prozent (z. B. 19, 7, 0). Landet in payload.extraction.fields.tax_rate. */
  tax_rate?: number | null;
  /** Bewirtungs-Anlass (Pflicht bei category='bewirtung'). Payload-Feld. */
  bewirtung_anlass?: string | null;
  /** Komma-getrennte Teilnehmer (Pflicht bei category='bewirtung'). Payload-Feld. */
  bewirtung_teilnehmer?: string | null;
}

/**
 * Patcht editierbare Felder eines Belegs.
 *
 * Trennt klar:
 *   * Top-Level-Spalten (supplier_name, document_date, total_gross,
 *     currency, category) werden direkt auf der Row gesetzt.
 *   * Payload-Felder (tax_rate, bewirtung_*) landen in
 *     payload.extraction.fields per jsonb_set.
 *
 * Audit: jede Korrektur erzeugt einen audit_log-Eintrag `beleg.corrected`
 * mit payload_before + payload_after der geaenderten Felder.
 */
export async function updateBelegFields(
  pool: Pool,
  tenantId: string,
  belegId: string,
  patch: UpdateBelegFieldsInput,
  actorUserId: string,
): Promise<DbBeleg | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setTenantContext(client, tenantId);

    // 1. Aktuellen Stand laden (fuer audit + um existierendes payload zu mergen)
    const current = await client.query<DbBeleg>(
      'SELECT * FROM belege WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
      [belegId, tenantId],
    );
    if (current.rows.length === 0) {
      await client.query('COMMIT');
      return null;
    }
    const before = current.rows[0];

    // 2. Top-Level-Spalten — dynamische SET-Klausel
    const sets: string[] = [];
    const values: unknown[] = [];
    let p = 1;
    if (patch.supplier_name !== undefined) {
      sets.push(`supplier_name = $${p++}`);
      values.push(patch.supplier_name);
    }
    if (patch.document_date !== undefined) {
      sets.push(`document_date = $${p++}::date`);
      values.push(patch.document_date);
    }
    if (patch.total_gross !== undefined) {
      sets.push(`total_gross = $${p++}`);
      values.push(patch.total_gross);
    }
    if (patch.currency !== undefined) {
      sets.push(`currency = $${p++}`);
      values.push(patch.currency);
    }
    if (patch.category !== undefined) {
      sets.push(`category = $${p++}`);
      values.push(patch.category);
    }

    // 3. Payload-Felder via jsonb_set (chained falls mehrere)
    const payloadPatches: Array<{ path: string; value: unknown }> = [];
    if (patch.tax_rate !== undefined) {
      payloadPatches.push({ path: '{extraction,fields,tax_rate}', value: patch.tax_rate });
    }
    if (patch.bewirtung_anlass !== undefined) {
      payloadPatches.push({
        path: '{extraction,fields,bewirtung_anlass}',
        value: patch.bewirtung_anlass,
      });
    }
    if (patch.bewirtung_teilnehmer !== undefined) {
      payloadPatches.push({
        path: '{extraction,fields,bewirtung_teilnehmer}',
        value: patch.bewirtung_teilnehmer,
      });
    }

    if (payloadPatches.length > 0) {
      // Build nested jsonb_set call: jsonb_set(jsonb_set(payload, p1, v1), p2, v2), ...
      let expr = "COALESCE(payload, '{}'::jsonb)";
      for (const pp of payloadPatches) {
        expr = `jsonb_set(${expr}, $${p++}, $${p++}::jsonb, true)`;
        values.push(pp.path);
        values.push(JSON.stringify(pp.value));
      }
      sets.push(`payload = ${expr}`);
    }

    if (sets.length === 0) {
      // Nichts zu patchen — return aktuellen Stand
      await client.query('COMMIT');
      return before;
    }

    values.push(belegId, tenantId);
    const updated = await client.query<DbBeleg>(
      `UPDATE belege SET ${sets.join(', ')}
        WHERE id = $${p++} AND tenant_id = $${p++} AND deleted_at IS NULL
        RETURNING *`,
      values,
    );

    // 4. Audit-Log
    // T015 Review-Fix M4: PII-Sanitization im Audit-Log.
    // CLAUDE.md § 6.6 verlangt "NIE PII in Logs". Felder wie
    // `bewirtung_teilnehmer` enthalten echte Personen-Klarnamen — die wir
    // im Audit-Log redacten. Lieferanten-Felder bleiben im Klartext
    // (Geschäftspartner-Daten, GoBD-Nachvollziehbarkeit wichtiger als PII).
    // DSGVO-Auskunft (T010) exportiert audit_log-Einträge mit subject_email,
    // damit ist die Subject-Side abgedeckt.
    const beforePatch: Record<string, unknown> = {};
    const afterPatch: Record<string, unknown> = {};
    for (const key of Object.keys(patch) as Array<keyof UpdateBelegFieldsInput>) {
      if (patch[key] === undefined) continue;
      beforePatch[key] = sanitizeFieldForAudit(key, readBelegField(before, key));
      afterPatch[key] = sanitizeFieldForAudit(key, patch[key]);
    }
    await logAuditEvent(client, {
      tenantId,
      entityType: 'beleg',
      entityId: belegId,
      eventType: 'beleg.corrected',
      actor: { type: 'staff', id: actorUserId },
      payloadBefore: beforePatch,
      payloadAfter: afterPatch,
    });

    await client.query('COMMIT');
    return updated.rows[0] ?? null;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

function readBelegField(beleg: DbBeleg, key: keyof UpdateBelegFieldsInput): unknown {
  if (
    key === 'supplier_name' ||
    key === 'document_date' ||
    key === 'total_gross' ||
    key === 'currency' ||
    key === 'category'
  ) {
    return beleg[key];
  }
  const payload = beleg.payload as { extraction?: { fields?: Record<string, unknown> } };
  return payload.extraction?.fields?.[key] ?? null;
}

/**
 * T015 Review-Fix M4: PII-Felder im Audit-Log redacten.
 *
 * Felder die echte Personen-Klarnamen enthalten dürfen NICHT im Audit-Log
 * im Klartext landen (CLAUDE.md § 6.6 + DSGVO-Datenminimierung). Wir loggen
 * dass das Feld geändert wurde (für GoBD-Nachvollziehbarkeit), aber nicht
 * mit welchem Wert.
 *
 * Liste der PII-Felder bewusst klein gehalten. supplier_name bleibt Klartext
 * (meist Firmenname = keine PII im strikten Sinn).
 */
const PII_FIELDS = new Set(['bewirtung_teilnehmer', 'bewirtung_anlass']);

function sanitizeFieldForAudit(key: string, value: unknown): unknown {
  if (PII_FIELDS.has(key) && value !== null && value !== undefined) {
    const length = typeof value === 'string' ? value.length : 0;
    return { redacted: true, type: typeof value, length };
  }
  return value;
}

/**
 * Soft-Delete: setzt deleted_at, behaelt die Row fuer GoBD-Aufbewahrungspflicht.
 * Audit-Log: beleg.soft_deleted.
 */
export async function softDeleteBeleg(
  pool: Pool,
  tenantId: string,
  belegId: string,
  actorUserId: string,
  reason?: string,
): Promise<DbBeleg | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setTenantContext(client, tenantId);

    const result = await client.query<DbBeleg>(
      `UPDATE belege
          SET deleted_at = now()
        WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
        RETURNING *`,
      [belegId, tenantId],
    );
    if (result.rows.length === 0) {
      await client.query('COMMIT');
      return null;
    }

    await logAuditEvent(client, {
      tenantId,
      entityType: 'beleg',
      entityId: belegId,
      eventType: 'beleg.soft_deleted',
      actor: { type: 'staff', id: actorUserId },
      payloadAfter: { reason: reason ?? null },
    });

    await client.query('COMMIT');
    return result.rows[0];
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * T007/M01 — Status-Update für FSM-Übergänge (received → extracting → extracted/
 * requires_review/error). Schreibt zusätzlich einen audit_log-Eintrag in
 * derselben Transaktion (GoBD-Atomicity).
 *
 * Kein Side-Effect auf payload — dafür gibt es updateBelegOcrResult.
 *
 * Akzeptierte Zielstatus: 'extracting', 'extracted', 'requires_review', 'error'.
 * Wird ein anderer Übergang angefragt, wirft die Funktion (defensive Absicherung
 * gegen falsche Verwendung).
 */
export async function updateBelegStatus(
  pool: Pool,
  tenantId: string,
  belegId: string,
  newStatus: BelegStatus,
  audit: { actorType: 'system' | 'staff'; actorId: string; reason?: string } = {
    actorType: 'system',
    actorId: 'module:M01-OCR',
  },
): Promise<DbBeleg | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setTenantContext(client, tenantId);

    const current = await client.query<{ status: BelegStatus }>(
      'SELECT status FROM belege WHERE id = $1 AND tenant_id = $2',
      [belegId, tenantId],
    );
    if (current.rows.length === 0) {
      await client.query('COMMIT');
      return null;
    }
    const oldStatus = current.rows[0].status;

    const updateResult = await client.query<DbBeleg>(
      `UPDATE belege
         SET status = $3
       WHERE id = $1 AND tenant_id = $2
       RETURNING *`,
      [belegId, tenantId, newStatus],
    );

    await logAuditEvent(client, {
      tenantId,
      entityType: 'beleg',
      entityId: belegId,
      eventType: 'beleg.status_changed',
      actor: { type: audit.actorType, id: audit.actorId },
      payloadBefore: { status: oldStatus },
      payloadAfter: { status: newStatus, reason: audit.reason ?? null },
    });

    await client.query('COMMIT');
    return updateResult.rows[0] ?? null;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * T048/F2 — Schreibt das Kategorisier-Ergebnis: Status (categorized/requires_review),
 * denormalisierte `category`-Spalte und `payload.categorization`. Transaktional mit
 * Audit (`beleg.categorized`). Vorlage: updateBelegOcrResult.
 */
export async function updateBelegCategorization(
  pool: Pool,
  tenantId: string,
  belegId: string,
  input: {
    newStatus: 'categorized' | 'requires_review';
    category: string;
    categorization: {
      engine: string;
      category: string;
      category_label: string;
      skr_account: string | null;
      skr_chart: string;
      confidence: number;
      rationale: string;
      categorized_at: string;
    };
    audit: { actorType: 'system' | 'staff'; actorId: string };
  },
): Promise<DbBeleg | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setTenantContext(client, tenantId);

    const currentRow = await client.query<{
      status: BelegStatus;
      payload: Record<string, unknown>;
    }>('SELECT status, payload FROM belege WHERE id = $1 AND tenant_id = $2', [belegId, tenantId]);
    if (currentRow.rows.length === 0) {
      await client.query('COMMIT');
      return null;
    }
    const oldStatus = currentRow.rows[0].status;
    const existingPayload = currentRow.rows[0].payload ?? {};
    const auditEvents = Array.isArray(
      (existingPayload as { audit?: { events?: unknown[] } }).audit?.events,
    )
      ? (existingPayload as { audit: { events: unknown[] } }).audit.events
      : [];

    const newPayload: Record<string, unknown> = {
      ...existingPayload,
      categorization: input.categorization,
      audit: {
        ...((existingPayload as { audit?: Record<string, unknown> }).audit ?? {}),
        events: [
          ...auditEvents,
          {
            at: input.categorization.categorized_at,
            type: input.newStatus,
            actor: { type: input.audit.actorType, id: input.audit.actorId },
          },
        ],
      },
    };

    const updateResult = await client.query<DbBeleg>(
      `UPDATE belege
         SET status = $3, category = $4, payload = $5
       WHERE id = $1 AND tenant_id = $2
       RETURNING *`,
      [belegId, tenantId, input.newStatus, input.category, JSON.stringify(newPayload)],
    );

    await logAuditEvent(client, {
      tenantId,
      entityType: 'beleg',
      entityId: belegId,
      eventType: 'beleg.categorized',
      actor: { type: input.audit.actorType, id: input.audit.actorId },
      payloadBefore: { status: oldStatus },
      payloadAfter: {
        status: input.newStatus,
        category: input.category,
        skr_account: input.categorization.skr_account,
        confidence: input.categorization.confidence,
        engine: input.categorization.engine,
      },
    });

    await client.query('COMMIT');
    return updateResult.rows[0] ?? null;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * T007/M01 — Schreibt das OCR-Ergebnis in belege.payload und setzt den
 * Folge-Status (extracted / requires_review). Optional werden denormalisierte
 * Felder (supplier_name, document_date, total_gross) auf dem Row mit-aktualisiert.
 *
 * Idempotenz: zweimal mit demselben Ergebnis aufrufen erzeugt zwei Audit-Einträge
 * mit identischer payload_after — der Aufrufer (OCRService) prüft vorher per
 * Status, ob ein Re-Run nötig ist.
 */
export async function updateBelegOcrResult(
  pool: Pool,
  tenantId: string,
  belegId: string,
  input: {
    newStatus: 'extracted' | 'requires_review';
    extraction: {
      engine: string;
      engine_version: string;
      confidence: number;
      raw_text: string;
      fields: Record<string, unknown>;
      warnings: string[];
    };
    validation: {
      is_valid: boolean;
      issues: Array<{ code: string; field?: string; message: string }>;
      checks: Record<string, boolean>;
    };
    denormalized?: {
      supplier_name?: string | null;
      document_date?: string | null;
      total_gross?: number | null;
      currency?: string | null;
      /** T008: Top-Level category aus dem Bewirtungs-Detector. */
      category?: string | null;
    };
    audit: { actorType: 'system' | 'staff'; actorId: string };
    /** T008: optionale Bewirtungs-Sektion in payload (nur wenn Detector match). */
    bewirtung?: Record<string, unknown>;
  },
): Promise<DbBeleg | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setTenantContext(client, tenantId);

    const currentRow = await client.query<{
      status: BelegStatus;
      payload: Record<string, unknown>;
    }>('SELECT status, payload FROM belege WHERE id = $1 AND tenant_id = $2', [belegId, tenantId]);
    if (currentRow.rows.length === 0) {
      await client.query('COMMIT');
      return null;
    }
    const oldStatus = currentRow.rows[0].status;
    const existingPayload = currentRow.rows[0].payload ?? {};

    const auditEvents = Array.isArray(
      (existingPayload as { audit?: { events?: unknown[] } }).audit?.events,
    )
      ? (existingPayload as { audit: { events: unknown[] } }).audit.events
      : [];

    const newPayload: Record<string, unknown> = {
      ...existingPayload,
      extraction: input.extraction,
      validation: input.validation,
      audit: {
        ...((existingPayload as { audit?: Record<string, unknown> }).audit ?? {}),
        events: [
          ...auditEvents,
          {
            at: new Date().toISOString(),
            type: input.newStatus === 'extracted' ? 'beleg.extracted' : 'beleg.requires_review',
            actor: { type: input.audit.actorType, id: input.audit.actorId },
            engine: input.extraction.engine,
            confidence: input.extraction.confidence,
          },
        ],
      },
    };
    // T008: Bewirtungs-Sektion nur einbetten wenn Detector ein Ergebnis lieferte.
    if (input.bewirtung) {
      newPayload.bewirtung = input.bewirtung;
    }

    const denorm = input.denormalized ?? {};
    const updateResult = await client.query<DbBeleg>(
      `UPDATE belege
         SET status = $3,
             payload = $4::jsonb,
             supplier_name = COALESCE($5, supplier_name),
             document_date = COALESCE($6::date, document_date),
             total_gross = COALESCE($7, total_gross),
             currency = COALESCE($8, currency),
             category = COALESCE($9, category)
       WHERE id = $1 AND tenant_id = $2
       RETURNING *`,
      [
        belegId,
        tenantId,
        input.newStatus,
        JSON.stringify(newPayload),
        denorm.supplier_name ?? null,
        denorm.document_date ?? null,
        denorm.total_gross ?? null,
        denorm.currency ?? null,
        denorm.category ?? null,
      ],
    );

    await logAuditEvent(client, {
      tenantId,
      entityType: 'beleg',
      entityId: belegId,
      eventType: 'beleg.ocr_completed',
      actor: { type: input.audit.actorType, id: input.audit.actorId },
      payloadBefore: { status: oldStatus },
      payloadAfter: {
        status: input.newStatus,
        engine: input.extraction.engine,
        confidence: input.extraction.confidence,
        is_valid: input.validation.is_valid,
      },
    });

    await client.query('COMMIT');
    return updateResult.rows[0] ?? null;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * T007/M01 — Schreibt einen OCR-Fehler in belege.payload und setzt Status='error'.
 * Wird nach 3 Retries vom Worker aufgerufen.
 */
export async function markBelegOcrFailed(
  pool: Pool,
  tenantId: string,
  belegId: string,
  errorMessage: string,
  attempts: number,
): Promise<DbBeleg | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setTenantContext(client, tenantId);

    const currentRow = await client.query<{
      status: BelegStatus;
      payload: Record<string, unknown>;
    }>('SELECT status, payload FROM belege WHERE id = $1 AND tenant_id = $2', [belegId, tenantId]);
    if (currentRow.rows.length === 0) {
      await client.query('COMMIT');
      return null;
    }
    const oldStatus = currentRow.rows[0].status;
    const existingPayload = currentRow.rows[0].payload ?? {};

    const newPayload = {
      ...existingPayload,
      ocr_error: {
        message: errorMessage,
        attempts,
        failed_at: new Date().toISOString(),
      },
    };

    const updateResult = await client.query<DbBeleg>(
      `UPDATE belege
         SET status = 'error',
             payload = $3::jsonb
       WHERE id = $1 AND tenant_id = $2
       RETURNING *`,
      [belegId, tenantId, JSON.stringify(newPayload)],
    );

    await logAuditEvent(client, {
      tenantId,
      entityType: 'beleg',
      entityId: belegId,
      eventType: 'beleg.ocr_failed',
      actor: { type: 'system', id: 'module:M01-OCR' },
      payloadBefore: { status: oldStatus },
      payloadAfter: { status: 'error', error: errorMessage, attempts },
    });

    await client.query('COMMIT');
    return updateResult.rows[0] ?? null;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * T007/M01 — Cost-Tracking: zählt den OCR-API-Call pro Tenant pro Tag hoch
 * und gibt den neuen Counter zurück. Schützt vor Runaway-Kosten.
 *
 * UPSERT auf (tenant_id, day, engine). Kein RLS-Konflikt: setTenantContext.
 */
export async function incrementOcrCallCount(
  pool: Pool,
  tenantId: string,
  belegId: string,
  engine: string,
): Promise<{ call_count: number; day: string }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setTenantContext(client, tenantId);

    const result = await client.query<{ call_count: number; day: string }>(
      `INSERT INTO ocr_cost_log (tenant_id, day, engine, call_count, last_beleg_id)
       VALUES ($1, CURRENT_DATE, $2, 1, $3)
       ON CONFLICT (tenant_id, day, engine)
       DO UPDATE SET call_count = ocr_cost_log.call_count + 1,
                     last_beleg_id = EXCLUDED.last_beleg_id
       RETURNING call_count, day`,
      [tenantId, engine, belegId],
    );

    await client.query('COMMIT');
    return result.rows[0];
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * T007/M01 — Liest den heutigen Counter ohne Hochzählen — für Vorab-Limit-Check
 * (verhindert dass das 1001. Beleg-File überhaupt an Vision geschickt wird).
 */
export async function getOcrCallCountToday(
  pool: Pool,
  tenantId: string,
  engine: string,
): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setTenantContext(client, tenantId);

    const result = await client.query<{ call_count: number }>(
      `SELECT COALESCE(call_count, 0) AS call_count
         FROM ocr_cost_log
        WHERE tenant_id = $1 AND day = CURRENT_DATE AND engine = $2`,
      [tenantId, engine],
    );

    await client.query('COMMIT');
    return result.rows[0]?.call_count ?? 0;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
